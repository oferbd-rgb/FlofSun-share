// A time slider (with its own clock + play button, mirroring timeControl.ts's feature set but
// entirely self-contained — dragging/playing it does not affect the main app clock or the 2D
// elevation view's tracker rotation) plus three stacked graphs decomposing horizontal irradiance
// for the currently selected day, with a vertical cursor line synced from the slider through all
// three. A lighter-weight companion to the (now removed) ground-shading matrix, focused purely on
// irradiance over time rather than ground position. No live weather data source exists in this
// app — DNI/DHI come from a simple, self-contained clear-sky approximation (Meinel & Meinel 1976
// form), clearly a stand-in rather than measured data.
import { getDate, getLocation } from "./appState";
import { getSunAngles, localSolarTimeToDate } from "./sunPosition";
import { animation as animationCfg } from "./config";

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

// Three views of horizontal irradiance, decomposed so the third is literally the sum of the
// first two: beamHorizontal (DNI*sin(solar elevation) — the direct beam's own contribution once
// projected onto a horizontal surface), diffuseShaded (DHI alone — what a horizontal surface
// would receive if the beam were fully blocked and only the sky's diffuse light reached it), and
// their sum (which is exactly the real, fully unshaded GHI).
interface DaySeries {
  timeMinutes: number[];
  beamHorizontal: number[];
  diffuseShaded: number[];
  sum: number[];
}

function computeDaySeries(): DaySeries {
  const dateState = getDate();
  const location = getLocation();
  const timeMinutes: number[] = [];
  const beamHorizontal: number[] = [];
  const diffuseShaded: number[] = [];
  const sum: number[] = [];

  for (let minutes = 0; minutes < MINUTES_PER_DAY; minutes += TIME_STEP_MINUTES) {
    const date = localSolarTimeToDate(dateState, minutes, location.longitude);
    const { altitudeDeg } = getSunAngles(date, location.latitude, location.longitude);
    const { dni, dhi } = clearSkyIrradiance(altitudeDeg);
    const sinAltitude = Math.max(0, Math.sin((altitudeDeg * Math.PI) / 180));
    const beamVal = dni * sinAltitude;
    timeMinutes.push(minutes);
    beamHorizontal.push(beamVal);
    diffuseShaded.push(dhi);
    sum.push(beamVal + dhi);
  }

  return { timeMinutes, beamHorizontal, diffuseShaded, sum };
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

function createGraphRow(labelText: string, titleText: string): { row: HTMLElement; canvasWrap: HTMLElement } {
  const row = document.createElement("div");
  row.className = "irradiance-graph-row";
  const label = document.createElement("div");
  label.className = "irradiance-graph-label";
  label.textContent = labelText;
  label.title = titleText;
  const canvasWrap = document.createElement("div");
  canvasWrap.className = "irradiance-graph-canvas-wrap";
  row.appendChild(label);
  row.appendChild(canvasWrap);
  return { row, canvasWrap };
}

export interface IrradianceGraphsPanel {
  element: HTMLElement;
  refresh(): void;
  // Advances the panel's own clock (only while its Play button is toggled on) — mirrors
  // timeControl.ts's advance(), called from main.ts's frame loop the same way, but drives only
  // this panel's slider/cursor, not the main app clock or the 2D elevation view.
  advance(realDeltaSeconds: number): void;
}

export function createIrradianceGraphsPanel(): IrradianceGraphsPanel {
  let minutesSinceMidnight = 720; // solar noon-ish default
  let playing = false;

  const panel = document.createElement("div");
  panel.className = "irradiance-graphs-panel";

  const title = document.createElement("div");
  title.className = "irradiance-graphs-title";
  title.textContent = "Horizontal irradiance components throughout the day (clear-sky approximation)";
  panel.appendChild(title);

  // Wraps the slider row and the graph rows together so the cursor line's height can span both.
  const stack = document.createElement("div");
  stack.className = "irradiance-graphs-stack";
  panel.appendChild(stack);

  // Header row (play button + clock) — deliberately NOT part of the indented/aligned zone the
  // slider/graphs/cursor share, so it doesn't eat into that fixed GRAPH_WIDTH_PX alignment.
  const headerRow = document.createElement("div");
  headerRow.className = "irradiance-time-header-row";
  const playButton = document.createElement("button");
  playButton.textContent = "Play";
  const clockReadout = document.createElement("span");
  clockReadout.className = "irradiance-clock-readout";
  headerRow.appendChild(playButton);
  headerRow.appendChild(clockReadout);
  stack.appendChild(headerRow);

  const sliderRow = document.createElement("div");
  sliderRow.className = "irradiance-time-slider-row";
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = String(MINUTES_PER_DAY - 1);
  slider.step = String(TIME_STEP_MINUTES);
  slider.value = String(minutesSinceMidnight);
  sliderRow.appendChild(slider);
  stack.appendChild(sliderRow);

  const { row: beamRow, canvasWrap: beamCanvasWrap } = createGraphRow("DNI·sinSE", "DNI·sin(SE) — the beam's contribution to the horizontal");
  stack.appendChild(beamRow);

  const { row: diffuseRow, canvasWrap: diffuseCanvasWrap } = createGraphRow("Shaded", "Horizontal surface, fully shaded (sky only)");
  stack.appendChild(diffuseRow);

  const { row: sumRow, canvasWrap: sumCanvasWrap } = createGraphRow("Sum (GHI)", "Sum of the beam and shaded-sky contributions — the full unshaded GHI");
  stack.appendChild(sumRow);

  const axisXRow = document.createElement("div");
  axisXRow.className = "irradiance-graph-axis-x-row";
  stack.appendChild(axisXRow);

  const cursorLine = document.createElement("div");
  cursorLine.className = "irradiance-time-cursor-line";
  stack.appendChild(cursorLine);

  function refreshDisplay(): void {
    slider.value = String(minutesSinceMidnight);
    clockReadout.textContent = formatClock(minutesSinceMidnight);
    const frac = minutesSinceMidnight / MINUTES_PER_DAY;
    cursorLine.style.left = `${GRAPH_INDENT_PX + frac * GRAPH_WIDTH_PX}px`;
  }

  playButton.addEventListener("click", () => {
    playing = !playing;
    playButton.textContent = playing ? "Pause" : "Play";
  });

  slider.addEventListener("input", () => {
    minutesSinceMidnight = Number(slider.value);
    refreshDisplay();
  });

  function refresh(): void {
    const series = computeDaySeries();

    beamCanvasWrap.replaceChildren(
      createValueYAxis(Math.max(1e-6, ...series.beamHorizontal), ""),
      drawSeriesCanvas(series.beamHorizontal, "#ffb84d"),
    );
    diffuseCanvasWrap.replaceChildren(
      createValueYAxis(Math.max(1e-6, ...series.diffuseShaded), ""),
      drawSeriesCanvas(series.diffuseShaded, "#4fd1c5"),
    );
    sumCanvasWrap.replaceChildren(createValueYAxis(Math.max(1e-6, ...series.sum), ""), drawSeriesCanvas(series.sum, "#c98bf0"));

    axisXRow.replaceChildren();
    const stepMinutes = 240; // 4h between labels
    for (let m = 0; m < MINUTES_PER_DAY; m += stepMinutes) {
      const label = document.createElement("span");
      label.textContent = formatClock(m);
      label.style.left = `${(m / MINUTES_PER_DAY) * 100}%`;
      axisXRow.appendChild(label);
    }

    refreshDisplay();
  }

  function advance(realDeltaSeconds: number): void {
    if (!playing) return;
    minutesSinceMidnight += realDeltaSeconds * animationCfg.simMinutesPerRealSecond;
    if (minutesSinceMidnight >= MINUTES_PER_DAY) minutesSinceMidnight -= MINUTES_PER_DAY;
    refreshDisplay();
  }

  refresh();

  return { element: panel, refresh, advance };
}
