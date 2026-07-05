import { tracker as trackerCfg } from "./config";
import { getDate, getLocation, getTrackerGeometry, getTrackingModeAt } from "./appState";
import { computeShadeMatrix, type ShadeMatrixResult } from "./shadeAnalysis";
import { computeFieldHalfWidthM } from "./trackerMath";
import { createClearSkyIrradianceProvider } from "./irradiance";

const irradianceProvider = createClearSkyIrradianceProvider();

// Same two-stop gradient as groundRadiationOverlay.ts's live 3D overlay (kept as a separate,
// duplicated constant rather than a shared import, since that module pulls in three.js and this
// one is deliberately DOM-only) — dark indigo (heavily shaded) to warm yellow (full unshaded GHI).
const LOW_COLOR = { r: 30, g: 30, b: 70 };
const HIGH_COLOR = { r: 255, g: 210, b: 60 };

function colorForPercent(percent: number): string {
  const t = Math.max(0, Math.min(1, percent / 100));
  const r = Math.round(LOW_COLOR.r + (HIGH_COLOR.r - LOW_COLOR.r) * t);
  const g = Math.round(LOW_COLOR.g + (HIGH_COLOR.g - LOW_COLOR.g) * t);
  const b = Math.round(LOW_COLOR.b + (HIGH_COLOR.b - LOW_COLOR.b) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

export const X_BUCKET_COUNT = 90;
const CELL_WIDTH_PX = 9; // 90 * 9 = 810px — ~50% wider than the original 6px cells, to better fill
// the space above freed up by the shorter heatmap and let the top-down camera zoom (main.ts) match
export const HEATMAP_CANVAS_WIDTH_PX = X_BUCKET_COUNT * CELL_WIDTH_PX;
const HEATMAP_CELL_HEIGHT_PX = 1; // kept short so the live top-down 3D view stays visible above the panel
const GRAPH_HEIGHT_PX = 60;
const MIN_RANGE_MINUTES = 15;

function formatClock(minutes: number): string {
  if (minutes >= 24 * 60) return "24:00"; // the range handle's end can sit exactly at midnight-of-next-day
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Continuous radiation-percentage heatmap (0-100% of unshaded GHI) — same color gradient as the
// live 3D ground overlay, so the two visualizations read consistently. X = ground east-west
// position, Y = time of day.
function createHeatmapCanvas(matrix: ShadeMatrixResult): HTMLCanvasElement {
  const xCount = matrix.xEdges.length - 1;
  const yCount = matrix.timeMinutes.length;

  const canvas = document.createElement("canvas");
  canvas.width = xCount * CELL_WIDTH_PX;
  canvas.height = yCount * HEATMAP_CELL_HEIGHT_PX;
  canvas.className = "sun-hours-heatmap-canvas";

  const ctx = canvas.getContext("2d")!;
  for (let ti = 0; ti < yCount; ti++) {
    for (let xi = 0; xi < xCount; xi++) {
      ctx.fillStyle = colorForPercent(matrix.percentOfGHI[ti][xi]);
      ctx.fillRect(xi * CELL_WIDTH_PX, ti * HEATMAP_CELL_HEIGHT_PX, CELL_WIDTH_PX, HEATMAP_CELL_HEIGHT_PX);
    }
  }
  return canvas;
}

function createHeatmapYAxis(matrix: ShadeMatrixResult): HTMLElement {
  const axis = document.createElement("div");
  axis.className = "sun-hours-axis-y";
  const stepMinutes = 360; // 6h between labels — matrix rows are only 1px tall so labels need spacing
  matrix.timeMinutes.forEach((minutes, i) => {
    if (minutes % stepMinutes === 0) {
      const label = document.createElement("span");
      label.textContent = formatClock(minutes);
      label.style.top = `${i * HEATMAP_CELL_HEIGHT_PX}px`;
      axis.appendChild(label);
    }
  });
  return axis;
}

// Simple two-label y-axis (0 and the max value) for the sun-hours graph, which plots a
// magnitude (hours) rather than a time-of-day.
function createValueYAxis(maxVal: number): HTMLElement {
  const axis = document.createElement("div");
  axis.className = "sun-hours-axis-y";
  const zeroLabel = document.createElement("span");
  zeroLabel.textContent = "0h";
  zeroLabel.style.top = `${GRAPH_HEIGHT_PX}px`;
  axis.appendChild(zeroLabel);
  const maxLabel = document.createElement("span");
  maxLabel.textContent = `${maxVal.toFixed(1)}h`;
  maxLabel.style.top = "4px";
  axis.appendChild(maxLabel);
  return axis;
}

function createXAxis(matrix: ShadeMatrixResult): HTMLElement {
  const axis = document.createElement("div");
  axis.className = "sun-hours-axis-x";
  const xMin = matrix.xEdges[0];
  const xMax = matrix.xEdges[matrix.xEdges.length - 1];
  const step = 10; // meters between labels
  for (let x = Math.ceil(xMin / step) * step; x <= xMax; x += step) {
    const label = document.createElement("span");
    label.textContent = `${x}m`;
    label.style.left = `${((x - xMin) / (xMax - xMin)) * (matrix.xEdges.length - 1) * CELL_WIDTH_PX}px`;
    axis.appendChild(label);
  }
  return axis;
}

// Per-x cumulative "effective full-sun hours" within [startMinutes, endMinutes) — each time
// sample contributes (percentOfGHI/100) * timeStepHours, rather than a plain binary sunlit-hour
// count, so a partially-shaded point (getting only view-factor-weighted diffuse light) counts for
// a fraction of an hour instead of either a whole hour or none.
function computeSunHoursByX(matrix: ShadeMatrixResult, startMinutes: number, endMinutes: number): number[] {
  const xCount = matrix.xEdges.length - 1;
  const sums = new Array(xCount).fill(0);
  const timeStepHours =
    matrix.timeMinutes.length > 1 ? (matrix.timeMinutes[1] - matrix.timeMinutes[0]) / 60 : 0;

  matrix.timeMinutes.forEach((minutes, ti) => {
    if (minutes < startMinutes || minutes >= endMinutes || !matrix.sunUp[ti]) return;
    for (let xi = 0; xi < xCount; xi++) {
      sums[xi] += (matrix.percentOfGHI[ti][xi] / 100) * timeStepHours;
    }
  });
  return sums;
}

// Filled line chart of cumulative sun-hours per ground x-position, for the currently selected
// [startMinutes, endMinutes) window — sits directly under the heatmap and shares its x-axis.
function createSunHoursGraphCanvas(sums: number[]): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = sums.length * CELL_WIDTH_PX;
  canvas.height = GRAPH_HEIGHT_PX;
  canvas.className = "sun-hours-graph-canvas";

  const ctx = canvas.getContext("2d")!;
  const maxVal = Math.max(1e-6, ...sums);
  const padTop = 4;
  const padBottom = 2;
  const plotHeight = GRAPH_HEIGHT_PX - padTop - padBottom;
  const xAt = (i: number) => i * CELL_WIDTH_PX + CELL_WIDTH_PX / 2;
  const yAt = (v: number) => GRAPH_HEIGHT_PX - padBottom - (v / maxVal) * plotHeight;

  ctx.beginPath();
  sums.forEach((v, i) => {
    const x = xAt(i);
    const y = yAt(v);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.lineTo(xAt(sums.length - 1), GRAPH_HEIGHT_PX);
  ctx.lineTo(xAt(0), GRAPH_HEIGHT_PX);
  ctx.closePath();
  ctx.fillStyle = "rgba(59, 165, 92, 0.3)";
  ctx.fill();

  ctx.beginPath();
  sums.forEach((v, i) => {
    const x = xAt(i);
    const y = yAt(v);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#3ba55c";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  return canvas;
}

export interface SunHoursPanel {
  element: HTMLElement;
  // Recomputes the shade matrix and redraws the heatmap + graph from the current
  // geometry/location/date — called on creation and again whenever those change while the panel
  // stays open, so the panel stays in sync with the geometry-control and location-picker panels
  // that remain live alongside the top-down 3D view (see main.ts's report-mode toggle).
  refresh(): void;
}

// A compact overlay panel (not a separate page) meant to sit alongside the live 3D scene while
// it's temporarily viewed from a still top-down angle — the "top view" is that real scene, not a
// schematic drawing, so this panel only needs to add what the 3D view can't show: the full-day
// shading heatmap and a cumulative sun-hours summary graph for a user-selected hour range.
export function createSunHoursPanel(): SunHoursPanel {
  let latestMatrix: ShadeMatrixResult | null = null;
  let rangeStartMinutes = 0;
  let rangeEndMinutes = 24 * 60;

  const panel = document.createElement("div");
  panel.className = "sun-hours-panel";

  const title = document.createElement("div");
  title.className = "sun-hours-panel-title";
  title.textContent = "Cumulative sun hours — ground shading, east-west cross section across the day";
  panel.appendChild(title);

  const heatmapWrap = document.createElement("div");
  heatmapWrap.className = "sun-hours-heatmap-wrap";
  panel.appendChild(heatmapWrap);

  const legend = document.createElement("div");
  legend.className = "sun-hours-legend";
  legend.innerHTML =
    `<span>0%</span><span class="sun-hours-legend-gradient"></span><span>100% of unshaded GHI</span>`;
  panel.appendChild(legend);

  const graphTitle = document.createElement("div");
  graphTitle.className = "sun-hours-panel-title";
  graphTitle.textContent = "Cumulative sun hours by position, for the selected window";
  panel.appendChild(graphTitle);

  const graphWrap = document.createElement("div");
  graphWrap.className = "sun-hours-heatmap-wrap";
  panel.appendChild(graphWrap);

  function renderGraph(): void {
    if (!latestMatrix) return;
    graphWrap.replaceChildren();
    const sums = computeSunHoursByX(latestMatrix, rangeStartMinutes, rangeEndMinutes);
    graphWrap.appendChild(createValueYAxis(Math.max(1e-6, ...sums)));
    const canvasWrap = document.createElement("div");
    canvasWrap.className = "sun-hours-heatmap-canvas-wrap";
    canvasWrap.appendChild(createSunHoursGraphCanvas(sums));
    canvasWrap.appendChild(createXAxis(latestMatrix));
    graphWrap.appendChild(canvasWrap);
  }

  // Two draggable horizontal lines overlaid directly on the heatmap matrix — dragging either one
  // up/down defines the [start, end) time-of-day window the graph below sums over. Each handle's
  // hit area extends into the gutter between the hour labels and the canvas (where its own
  // floating time label lives) and its visible line stretches all the way across the matrix.
  function attachRangeHandle(handle: HTMLElement, label: HTMLElement, which: "start" | "end", canvasHeightPx: number): void {
    function minutesToY(minutes: number): number {
      return (minutes / (24 * 60)) * canvasHeightPx;
    }
    function reposition(): void {
      const minutes = which === "start" ? rangeStartMinutes : rangeEndMinutes;
      handle.style.top = `${minutesToY(minutes)}px`;
      label.textContent = formatClock(minutes);
    }
    reposition();

    handle.addEventListener("pointerdown", (event) => {
      handle.setPointerCapture(event.pointerId);
      handle.classList.add("is-dragging");
      const wrapRect = handle.parentElement!.getBoundingClientRect();

      function onMove(moveEvent: PointerEvent): void {
        const relY = moveEvent.clientY - wrapRect.top;
        const clampedY = Math.min(Math.max(relY, 0), canvasHeightPx);
        let minutes = Math.round((clampedY / canvasHeightPx) * (24 * 60) / 15) * 15;
        if (which === "start") {
          minutes = Math.min(minutes, rangeEndMinutes - MIN_RANGE_MINUTES);
          rangeStartMinutes = Math.max(0, minutes);
        } else {
          minutes = Math.max(minutes, rangeStartMinutes + MIN_RANGE_MINUTES);
          rangeEndMinutes = Math.min(24 * 60, minutes);
        }
        reposition();
        renderGraph();
      }
      function onUp(upEvent: PointerEvent): void {
        handle.releasePointerCapture(upEvent.pointerId);
        handle.classList.remove("is-dragging");
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
      }
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
    });
  }

  function renderHeatmap(): void {
    heatmapWrap.replaceChildren();
    const location = getLocation();
    const date = getDate();
    const geometry = getTrackerGeometry();
    const fieldHalfWidthM = computeFieldHalfWidthM(trackerCfg.rowCount, geometry.rowSpacingM);
    latestMatrix = computeShadeMatrix({
      dateState: date,
      latitude: location.latitude,
      longitude: location.longitude,
      axisAzimuthDeg: geometry.axisAzimuthDeg,
      maxRotationDeg: trackerCfg.maxRotationDeg,
      moduleLengthM: geometry.moduleLengthM,
      hubHeightM: geometry.hubHeightM,
      rowSpacingM: geometry.rowSpacingM,
      rowCount: trackerCfg.rowCount,
      getTrackingModeAt,
      irradianceProvider,
      xMin: -fieldHalfWidthM,
      xMax: fieldHalfWidthM,
      xBucketCount: X_BUCKET_COUNT,
      timeStepMinutes: 15,
    });

    heatmapWrap.appendChild(createHeatmapYAxis(latestMatrix));
    const canvasWrap = document.createElement("div");
    canvasWrap.className = "sun-hours-heatmap-canvas-wrap";
    const heatmapCanvas = createHeatmapCanvas(latestMatrix);
    canvasWrap.appendChild(heatmapCanvas);
    canvasWrap.appendChild(createXAxis(latestMatrix));

    const canvasHeightPx = latestMatrix.timeMinutes.length * HEATMAP_CELL_HEIGHT_PX;
    for (const which of ["start", "end"] as const) {
      const handle = document.createElement("div");
      handle.className = "sun-hours-range-handle";
      const label = document.createElement("span");
      label.className = "sun-hours-range-handle-label";
      handle.appendChild(label);
      canvasWrap.appendChild(handle);
      attachRangeHandle(handle, label, which, canvasHeightPx);
    }

    heatmapWrap.appendChild(canvasWrap);
  }

  function refresh(): void {
    renderHeatmap();
    renderGraph();
  }

  refresh();

  return { element: panel, refresh };
}
