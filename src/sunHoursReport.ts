import { tracker as trackerCfg } from "./config";
import { getDate, getLocation, getTrackerGeometry, getTrackingModeAt } from "./appState";
import { computeShadeMatrix, type ShadeMatrixResult } from "./shadeAnalysis";

const CELL_WIDTH_PX = 6;
const HEATMAP_CELL_HEIGHT_PX = 1; // kept short so the live top-down 3D view stays visible above the panel
const GRAPH_HEIGHT_PX = 60;

function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Grey/green binary heatmap: grey = not under direct sunlight (night OR shaded by a row),
// green = under direct sunlight. X = ground east-west position, Y = time of day.
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
      const sunlit = matrix.sunUp[ti] && !matrix.shaded[ti][xi];
      ctx.fillStyle = sunlit ? "#3ba55c" : "#6b7280";
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

// Per-x total hours of direct (unshaded, daytime) sunlight within [startMinutes, endMinutes).
function computeSunHoursByX(matrix: ShadeMatrixResult, startMinutes: number, endMinutes: number): number[] {
  const xCount = matrix.xEdges.length - 1;
  const sums = new Array(xCount).fill(0);
  const timeStepHours =
    matrix.timeMinutes.length > 1 ? (matrix.timeMinutes[1] - matrix.timeMinutes[0]) / 60 : 0;

  matrix.timeMinutes.forEach((minutes, ti) => {
    if (minutes < startMinutes || minutes >= endMinutes || !matrix.sunUp[ti]) return;
    for (let xi = 0; xi < xCount; xi++) {
      if (!matrix.shaded[ti][xi]) sums[xi] += timeStepHours;
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
    '<span class="sun-hours-legend-swatch sun-hours-legend-green"></span> Direct sunlight' +
    '<span class="sun-hours-legend-swatch sun-hours-legend-grey"></span> Shaded / night';
  panel.appendChild(legend);

  // Dual-handle range slider (two overlaid native <input type="range">, thumbs only clickable —
  // a standard lightweight pattern, see style.css) selecting which hours of the day the graph
  // below sums over.
  const rangeWrap = document.createElement("div");
  rangeWrap.className = "sun-hours-range";
  const rangeStartInput = document.createElement("input");
  rangeStartInput.type = "range";
  rangeStartInput.min = "0";
  rangeStartInput.max = String(24 * 60);
  rangeStartInput.step = "15";
  rangeStartInput.value = String(rangeStartMinutes);
  const rangeEndInput = document.createElement("input");
  rangeEndInput.type = "range";
  rangeEndInput.min = "0";
  rangeEndInput.max = String(24 * 60);
  rangeEndInput.step = "15";
  rangeEndInput.value = String(rangeEndMinutes);
  rangeWrap.appendChild(rangeStartInput);
  rangeWrap.appendChild(rangeEndInput);
  panel.appendChild(rangeWrap);

  const rangeLabel = document.createElement("div");
  rangeLabel.className = "sun-hours-range-label";
  panel.appendChild(rangeLabel);

  const graphTitle = document.createElement("div");
  graphTitle.className = "sun-hours-panel-title";
  graphTitle.textContent = "Cumulative sun hours by position, for the selected window";
  panel.appendChild(graphTitle);

  const graphWrap = document.createElement("div");
  graphWrap.className = "sun-hours-heatmap-wrap";
  panel.appendChild(graphWrap);

  function refreshRangeLabel(): void {
    rangeLabel.textContent = `Sum window: ${formatClock(rangeStartMinutes)} - ${formatClock(rangeEndMinutes)}`;
  }

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

  rangeStartInput.addEventListener("input", () => {
    rangeStartMinutes = Math.min(Number(rangeStartInput.value), rangeEndMinutes - 15);
    rangeStartInput.value = String(rangeStartMinutes);
    refreshRangeLabel();
    renderGraph();
  });
  rangeEndInput.addEventListener("input", () => {
    rangeEndMinutes = Math.max(Number(rangeEndInput.value), rangeStartMinutes + 15);
    rangeEndInput.value = String(rangeEndMinutes);
    refreshRangeLabel();
    renderGraph();
  });

  function renderHeatmap(): void {
    heatmapWrap.replaceChildren();
    const location = getLocation();
    const date = getDate();
    const geometry = getTrackerGeometry();
    const fieldHalfWidthM = ((trackerCfg.rowCount - 1) / 2) * geometry.rowSpacingM + geometry.rowSpacingM;
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
      xMin: -fieldHalfWidthM,
      xMax: fieldHalfWidthM,
      xBucketCount: 90,
      timeStepMinutes: 15,
    });

    heatmapWrap.appendChild(createHeatmapYAxis(latestMatrix));
    const canvasWrap = document.createElement("div");
    canvasWrap.className = "sun-hours-heatmap-canvas-wrap";
    canvasWrap.appendChild(createHeatmapCanvas(latestMatrix));
    canvasWrap.appendChild(createXAxis(latestMatrix));
    heatmapWrap.appendChild(canvasWrap);
  }

  function refresh(): void {
    renderHeatmap();
    refreshRangeLabel();
    renderGraph();
  }

  refresh();

  return { element: panel, refresh };
}
