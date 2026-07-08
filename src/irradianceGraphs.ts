// The panel twoDModel.ts's elevation view sits above (2D model mode only): the actual, real
// timeControl.ts instance (the exact same slider/date/play/schedule-bar the 3D view uses — see
// main.ts's enterTwoDMode/exitTwoDMode, which re-parent it in and out rather than building a
// separate copy, so dragging it or pressing Play genuinely drives the real model clock, not an
// independent one) sits directly above three stacked graphs decomposing horizontal irradiance,
// all sharing that slider's own [sunrise, sunset] time domain, with a vertical cursor line synced
// to the live clock running through the slider and all three graphs.
//
// The three graphs are deliberately additive: DNI*sin(SE) (the direct beam's own contribution to
// a horizontal surface), the fully-shaded/sky-only diffuse contribution (DHI alone), and their
// sum, which is exactly the real unshaded GHI. All three share one constant vertical (W/m^2)
// scale — the sum graph's own max, since sum >= either component individually, so it naturally
// bounds the other two. No live weather data source exists in this app — DNI/DHI come from a
// simple, self-contained clear-sky approximation (Meinel & Meinel 1976 form), clearly a stand-in
// rather than measured data.
import { tracker as trackerCfg } from "./config";
import { getDate, getLocation, getTrackerGeometry, getTrackingModeAt } from "./appState";
import { getDaylightBounds, getSunAngles, localSolarTimeToDate, type DaylightBounds } from "./sunPosition";
import { computeAntiTrackingRotationDeg, computeTrackerRotationDeg } from "./trackerMath";
import type { TimeControl } from "./timeControl";

const GRAPH_WIDTH_PX = 810; // matches sunHoursReport.ts's HEATMAP_CANVAS_WIDTH_PX, and forced onto
// the embedded timeControl's slider via style.css so both share one horizontal (time) scale.
const GRAPH_HEIGHT_PX = 80;
// Matches style.css's .irradiance-graph-canvas-wrap padding-left — the y-axis label gutter that
// sits before each graph's canvas. The graph LABEL itself is positioned absolutely (out of flow,
// to the left) so a row's own box starts exactly at its canvas-wrap, not its label.
const Y_AXIS_GUTTER_PX = 36;
const TIME_STEP_MINUTES = 5;
const POWER_UNIT = "W/m²";
const ENERGY_UNIT = "Wh/m²";

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

interface Point {
  x: number;
  y: number;
}

// Standard segment-segment intersection test (same approach as twoDModel.ts's ray-vs-panel
// raycasting) — used below to check whether a row's own panel blocks direct sun from reaching a
// neighboring row's panel.
function segmentsIntersect(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const d1x = a2.x - a1.x;
  const d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x;
  const d2y = b2.y - b1.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return false;
  const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / denom;
  const s = ((b1.x - a1.x) * d1y - (b1.y - a1.y) * d1x) / denom;
  return t >= 0 && t <= 1 && s >= 0 && s <= 1;
}

// World X position of each row's torque-tube center, evenly spaced and centered on X=0 — same
// formula scene.ts's rebuildRows uses to place each TrackerRow.
function rowWorldXPositions(rowCount: number, rowSpacingM: number): number[] {
  const positions: number[] = [];
  for (let i = 0; i < rowCount; i++) {
    positions.push((i - (rowCount - 1) / 2) * rowSpacingM);
  }
  return positions;
}

// Whether a representative interior row (one with a neighbor on each side, where possible) is
// itself shaded by an adjacent row's panel at this moment — inter-row self-shading, distinct from
// the ground-shading this app used to compute (removed). Raycasts from that row's own hub, toward
// the sun, and checks for an intersection with any *other* row's panel segment before reaching
// open sky; if the ray is blocked, no direct beam reaches this row's panel at all.
function isRepresentativeRowShaded(rotationDeg: number, sunDirX: number, sunDirY: number): boolean {
  const geometry = getTrackerGeometry();
  const rowXs = rowWorldXPositions(trackerCfg.rowCount, geometry.rowSpacingM);
  if (rowXs.length < 2) return false;
  const representativeIndex = Math.floor(rowXs.length / 2);
  const rowX = rowXs[representativeIndex];

  const dirLen = Math.hypot(sunDirX, sunDirY);
  if (dirLen === 0) return false;
  const towardSunX = sunDirX / dirLen;
  const towardSunY = sunDirY / dirLen;
  const rayLength = 1000; // far enough to clear the whole field regardless of geometry
  const start: Point = { x: rowX, y: geometry.hubHeightM };
  const end: Point = { x: rowX + towardSunX * rayLength, y: geometry.hubHeightM + towardSunY * rayLength };

  const rotationRad = (rotationDeg * Math.PI) / 180;
  const halfLength = geometry.moduleLengthM / 2;
  const edgeX = halfLength * Math.cos(rotationRad);
  const edgeY = halfLength * Math.sin(rotationRad);

  return rowXs.some((otherRowX, i) => {
    if (i === representativeIndex) return false;
    const p1: Point = { x: otherRowX - edgeX, y: geometry.hubHeightM - edgeY };
    const p2: Point = { x: otherRowX + edgeX, y: geometry.hubHeightM + edgeY };
    return segmentsIntersect(start, end, p1, p2);
  });
}

interface DaySeries {
  timeMinutes: number[];
  // The direct beam's theoretical, always-unshaded contribution to a horizontal surface.
  beamHorizontal: number[];
  // The same, but zeroed at moments when a representative row is shaded by a neighbor —
  // beamHorizontal is always >= beamHorizontalActual.
  beamHorizontalActual: number[];
  diffuseShaded: number[];
  sum: number[];
}

function computeDaySeries(bounds: DaylightBounds): DaySeries {
  const dateState = getDate();
  const location = getLocation();
  const geometry = getTrackerGeometry();
  const timeMinutes: number[] = [];
  const beamHorizontal: number[] = [];
  const beamHorizontalActual: number[] = [];
  const diffuseShaded: number[] = [];
  const sum: number[] = [];

  const start = Math.floor(bounds.sunriseMinutes / TIME_STEP_MINUTES) * TIME_STEP_MINUTES;
  for (let minutes = start; minutes <= bounds.sunsetMinutes; minutes += TIME_STEP_MINUTES) {
    const date = localSolarTimeToDate(dateState, minutes, location.longitude);
    const { azimuthDeg, altitudeDeg } = getSunAngles(date, location.latitude, location.longitude);
    const { dni, dhi } = clearSkyIrradiance(altitudeDeg);
    const azRad = (azimuthDeg * Math.PI) / 180;
    const elRad = (altitudeDeg * Math.PI) / 180;
    const sunDirX = Math.sin(azRad) * Math.cos(elRad);
    const sunDirY = Math.max(0, Math.sin(elRad));
    const beamVal = dni * sunDirY;

    // Uses the deterministic tracking/anti-tracking angle (same formulas as main.ts's render
    // loop, but not the live rate-limited rotation) — this describes a fixed, reproducible
    // outcome for the current settings, same reasoning shadeAnalysis.ts used.
    let shaded = false;
    if (sunDirY > 0) {
      const trackingAngleDeg = computeTrackerRotationDeg(azimuthDeg, altitudeDeg, geometry.axisAzimuthDeg, trackerCfg.maxRotationDeg);
      const rotationDeg =
        getTrackingModeAt(minutes) === "track"
          ? trackingAngleDeg
          : computeAntiTrackingRotationDeg(trackingAngleDeg, trackerCfg.maxRotationDeg, geometry.moduleLengthM, sunDirX, sunDirY);
      shaded = isRepresentativeRowShaded(rotationDeg, sunDirX, sunDirY);
    }

    timeMinutes.push(minutes);
    beamHorizontal.push(beamVal);
    beamHorizontalActual.push(shaded ? 0 : beamVal);
    diffuseShaded.push(dhi);
    sum.push(beamVal + dhi);
  }

  return { timeMinutes, beamHorizontal, beamHorizontalActual, diffuseShaded, sum };
}

// Wh/m^2 — integrates a W/m^2 series over TIME_STEP_MINUTES-wide steps (trapezoid-free, simple
// rectangle sum, consistent with the step resolution already used for computeDaySeries).
function integrateToWattHours(values: number[]): number {
  return values.reduce((sum, v) => sum + v * (TIME_STEP_MINUTES / 60), 0);
}

function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function xAtFor(count: number): (i: number) => number {
  return (i: number) => (i / Math.max(1, count - 1)) * GRAPH_WIDTH_PX;
}

function yAtFor(sharedMaxVal: number): (v: number) => number {
  const padTop = 4;
  const padBottom = 2;
  const plotHeight = GRAPH_HEIGHT_PX - padTop - padBottom;
  return (v: number) => GRAPH_HEIGHT_PX - padBottom - (v / sharedMaxVal) * plotHeight;
}

function tracePath(ctx: CanvasRenderingContext2D, values: number[], xAt: (i: number) => number, yAt: (v: number) => number): void {
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = xAt(i);
    const y = yAt(v);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
}

function fillAreaUnder(
  ctx: CanvasRenderingContext2D,
  values: number[],
  xAt: (i: number) => number,
  yAt: (v: number) => number,
  fillStyle: string,
): void {
  tracePath(ctx, values, xAt, yAt);
  ctx.lineTo(xAt(values.length - 1), GRAPH_HEIGHT_PX);
  ctx.lineTo(xAt(0), GRAPH_HEIGHT_PX);
  ctx.closePath();
  ctx.fillStyle = fillStyle;
  ctx.fill();
}

function strokeLine(
  ctx: CanvasRenderingContext2D,
  values: number[],
  xAt: (i: number) => number,
  yAt: (v: number) => number,
  strokeStyle: string,
  lineWidth: number,
  dashed: boolean,
): void {
  tracePath(ctx, values, xAt, yAt);
  ctx.setLineDash(dashed ? [4, 3] : []);
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawSeriesCanvas(values: number[], sharedMaxVal: number, color: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = GRAPH_WIDTH_PX;
  canvas.height = GRAPH_HEIGHT_PX;
  canvas.className = "irradiance-graph-canvas";

  const ctx = canvas.getContext("2d")!;
  const xAt = xAtFor(values.length);
  const yAt = yAtFor(sharedMaxVal);
  fillAreaUnder(ctx, values, xAt, yAt, color + "33"); // ~20% alpha
  strokeLine(ctx, values, xAt, yAt, color, 1.5, false);

  return canvas;
}

// Two overlaid renderings of the same underlying quantity: a dashed, unfilled outline for the
// theoretical (always-unshaded) upper limit, drawn first (so it sits behind), and a filled area
// for the actual, self-shading-aware series drawn on top of it.
function drawBeamCanvas(theoreticalValues: number[], actualValues: number[], sharedMaxVal: number, color: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = GRAPH_WIDTH_PX;
  canvas.height = GRAPH_HEIGHT_PX;
  canvas.className = "irradiance-graph-canvas";

  const ctx = canvas.getContext("2d")!;
  const xAt = xAtFor(theoreticalValues.length);
  const yAt = yAtFor(sharedMaxVal);

  strokeLine(ctx, theoreticalValues, xAt, yAt, color, 1, true);
  fillAreaUnder(ctx, actualValues, xAt, yAt, color + "55"); // ~33% alpha — a bit stronger than drawSeriesCanvas's, so the filled (real) layer reads clearly in front of the dashed outline
  strokeLine(ctx, actualValues, xAt, yAt, color, 1.5, false);

  return canvas;
}

function createValueYAxis(sharedMaxVal: number): HTMLElement {
  const axis = document.createElement("div");
  axis.className = "irradiance-graph-axis-y";
  const zeroLabel = document.createElement("span");
  zeroLabel.textContent = `0 ${POWER_UNIT}`;
  zeroLabel.style.top = `${GRAPH_HEIGHT_PX}px`;
  axis.appendChild(zeroLabel);
  const maxLabel = document.createElement("span");
  maxLabel.textContent = `${sharedMaxVal.toFixed(0)} ${POWER_UNIT}`;
  maxLabel.style.top = "4px";
  axis.appendChild(maxLabel);
  return axis;
}

function createGraphRow(labelText: string, titleText: string): { row: HTMLElement; canvasWrap: HTMLElement; totalLabel: HTMLElement } {
  const row = document.createElement("div");
  row.className = "irradiance-graph-row";
  const label = document.createElement("div");
  label.className = "irradiance-graph-label";
  label.textContent = labelText;
  label.title = titleText;
  const canvasWrap = document.createElement("div");
  canvasWrap.className = "irradiance-graph-canvas-wrap";
  const totalLabel = document.createElement("div");
  totalLabel.className = "irradiance-graph-total";
  row.appendChild(label);
  row.appendChild(canvasWrap);
  row.appendChild(totalLabel);
  return { row, canvasWrap, totalLabel };
}

export interface IrradianceGraphsPanel {
  element: HTMLElement;
  refresh(): void;
  // Cheap, called every frame while 2D mode is active: re-measures where the (real, shared)
  // timeControl's slider currently renders and repositions the cursor line/graph alignment to
  // match, without recomputing the day's DNI/GHI series.
  updateCursor(): void;
}

export function createIrradianceGraphsPanel(timeControl: TimeControl): IrradianceGraphsPanel {
  let currentBounds: DaylightBounds = { sunriseMinutes: 0, sunsetMinutes: 24 * 60 };

  const panel = document.createElement("div");
  panel.className = "irradiance-graphs-panel";

  const title = document.createElement("div");
  title.className = "irradiance-graphs-title";
  title.textContent = "Horizontal irradiance components throughout the day (clear-sky approximation)";
  panel.appendChild(title);

  // Wraps the (real, shared) time control and the graph rows together so the cursor line's
  // height can span both, and so alignment measurements are relative to one common ancestor.
  const stack = document.createElement("div");
  stack.className = "irradiance-graphs-stack";
  panel.appendChild(stack);

  // Re-parents the actual timeControl.element in — style.css scopes `.irradiance-graphs-panel
  // .time-control` to override its normal `position: fixed` bottom-center placement with a
  // regular in-flow one, and forces its slider to GRAPH_WIDTH_PX so it shares a horizontal scale
  // with the graphs below without needing to dynamically resize any canvas.
  stack.appendChild(timeControl.element);

  const { row: beamRow, canvasWrap: beamCanvasWrap, totalLabel: beamTotalLabel } = createGraphRow(
    "DNI·sinSE",
    "DNI·sin(SE) — the beam's contribution to the horizontal. Dashed outline: theoretical " +
      "unshaded upper limit. Filled: actual, zeroed whenever a representative row is shaded by " +
      "a neighboring row.",
  );
  stack.appendChild(beamRow);

  const { row: diffuseRow, canvasWrap: diffuseCanvasWrap, totalLabel: diffuseTotalLabel } = createGraphRow(
    "Shaded",
    "Horizontal surface, fully shaded (sky only)",
  );
  stack.appendChild(diffuseRow);

  const { row: sumRow, canvasWrap: sumCanvasWrap, totalLabel: sumTotalLabel } = createGraphRow(
    "Sum (GHI)",
    "Sum of the beam and shaded-sky contributions — the full unshaded GHI",
  );
  stack.appendChild(sumRow);

  const axisXRow = document.createElement("div");
  axisXRow.className = "irradiance-graph-axis-x-row";
  stack.appendChild(axisXRow);

  const cursorLine = document.createElement("div");
  cursorLine.className = "irradiance-time-cursor-line";
  stack.appendChild(cursorLine);

  // The real slider is preceded by the date input, play button, and speed select in the same
  // row, so its own left edge doesn't land at the stack's left edge — measured (not hardcoded)
  // since those elements' rendered widths aren't deterministic across fonts/browsers.
  let measuredOffsetPx = 0;

  function measureAndAlign(): void {
    const sliderEl = timeControl.element.querySelector<HTMLInputElement>('input[type="range"]');
    if (!sliderEl) return;
    const sliderRect = sliderEl.getBoundingClientRect();
    const stackRect = stack.getBoundingClientRect();
    if (sliderRect.width === 0) return; // not laid out yet (e.g. display:none mid-transition)
    measuredOffsetPx = sliderRect.left - stackRect.left;
    // beamRow/diffuseRow/sumRow each have a Y_AXIS_GUTTER_PX-wide gutter built into
    // .irradiance-graph-canvas-wrap's own padding-left before the canvas itself starts, so their
    // row-level margin needs to be reduced by that same amount for the CANVAS (not the row box)
    // to land at measuredOffsetPx — axisXRow has no such gutter and uses the raw offset directly.
    for (const row of [beamRow, diffuseRow, sumRow]) {
      row.style.marginLeft = `${measuredOffsetPx - Y_AXIS_GUTTER_PX}px`;
    }
    axisXRow.style.marginLeft = `${measuredOffsetPx}px`;
  }

  function updateCursor(): void {
    measureAndAlign();
    const minutes = timeControl.getMinutesSinceMidnight();
    const span = currentBounds.sunsetMinutes - currentBounds.sunriseMinutes;
    const frac = span > 0 ? (minutes - currentBounds.sunriseMinutes) / span : 0;
    cursorLine.style.left = `${measuredOffsetPx + Math.max(0, Math.min(1, frac)) * GRAPH_WIDTH_PX}px`;
  }

  function refresh(): void {
    const location = getLocation();
    currentBounds = getDaylightBounds(getDate(), location.latitude, location.longitude);
    const series = computeDaySeries(currentBounds);
    // Shared constant scale across all three graphs — the sum series is always >= either
    // component, so its own max naturally bounds the other two too.
    const sharedMaxVal = Math.max(1e-6, ...series.sum);

    beamCanvasWrap.replaceChildren(
      createValueYAxis(sharedMaxVal),
      drawBeamCanvas(series.beamHorizontal, series.beamHorizontalActual, sharedMaxVal, "#ffb84d"),
    );
    diffuseCanvasWrap.replaceChildren(createValueYAxis(sharedMaxVal), drawSeriesCanvas(series.diffuseShaded, sharedMaxVal, "#4fd1c5"));
    sumCanvasWrap.replaceChildren(createValueYAxis(sharedMaxVal), drawSeriesCanvas(series.sum, sharedMaxVal, "#c98bf0"));

    // Based on the theoretical (unshaded) series, not the shading-aware one now also drawn on
    // this graph — kept consistent with what actually feeds the Sum graph below, so the three
    // totals still add up exactly (beam + diffuse = sum), same as before this row grew a second
    // layer.
    beamTotalLabel.textContent = `${integrateToWattHours(series.beamHorizontal).toFixed(0)} ${ENERGY_UNIT}`;
    diffuseTotalLabel.textContent = `${integrateToWattHours(series.diffuseShaded).toFixed(0)} ${ENERGY_UNIT}`;
    sumTotalLabel.textContent = `${integrateToWattHours(series.sum).toFixed(0)} ${ENERGY_UNIT}`;

    axisXRow.replaceChildren();
    const stepMinutes = 120; // 2h between labels — the domain is now just daylight hours, not 24h
    const firstLabelMinute = Math.ceil(currentBounds.sunriseMinutes / stepMinutes) * stepMinutes;
    const span = currentBounds.sunsetMinutes - currentBounds.sunriseMinutes;
    for (let m = firstLabelMinute; m <= currentBounds.sunsetMinutes; m += stepMinutes) {
      const label = document.createElement("span");
      label.textContent = formatClock(m);
      label.style.left = `${((m - currentBounds.sunriseMinutes) / span) * 100}%`;
      axisXRow.appendChild(label);
    }

    updateCursor();
  }

  // Deliberately NOT calling refresh() here — measureAndAlign() needs real layout, which requires
  // `panel` to already be attached to the document (main.ts appends it right after creation, then
  // calls refresh() itself).
  return { element: panel, refresh, updateCursor };
}
