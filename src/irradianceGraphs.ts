// A time slider plus three stacked graphs (DNI, GHI, and their sum) for the currently selected
// day, with a vertical cursor line synced from the slider through all three — a lighter-weight
// companion to the (now removed) ground-shading matrix, focused purely on irradiance over time
// rather than ground position. No live weather data source exists in this app — DNI/DHI come from
// a simple, self-contained clear-sky approximation (Meinel & Meinel 1976 form), clearly a
// stand-in rather than measured data.
import { getDate, getLocation } from "./appState";
import { getSunAngles, localSolarTimeToDate } from "./sunPosition";

const GRAPH_WIDTH_PX = 810; // matches sunHoursReport.ts's HEATMAP_CANVAS_WIDTH_PX for visual consistency
const GRAPH_HEIGHT_PX = 80;
// Matches style.css's .irradiance-graph-label width (60px) + gap (4px) + .irradiance-graph-canvas-wrap
// padding-left (36px) — the slider, the graph canvases, and the cursor line all need this same
// left offset to actually align on a shared time scale (a plain 0-100% cursor position wouldn't
// line up, since the graph rows are indented past their label+axis-y gutter and the slider row is
// deliberately indented by the same amount to match).
const GRAPH_INDENT_PX = 100;
const TIME_STEP_MINUTES = 5;
const MINUTES_PER_DAY = 24 * 60;

const SOLAR_CONSTANT_W_M2 = 1361;
const CLEAR_SKY_DNI_COEFFICIENT = 0.7;
const CLEAR_SKY_DNI_EXPONENT = 0.678;
const CLEAR_SKY_DIFFUSE_FRACTION = 0.1;

function clearSkyIrradiance(altitudeDeg: number): { dni: number; dhi: number } {
  if (altitudeDeg <= 0) return { dni: 0, dhi: 0 };
  const sinAltitude = Math.sin((altitudeDeg * Math.PI) / 180);
  const airMass = 1 / sinAltitude;
  const dni = SOLAR_CONSTANT_W_M2 * Math.pow(CLEAR_SKY_DNI_COEFFICIENT, Math.pow(airMass, CLEAR_SKY_DNI_EXPONENT));
  const dhi = CLEAR_SKY_DIFFUSE_FRACTION * dni * sinAltitude;
  return { dni, dhi };
}

interface DaySeries {
  timeMinutes: number[];
  dni: number[];
  ghi: number[];
  sum: number[];
}

function computeDaySeries(): DaySeries {
  const dateState = getDate();
  const location = getLocation();
  const timeMinutes: number[] = [];
  const dni: number[] = [];
  const ghi: number[] = [];
  const sum: number[] = [];

  for (let minutes = 0; minutes < MINUTES_PER_DAY; minutes += TIME_STEP_MINUTES) {
    const date = localSolarTimeToDate(dateState, minutes, location.longitude);
    const { altitudeDeg } = getSunAngles(date, location.latitude, location.longitude);
    const { dni: dniVal, dhi } = clearSkyIrradiance(altitudeDeg);
    const sinAltitude = Math.max(0, Math.sin((altitudeDeg * Math.PI) / 180));
    const ghiVal = dniVal * sinAltitude + dhi;
    timeMinutes.push(minutes);
    dni.push(dniVal);
    ghi.push(ghiVal);
    sum.push(dniVal + ghiVal);
  }

  return { timeMinutes, dni, ghi, sum };
}

function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function drawSeriesCanvas(values: number[], color: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = GRAPH_WIDTH_PX;
  canvas.height = GRAPH_HEIGHT_PX;
  canvas.className = "irradiance-graph-canvas";

  const ctx = canvas.getContext("2d")!;
  const maxVal = Math.max(1e-6, ...values);
  const padTop = 4;
  const padBottom = 2;
  const plotHeight = GRAPH_HEIGHT_PX - padTop - padBottom;
  const xAt = (i: number) => (i / (values.length - 1)) * GRAPH_WIDTH_PX;
  const yAt = (v: number) => GRAPH_HEIGHT_PX - padBottom - (v / maxVal) * plotHeight;

  ctx.beginPath();
  values.forEach((v, i) => {
    const x = xAt(i);
    const y = yAt(v);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.lineTo(xAt(values.length - 1), GRAPH_HEIGHT_PX);
  ctx.lineTo(xAt(0), GRAPH_HEIGHT_PX);
  ctx.closePath();
  ctx.fillStyle = color + "33"; // ~20% alpha
  ctx.fill();

  ctx.beginPath();
  values.forEach((v, i) => {
    const x = xAt(i);
    const y = yAt(v);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  return canvas;
}

function createValueYAxis(maxVal: number, unit: string): HTMLElement {
  const axis = document.createElement("div");
  axis.className = "irradiance-graph-axis-y";
  const zeroLabel = document.createElement("span");
  zeroLabel.textContent = "0";
  zeroLabel.style.top = `${GRAPH_HEIGHT_PX}px`;
  axis.appendChild(zeroLabel);
  const maxLabel = document.createElement("span");
  maxLabel.textContent = `${maxVal.toFixed(0)}${unit}`;
  maxLabel.style.top = "4px";
  axis.appendChild(maxLabel);
  return axis;
}

export interface IrradianceGraphsPanel {
  element: HTMLElement;
  refresh(): void;
}

export function createIrradianceGraphsPanel(): IrradianceGraphsPanel {
  const panel = document.createElement("div");
  panel.className = "irradiance-graphs-panel";

  const title = document.createElement("div");
  title.className = "irradiance-graphs-title";
  title.textContent = "DNI / GHI throughout the day (clear-sky approximation)";
  panel.appendChild(title);

  // Wraps the slider row and the graph rows together so the cursor line's height can span both.
  const stack = document.createElement("div");
  stack.className = "irradiance-graphs-stack";
  panel.appendChild(stack);

  const sliderRow = document.createElement("div");
  sliderRow.className = "irradiance-time-slider-row";
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = String(MINUTES_PER_DAY - 1);
  slider.step = String(TIME_STEP_MINUTES);
  slider.value = "720"; // solar noon-ish default
  sliderRow.appendChild(slider);
  stack.appendChild(sliderRow);

  const dniRow = document.createElement("div");
  dniRow.className = "irradiance-graph-row";
  const dniLabel = document.createElement("div");
  dniLabel.className = "irradiance-graph-label";
  dniLabel.textContent = "DNI";
  const dniCanvasWrap = document.createElement("div");
  dniCanvasWrap.className = "irradiance-graph-canvas-wrap";
  dniRow.appendChild(dniLabel);
  dniRow.appendChild(dniCanvasWrap);
  stack.appendChild(dniRow);

  const ghiRow = document.createElement("div");
  ghiRow.className = "irradiance-graph-row";
  const ghiLabel = document.createElement("div");
  ghiLabel.className = "irradiance-graph-label";
  ghiLabel.textContent = "GHI";
  const ghiCanvasWrap = document.createElement("div");
  ghiCanvasWrap.className = "irradiance-graph-canvas-wrap";
  ghiRow.appendChild(ghiLabel);
  ghiRow.appendChild(ghiCanvasWrap);
  stack.appendChild(ghiRow);

  const sumRow = document.createElement("div");
  sumRow.className = "irradiance-graph-row";
  const sumLabel = document.createElement("div");
  sumLabel.className = "irradiance-graph-label";
  sumLabel.textContent = "DNI+GHI";
  const sumCanvasWrap = document.createElement("div");
  sumCanvasWrap.className = "irradiance-graph-canvas-wrap";
  sumRow.appendChild(sumLabel);
  sumRow.appendChild(sumCanvasWrap);
  stack.appendChild(sumRow);

  const axisXRow = document.createElement("div");
  axisXRow.className = "irradiance-graph-axis-x-row";
  stack.appendChild(axisXRow);

  const cursorLine = document.createElement("div");
  cursorLine.className = "irradiance-time-cursor-line";
  stack.appendChild(cursorLine);

  function repositionCursor(): void {
    const frac = Number(slider.value) / MINUTES_PER_DAY;
    cursorLine.style.left = `${GRAPH_INDENT_PX + frac * GRAPH_WIDTH_PX}px`;
  }
  slider.addEventListener("input", repositionCursor);

  function refresh(): void {
    const series = computeDaySeries();

    dniCanvasWrap.replaceChildren(createValueYAxis(Math.max(1e-6, ...series.dni), ""), drawSeriesCanvas(series.dni, "#ffb84d"));
    ghiCanvasWrap.replaceChildren(createValueYAxis(Math.max(1e-6, ...series.ghi), ""), drawSeriesCanvas(series.ghi, "#4fd1c5"));
    sumCanvasWrap.replaceChildren(createValueYAxis(Math.max(1e-6, ...series.sum), ""), drawSeriesCanvas(series.sum, "#c98bf0"));

    axisXRow.replaceChildren();
    const stepMinutes = 240; // 4h between labels
    for (let m = 0; m < MINUTES_PER_DAY; m += stepMinutes) {
      const label = document.createElement("span");
      label.textContent = formatClock(m);
      label.style.left = `${(m / MINUTES_PER_DAY) * 100}%`;
      axisXRow.appendChild(label);
    }

    repositionCursor();
  }

  refresh();

  return { element: panel, refresh };
}
