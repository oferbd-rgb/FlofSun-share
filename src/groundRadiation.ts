// Pure math — no three.js dependency (same convention as trackerMath.ts/shadeAnalysis.ts).
//
// Computes ground radiation as a percentage of unshaded GHI on a fine (x, z) grid: sunlit points
// get DNI*cos(incidence) + DHI (which, for flat ground, is exactly the unshaded GHI itself, since
// cos(incidence) = sin(altitude) = sunDirY — so sunlit points are always 100%), and shaded points
// get view-factor-to-sky * DHI only (direct beam is blocked, only the visible slice of sky's
// diffuse light reaches them).
//
// Performance: the tracker rows run along world Z and only rotate about that same Z axis (see
// tracker.ts), so a row's cross-section (and therefore the whole shading/view-factor pattern) is
// exactly Z-invariant everywhere except near the row's own physical ends — there, a ground point
// can "see past" the row's finite length, which an infinite-strip idealization can't capture.
// computeGroundRadiationGrid exploits this: it computes one X-profile per DISTINCT case (in
// shadow vs not, using the fast analytical interior formula) for the interior of the rows' Z
// extent, and only pays for the slower, per-point finite-panel numerical integration within
// edgeMarginM of a row's actual ends.
import { tracker as trackerCfg } from "./config";
import {
  computeRowShadowIntervalX,
  computeRowShadowZShift,
  computeRowWorldXPositions,
  type ShadowInterval,
} from "./trackerMath";
import { computeUnshadedGHI } from "./irradiance";

const DEG2RAD = Math.PI / 180;

// Physical length (m) of a row along its own axis — fixed by config (modulesPerRow/moduleWidth/
// moduleGap aren't user-adjustable, see appState.ts), same formula tracker.ts uses to lay out
// modules.
export function computeRowLengthM(modulesPerRow: number, moduleWidth: number, moduleGap: number): number {
  return modulesPerRow * moduleWidth + (modulesPerRow - 1) * moduleGap;
}

// The subset of row geometry the interior (infinite-strip) view-factor formula needs — exported
// so shadeAnalysis.ts's 1D (X vs time-of-day) report can reuse the exact same formula rather than
// reimplementing it (that report's cross-section is inherently a "deep interior" slice already, at
// Z=0, same assumption this formula makes).
export interface PanelRowGeometry {
  rowXs: number[];
  rotationDeg: number;
  moduleLengthM: number;
  hubHeightM: number;
}

interface RowGeometry extends PanelRowGeometry {
  rowLengthM: number;
}

// sin(phi), where phi is the signed angle (from the ground point's zenith, positive toward +X)
// to a given panel edge point — sin(atan2(dx, dy)) reduces to dx / hypot(dx, dy) directly, no
// need to actually compute the angle itself.
function edgeSinPhi(pointX: number, edgeX: number, edgeY: number): number {
  const dx = edgeX - pointX;
  return dx / Math.hypot(dx, edgeY);
}

// World (X, Y) of a panel's two edges — same edge construction as trackerMath.ts's
// computeRowShadowIntervalX, just returning both coordinates instead of the ground-projected
// shadow.
function panelEdges(rotationDeg: number, moduleLengthM: number, hubHeightM: number, rowWorldX: number) {
  const rotationRad = rotationDeg * DEG2RAD;
  const halfLength = moduleLengthM / 2;
  const edgeX = halfLength * Math.cos(rotationRad);
  const edgeY = halfLength * Math.sin(rotationRad);
  return {
    edge1: { x: rowWorldX + edgeX, y: hubHeightM + edgeY },
    edge2: { x: rowWorldX - edgeX, y: hubHeightM - edgeY },
  };
}

// Fraction of the sky hemisphere above `pointX` visible past ALL rows, treating each as an
// infinitely long tilted strip — accurate deep within a row's own physical length (see the module
// comment). For a Lambertian ground point, the view factor to any angular slice of sky is linear
// in sin(phi) (phi measured from zenith: dF = (1/2) d(sin phi)) — so each row's blocked angular
// span becomes an interval in "sin-space" over [-1, 1], and the total blocked fraction is the
// length of the UNION of those intervals divided by 2 (the full range's span). Merging overlapping
// intervals (rather than summing each row's contribution independently) avoids double-counting a
// point that sits in more than one row's angular shadow at once.
export function computeViewFactorToSkyInterior(pointX: number, rows: PanelRowGeometry): number {
  if (rows.rowXs.length === 0) return 1;

  const intervals = rows.rowXs
    .map((rowX): [number, number] => {
      const { edge1, edge2 } = panelEdges(rows.rotationDeg, rows.moduleLengthM, rows.hubHeightM, rowX);
      const s1 = edgeSinPhi(pointX, edge1.x, edge1.y);
      const s2 = edgeSinPhi(pointX, edge2.x, edge2.y);
      return s1 <= s2 ? [s1, s2] : [s2, s1];
    })
    .sort((a, b) => a[0] - b[0]);

  let coveredWidth = 0;
  let mergedStart = intervals[0][0];
  let mergedEnd = intervals[0][1];
  for (let i = 1; i < intervals.length; i++) {
    const [start, end] = intervals[i];
    if (start > mergedEnd) {
      coveredWidth += mergedEnd - mergedStart;
      mergedStart = start;
      mergedEnd = end;
    } else {
      mergedEnd = Math.max(mergedEnd, end);
    }
  }
  coveredWidth += mergedEnd - mergedStart;

  return Math.max(0, Math.min(1, 1 - coveredWidth / 2));
}

const EDGE_X_SUBDIVISIONS = 12;
const EDGE_Z_SUBDIVISIONS = 12;

// Numerically integrates the point-to-opaque-panel "sky blockage" over a FINITE tilted rectangle
// by subdividing it into a small patch grid, rather than assuming it extends forever — used only
// near a row's own physical Z-ends. Each patch contributes
// dF = cos(theta_point) * cos(theta_patch) * patchArea / (pi * r^2), the standard
// point-to-differential-area solid-angle formula: cos(theta_point) accounts for the receiving
// ground point's own Lambertian response, cos(theta_patch) for the tilted patch's foreshortening
// (a patch seen edge-on blocks ~0 sky regardless of its area).
function viewFactorBlockedByRowFinite(
  pointX: number,
  pointZ: number,
  rowX: number,
  rotationDeg: number,
  moduleLengthM: number,
  hubHeightM: number,
  rowLengthM: number,
): number {
  const rotationRad = rotationDeg * DEG2RAD;
  const cosRot = Math.cos(rotationRad);
  const sinRot = Math.sin(rotationRad);
  const normalX = -sinRot;
  const normalY = cosRot;

  const halfLength = moduleLengthM / 2;
  const halfRowLength = rowLengthM / 2;
  const patchWidthX = moduleLengthM / EDGE_X_SUBDIVISIONS;
  const patchWidthZ = rowLengthM / EDGE_Z_SUBDIVISIONS;
  const patchArea = patchWidthX * patchWidthZ;

  let blocked = 0;
  for (let i = 0; i < EDGE_X_SUBDIVISIONS; i++) {
    const localX = -halfLength + (i + 0.5) * patchWidthX;
    const patchWorldX = rowX + localX * cosRot;
    const patchWorldY = hubHeightM + localX * sinRot; // point is at ground level, y=0
    const dx = patchWorldX - pointX;
    const dy = patchWorldY;
    if (dy <= 0) continue;
    for (let j = 0; j < EDGE_Z_SUBDIVISIONS; j++) {
      const localZ = -halfRowLength + (j + 0.5) * patchWidthZ;
      const dz = localZ - pointZ;
      const r2 = dx * dx + dy * dy + dz * dz;
      if (r2 === 0) continue;
      const r = Math.sqrt(r2);
      const cosThetaPoint = dy / r;
      const cosThetaPatch = Math.abs((normalX * dx + normalY * dy) / r);
      blocked += (cosThetaPoint * cosThetaPatch * patchArea) / (Math.PI * r2);
    }
  }
  return blocked;
}

function viewFactorToSkyFinite(pointX: number, pointZ: number, rows: RowGeometry): number {
  let totalBlocked = 0;
  for (const rowX of rows.rowXs) {
    totalBlocked += viewFactorBlockedByRowFinite(
      pointX,
      pointZ,
      rowX,
      rows.rotationDeg,
      rows.moduleLengthM,
      rows.hubHeightM,
      rows.rowLengthM,
    );
  }
  return Math.max(0, Math.min(1, 1 - totalBlocked));
}

export interface GroundRadiationGridParams {
  rowCount: number;
  rowSpacingM: number;
  moduleLengthM: number;
  hubHeightM: number;
  rotationDeg: number; // current tracker rotation — all rows share one rotation
  sunDirX: number;
  sunDirY: number; // sun direction's "up" component — sin(altitude); callers should skip calling this at all once <= 0
  sunDirZ: number;
  dni: number;
  dhi: number;
  xMin: number;
  xMax: number;
  xStepM: number;
  zMin: number;
  zMax: number;
  zStepM: number;
  // Distance (m) from a row's own physical Z-end within which the slower, finite-panel-aware
  // treatment is used instead of the fast infinite-strip approximation. Defaults to a couple of
  // hub heights (or module lengths, whichever is larger) — a heuristic "how far do edge effects
  // reach" margin, not a precisely derived figure.
  edgeMarginM?: number;
}

export interface GroundRadiationGridResult {
  xCenters: number[];
  zCenters: number[];
  percentOfGHI: number[][]; // [zIndex][xIndex], 0-100
}

function buildCenters(min: number, max: number, stepM: number): number[] {
  const centers: number[] = [];
  for (let v = min + stepM / 2; v < max; v += stepM) centers.push(v);
  return centers;
}

export function computeGroundRadiationGrid(params: GroundRadiationGridParams): GroundRadiationGridResult {
  const {
    rowCount,
    rowSpacingM,
    moduleLengthM,
    hubHeightM,
    rotationDeg,
    sunDirX,
    sunDirY,
    sunDirZ,
    dni,
    dhi,
    xMin,
    xMax,
    xStepM,
    zMin,
    zMax,
    zStepM,
  } = params;

  const xCenters = buildCenters(xMin, xMax, xStepM);
  const zCenters = buildCenters(zMin, zMax, zStepM);

  if (sunDirY <= 0 || (dni === 0 && dhi === 0)) {
    const allDark = new Array(xCenters.length).fill(0);
    return { xCenters, zCenters, percentOfGHI: zCenters.map(() => allDark.slice()) };
  }

  const rowLengthM = computeRowLengthM(trackerCfg.modulesPerRow, trackerCfg.moduleWidth, trackerCfg.moduleGap);
  const halfRowLengthM = rowLengthM / 2;
  const edgeMarginM = params.edgeMarginM ?? Math.max(hubHeightM, moduleLengthM) * 2;

  const rowXs = computeRowWorldXPositions(rowCount, rowSpacingM);
  const rows: RowGeometry = { rowXs, rotationDeg, moduleLengthM, hubHeightM, rowLengthM };

  const unshadedGHI = computeUnshadedGHI(dni, dhi, sunDirY);
  const zShift = computeRowShadowZShift(hubHeightM, sunDirZ, sunDirY);
  const shadowZMin = -halfRowLengthM + zShift;
  const shadowZMax = halfRowLengthM + zShift;

  const shadowIntervalsX = rowXs
    .map((rowX) => computeRowShadowIntervalX(rotationDeg, moduleLengthM, hubHeightM, rowX, sunDirX, sunDirY))
    .filter((interval): interval is ShadowInterval => interval !== null);
  const isShadedX = (pointX: number) => shadowIntervalsX.some((interval) => pointX >= interval.startX && pointX <= interval.endX);

  const allSunlitProfile = new Array(xCenters.length).fill(100);
  let cachedInteriorShadedProfile: number[] | null = null;

  const percentOfGHI: number[][] = zCenters.map((pointZ) => {
    const isInShadowZRange = pointZ >= shadowZMin && pointZ <= shadowZMax;
    if (!isInShadowZRange) return allSunlitProfile.slice();

    const isInteriorZ = Math.abs(pointZ) < halfRowLengthM - edgeMarginM;
    if (isInteriorZ) {
      if (!cachedInteriorShadedProfile) {
        cachedInteriorShadedProfile = xCenters.map((pointX) => {
          if (!isShadedX(pointX)) return 100;
          const viewFactor = computeViewFactorToSkyInterior(pointX, rows);
          return ((viewFactor * dhi) / unshadedGHI) * 100;
        });
      }
      return cachedInteriorShadedProfile.slice();
    }

    return xCenters.map((pointX) => {
      if (!isShadedX(pointX)) return 100;
      const viewFactor = viewFactorToSkyFinite(pointX, pointZ, rows);
      return ((viewFactor * dhi) / unshadedGHI) * 100;
    });
  });

  return { xCenters, zCenters, percentOfGHI };
}
