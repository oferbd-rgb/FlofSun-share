import { tracker as trackerCfg } from "./config";
import { getDate, getLocation, getTrackerGeometry, getTrackingModeAt, getTrackingSchedule, HALF_HOURS_PER_DAY } from "./appState";
import { computeShadeMatrix, type ShadeMatrixResult } from "./shadeAnalysis";

function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatDate({ year, month, day }: { year: number; month: number; day: number }): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Collapses the 48-slot schedule into contiguous anti-tracking ranges for display, e.g.
// "07:00-10:30, 14:00-15:30" instead of listing all 48 slots.
function summarizeAntiTrackWindows(): string {
  const schedule = getTrackingSchedule();
  const ranges: string[] = [];
  let rangeStart: number | null = null;
  for (let i = 0; i <= HALF_HOURS_PER_DAY; i++) {
    const isAnti = i < HALF_HOURS_PER_DAY && schedule[i] === "anti-track";
    if (isAnti && rangeStart === null) {
      rangeStart = i;
    } else if (!isAnti && rangeStart !== null) {
      ranges.push(`${formatClock(rangeStart * 30)}-${formatClock(i * 30)}`);
      rangeStart = null;
    }
  }
  return ranges.length > 0 ? ranges.join(", ") : "none (tracking all day)";
}

// Grey/green binary heatmap: grey = not under direct sunlight (night OR shaded by a row),
// green = under direct sunlight. X = ground east-west position, Y = time of day.
function createHeatmapCanvas(matrix: ShadeMatrixResult): HTMLCanvasElement {
  const cellWidthPx = 6;
  const cellHeightPx = 4;
  const xCount = matrix.xEdges.length - 1;
  const yCount = matrix.timeMinutes.length;

  const canvas = document.createElement("canvas");
  canvas.width = xCount * cellWidthPx;
  canvas.height = yCount * cellHeightPx;
  canvas.className = "sun-hours-heatmap-canvas";

  const ctx = canvas.getContext("2d")!;
  for (let ti = 0; ti < yCount; ti++) {
    for (let xi = 0; xi < xCount; xi++) {
      const sunlit = matrix.sunUp[ti] && !matrix.shaded[ti][xi];
      ctx.fillStyle = sunlit ? "#3ba55c" : "#6b7280";
      ctx.fillRect(xi * cellWidthPx, ti * cellHeightPx, cellWidthPx, cellHeightPx);
    }
  }
  return canvas;
}

function createHeatmapXAxis(matrix: ShadeMatrixResult, cellWidthPx: number): HTMLElement {
  const axis = document.createElement("div");
  axis.className = "sun-hours-axis-x";
  const xMin = matrix.xEdges[0];
  const xMax = matrix.xEdges[matrix.xEdges.length - 1];
  const step = 10; // meters between labels
  for (let x = Math.ceil(xMin / step) * step; x <= xMax; x += step) {
    const label = document.createElement("span");
    label.textContent = `${x}m`;
    label.style.left = `${((x - xMin) / (xMax - xMin)) * (matrix.xEdges.length - 1) * cellWidthPx}px`;
    axis.appendChild(label);
  }
  return axis;
}

function createHeatmapYAxis(matrix: ShadeMatrixResult, cellHeightPx: number): HTMLElement {
  const axis = document.createElement("div");
  axis.className = "sun-hours-axis-y";
  const stepMinutes = 120; // 2h between labels
  matrix.timeMinutes.forEach((minutes, i) => {
    if (minutes % stepMinutes === 0) {
      const label = document.createElement("span");
      label.textContent = formatClock(minutes);
      label.style.top = `${i * cellHeightPx}px`;
      axis.appendChild(label);
    }
  });
  return axis;
}

export interface SunHoursPanel {
  element: HTMLElement;
  // Recomputes the shade matrix and redraws the heatmap from the current geometry/location/date —
  // called on creation and again whenever those change while the panel stays open, so the panel
  // stays in sync with the geometry-control and location-picker panels that remain live alongside
  // the top-down 3D view (see main.ts's report-mode toggle).
  refresh(): void;
}

// A compact overlay panel (not a separate page) meant to sit alongside the live 3D scene while
// it's temporarily viewed from a still top-down angle — the "top view" is that real scene, not a
// schematic drawing, so this panel only needs to add what the 3D view can't show: the fixed-day
// summary and the full-day shading heatmap.
export function createSunHoursPanel(): SunHoursPanel {
  const panel = document.createElement("div");
  panel.className = "sun-hours-panel";

  const title = document.createElement("div");
  title.className = "sun-hours-panel-title";
  title.textContent = "Cumulative sun hours — ground shading, east-west cross section across the day";
  panel.appendChild(title);

  const summary = document.createElement("div");
  summary.className = "sun-hours-summary";
  panel.appendChild(summary);

  const heatmapWrap = document.createElement("div");
  heatmapWrap.className = "sun-hours-heatmap-wrap";
  panel.appendChild(heatmapWrap);

  const legend = document.createElement("div");
  legend.className = "sun-hours-legend";
  legend.innerHTML =
    '<span class="sun-hours-legend-swatch sun-hours-legend-green"></span> Direct sunlight' +
    '<span class="sun-hours-legend-swatch sun-hours-legend-grey"></span> Shaded / night';
  panel.appendChild(legend);

  function renderSummary(): void {
    summary.replaceChildren();
    const fields: [string, string][] = [
      ["Date", formatDate(getDate())],
      ["Rows x modules", `${trackerCfg.rowCount} x ${trackerCfg.modulesPerRow}`],
      ["Module width", `${trackerCfg.moduleWidth.toFixed(2)}m`],
      ["Max rotation", `+-${trackerCfg.maxRotationDeg}deg`],
      ["Anti-tracking windows", summarizeAntiTrackWindows()],
    ];
    for (const [label, value] of fields) {
      const row = document.createElement("div");
      row.className = "sun-hours-summary-row";
      const labelEl = document.createElement("span");
      labelEl.className = "sun-hours-summary-label";
      labelEl.textContent = label;
      const valueEl = document.createElement("span");
      valueEl.className = "sun-hours-summary-value";
      valueEl.textContent = value;
      row.appendChild(labelEl);
      row.appendChild(valueEl);
      summary.appendChild(row);
    }
  }

  function renderHeatmap(): void {
    heatmapWrap.replaceChildren();
    const location = getLocation();
    const date = getDate();
    const geometry = getTrackerGeometry();
    const fieldHalfWidthM = ((trackerCfg.rowCount - 1) / 2) * geometry.rowSpacingM + geometry.rowSpacingM;
    const matrix = computeShadeMatrix({
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

    heatmapWrap.appendChild(createHeatmapYAxis(matrix, 4));
    const canvasWrap = document.createElement("div");
    canvasWrap.className = "sun-hours-heatmap-canvas-wrap";
    canvasWrap.appendChild(createHeatmapCanvas(matrix));
    canvasWrap.appendChild(createHeatmapXAxis(matrix, 6));
    heatmapWrap.appendChild(canvasWrap);
  }

  function refresh(): void {
    renderSummary();
    renderHeatmap();
  }

  refresh();

  return { element: panel, refresh };
}
