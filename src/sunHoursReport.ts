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

// A schematic top-down view of the row layout — not the live 3D scene, just a simple scaled
// plan drawing. Shows only the north half of each row's length (Z from -halfRowLength to 0),
// per feedback that the full field isn't needed here.
function createTopViewSvg(rowSpacingM: number, moduleLengthM: number): SVGSVGElement {
  const totalRowLengthM =
    trackerCfg.modulesPerRow * trackerCfg.moduleWidth + (trackerCfg.modulesPerRow - 1) * trackerCfg.moduleGap;
  const halfRowLengthM = totalRowLengthM / 2;
  const fieldHalfWidthM = ((trackerCfg.rowCount - 1) / 2) * rowSpacingM + moduleLengthM;

  const scale = 10; // px per meter
  const marginPx = 30;
  const widthPx = fieldHalfWidthM * 2 * scale + marginPx * 2;
  const heightPx = halfRowLengthM * scale + marginPx * 2;

  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("viewBox", `0 0 ${widthPx} ${heightPx}`);
  svg.setAttribute("width", String(widthPx));
  svg.setAttribute("height", String(heightPx));
  svg.classList.add("sun-hours-topview-svg");

  const toPx = (worldX: number, worldZ: number) => ({
    x: marginPx + (worldX + fieldHalfWidthM) * scale,
    // worldZ ranges from -halfRowLengthM (north edge) to 0 (row center) — draw north at the top.
    y: marginPx + (worldZ + halfRowLengthM) * scale,
  });

  const ground = document.createElementNS(svgNs, "rect");
  ground.setAttribute("x", "0");
  ground.setAttribute("y", "0");
  ground.setAttribute("width", String(widthPx));
  ground.setAttribute("height", String(heightPx));
  ground.setAttribute("fill", "#4a5d3a");
  svg.appendChild(ground);

  for (let i = 0; i < trackerCfg.rowCount; i++) {
    const rowX = (i - (trackerCfg.rowCount - 1) / 2) * rowSpacingM;
    const topLeft = toPx(rowX - moduleLengthM / 2, -halfRowLengthM);
    const rect = document.createElementNS(svgNs, "rect");
    rect.setAttribute("x", String(topLeft.x));
    rect.setAttribute("y", String(topLeft.y));
    rect.setAttribute("width", String(moduleLengthM * scale));
    rect.setAttribute("height", String(halfRowLengthM * scale));
    rect.setAttribute("fill", "#1a2a4a");
    rect.setAttribute("stroke", "#7a8bb0");
    rect.setAttribute("stroke-width", "1");
    svg.appendChild(rect);
  }

  const northLabel = document.createElementNS(svgNs, "text");
  northLabel.setAttribute("x", String(widthPx / 2));
  northLabel.setAttribute("y", "16");
  northLabel.setAttribute("fill", "#edf1f6");
  northLabel.setAttribute("font-size", "13");
  northLabel.setAttribute("text-anchor", "middle");
  northLabel.textContent = "N (row axis continues south, off the bottom edge)";
  svg.appendChild(northLabel);

  return svg;
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

export function createSunHoursReport(onBack: () => void): HTMLElement {
  const overlay = document.createElement("div");
  overlay.className = "sun-hours-report";

  const header = document.createElement("div");
  header.className = "sun-hours-header";
  const title = document.createElement("h1");
  title.className = "sun-hours-title";
  title.textContent = "Cumulative Sun Hours Report";
  const backButton = document.createElement("button");
  backButton.className = "sun-hours-back-button";
  backButton.textContent = "Back to 3D model";
  backButton.addEventListener("click", onBack);
  header.appendChild(title);
  header.appendChild(backButton);
  overlay.appendChild(header);

  const location = getLocation();
  const date = getDate();
  const geometry = getTrackerGeometry();

  const summary = document.createElement("div");
  summary.className = "sun-hours-summary";
  const summaryFields: [string, string][] = [
    ["Coordinates", `${location.latitude.toFixed(2)}, ${location.longitude.toFixed(2)} (${location.label})`],
    ["Date", formatDate(date)],
    ["Rows x modules", `${trackerCfg.rowCount} x ${trackerCfg.modulesPerRow}`],
    ["Module size", `${geometry.moduleLengthM.toFixed(2)}m x ${trackerCfg.moduleWidth.toFixed(2)}m`],
    ["Hub height", `${geometry.hubHeightM.toFixed(2)}m`],
    ["Row spacing", `${geometry.rowSpacingM.toFixed(2)}m`],
    ["Axis azimuth", `${geometry.axisAzimuthDeg.toFixed(0)}deg`],
    ["Max rotation", `+-${trackerCfg.maxRotationDeg}deg`],
    ["Anti-tracking windows", summarizeAntiTrackWindows()],
  ];
  for (const [label, value] of summaryFields) {
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
  overlay.appendChild(summary);

  const topViewSection = document.createElement("div");
  topViewSection.className = "sun-hours-section";
  const topViewLabel = document.createElement("div");
  topViewLabel.className = "sun-hours-section-label";
  topViewLabel.textContent = "Top view (plan layout, north half of each row shown)";
  topViewSection.appendChild(topViewLabel);
  topViewSection.appendChild(createTopViewSvg(geometry.rowSpacingM, geometry.moduleLengthM));
  overlay.appendChild(topViewSection);

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

  const heatmapSection = document.createElement("div");
  heatmapSection.className = "sun-hours-section";
  const heatmapLabel = document.createElement("div");
  heatmapLabel.className = "sun-hours-section-label";
  heatmapLabel.textContent = "Ground shading, east-west cross section, across the day";
  heatmapSection.appendChild(heatmapLabel);

  const heatmapWrap = document.createElement("div");
  heatmapWrap.className = "sun-hours-heatmap-wrap";
  heatmapWrap.appendChild(createHeatmapYAxis(matrix, 4));
  const canvasWrap = document.createElement("div");
  canvasWrap.className = "sun-hours-heatmap-canvas-wrap";
  canvasWrap.appendChild(createHeatmapCanvas(matrix));
  canvasWrap.appendChild(createHeatmapXAxis(matrix, 6));
  heatmapWrap.appendChild(canvasWrap);
  heatmapSection.appendChild(heatmapWrap);

  const legend = document.createElement("div");
  legend.className = "sun-hours-legend";
  legend.innerHTML =
    '<span class="sun-hours-legend-swatch sun-hours-legend-green"></span> Direct sunlight' +
    '<span class="sun-hours-legend-swatch sun-hours-legend-grey"></span> Shaded / night';
  heatmapSection.appendChild(legend);

  overlay.appendChild(heatmapSection);

  const bottomBack = document.createElement("button");
  bottomBack.className = "sun-hours-back-button";
  bottomBack.textContent = "Back to 3D model";
  bottomBack.addEventListener("click", onBack);
  overlay.appendChild(bottomBack);

  return overlay;
}
