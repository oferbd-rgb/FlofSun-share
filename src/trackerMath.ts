// Pure math — no three.js dependency, unit-testable in isolation.

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// Standard single-axis tracker rotation formula for a horizontal axis
// (Lorenzo et al. 2011 / NREL TP-6A20-58891; reduces from pvlib's general
// single-axis-tracking model to this closed form when axis tilt = 0).
//
// rotation = atan2( sin(axisAzimuth - solarAzimuth), tan(solarElevation) )
//
// axisAzimuth is the tracker axis's compass bearing (0=N, 90=E, 180=S, 270=W — see
// config.ts's tracker.axisAzimuthDeg). Note the subtraction order: (axisAzimuth -
// solarAzimuth), not the other way round — that sign is what makes a positive result
// correspond to the panel tilting toward the west side of the axis, matching how
// tracker.ts's group rotates its meshes around world Z (rows are always laid out along the
// N-S line — see tracker.ts/scene.ts — so this formula's axisAzimuth input only changes the
// *tracking angle*, not the row's physical orientation; verified by hand via each rotated
// axis's world-space edge, since three.js's rotation-composition order is easy to get
// backwards otherwise). At the default axisAzimuth=0 (north), this rotates negative in the
// morning (facing east) and positive in the afternoon (facing west).
//
// atan2 (not atan) handles the sign/quadrant correctly across the whole day and avoids
// blowing up as tan(elevation) -> infinity near zenith. This is a property of the SUN, not the
// tracker — unclamped, so it can (and near sunrise/sunset, will) exceed a real tracker's
// mechanical range. Use computeTrackerRotationDeg for the clamped angle actually applied to
// the hardware; use this one for reporting/comparison (e.g. the "Solar angle" reading).
export function computeSolarAngleDeg(
  solarAzimuthDeg: number,
  solarElevationDeg: number,
  axisAzimuthDeg: number,
): number {
  const deltaAzRad = (axisAzimuthDeg - solarAzimuthDeg) * DEG2RAD;
  const elevationRad = solarElevationDeg * DEG2RAD;
  const rotationRad = Math.atan2(Math.sin(deltaAzRad), Math.tan(elevationRad));
  return rotationRad * RAD2DEG;
}

// Same as computeSolarAngleDeg, clamped to the tracker's mechanical rotation limit — this is
// what actually gets applied to the hardware/rendered rows.
//
// When the sun is below the horizon, the tracker holds its last angle rather than being
// driven by a meaningless negative-elevation result (the caller is responsible for freezing
// state at that point — this function always returns the geometrically "ideal" angle for
// whatever elevation it's given).
export function computeTrackerRotationDeg(
  solarAzimuthDeg: number,
  solarElevationDeg: number,
  axisAzimuthDeg: number,
  maxRotationDeg: number,
): number {
  const solarAngleDeg = computeSolarAngleDeg(solarAzimuthDeg, solarElevationDeg, axisAzimuthDeg);
  return clamp(solarAngleDeg, -maxRotationDeg, maxRotationDeg);
}

// East-west width (m) of the shadow a panel casts, given its rotation angle and the sun's
// east-west/up direction components (sunDirX, sunDirY from sunAzElToVector3's Vector3 — the
// north-south component doesn't affect this, since shadow east-west spread from a horizontal
// light only depends on the dx/dy ratio). Ignores hub height deliberately: translating the
// panel up shifts both of its shadow-casting edges by the same amount, which cancels out of
// the WIDTH (edge-to-edge difference) — only the rotation angle and module length matter here.
export function computeShadowFootprintWidthM(
  rotationDeg: number,
  moduleLengthM: number,
  sunDirX: number,
  sunDirY: number,
): number {
  if (sunDirY <= 0) return 0; // sun at or below the horizon: no shadow
  const rotationRad = rotationDeg * DEG2RAD;
  const halfLength = moduleLengthM / 2;
  const edgeX = halfLength * Math.cos(rotationRad);
  const edgeY = halfLength * Math.sin(rotationRad);
  // Ground-projected X of a point (px, py) along the sun direction: px - (py/sunDirY)*sunDirX.
  const shadowX1 = edgeX - (edgeY / sunDirY) * sunDirX;
  const shadowX2 = -edgeX - (-edgeY / sunDirY) * sunDirX;
  return Math.abs(shadowX1 - shadowX2);
}

// Ground X-interval (absolute world coordinates, not just width) shaded by one panel, given its
// rotation, hub height, and world X position, projected along the sun direction. Unlike
// computeShadowFootprintWidthM, this does NOT ignore hub height or row position — it needs both
// to place the shadow on the ground, not just measure its width. Returns null if the sun is at
// or below the horizon (no shadow).
export interface ShadowInterval {
  startX: number;
  endX: number;
}

export function computeRowShadowIntervalX(
  rotationDeg: number,
  moduleLengthM: number,
  hubHeightM: number,
  rowWorldX: number,
  sunDirX: number,
  sunDirY: number,
): ShadowInterval | null {
  if (sunDirY <= 0) return null;
  const rotationRad = rotationDeg * DEG2RAD;
  const halfLength = moduleLengthM / 2;
  const edgeX = halfLength * Math.cos(rotationRad);
  const edgeY = halfLength * Math.sin(rotationRad);
  // World position of each panel edge (hub position + the tilted local offset).
  const world1X = rowWorldX + edgeX;
  const world1Y = hubHeightM + edgeY;
  const world2X = rowWorldX - edgeX;
  const world2Y = hubHeightM - edgeY;
  // Ground-projected X of a point (px, py) along the sun direction: px - (py/sunDirY)*sunDirX.
  const shadowX1 = world1X - (world1Y / sunDirY) * sunDirX;
  const shadowX2 = world2X - (world2Y / sunDirY) * sunDirX;
  return { startX: Math.min(shadowX1, shadowX2), endX: Math.max(shadowX1, shadowX2) };
}

// Half-width (m) of the ground swath the field of rows spans east-west, measured from the
// centerline (X=0) to just past the outermost row (one extra rowSpacingM of margin beyond the
// last row's own center) — shared by the Cumulative Sun Hours matrix (its x-domain) and the
// report's top-down camera zoom (main.ts), so the two stay in sync as rowSpacingM changes live.
export function computeFieldHalfWidthM(rowCount: number, rowSpacingM: number): number {
  return ((rowCount - 1) / 2) * rowSpacingM + rowSpacingM;
}

// World X position of each row's torque-tube center, evenly spaced and centered on X=0 — the
// same formula scene.ts's rebuildRows uses to place each TrackerRow, and shadeAnalysis.ts /
// groundRadiation.ts both need it too (for shadow and view-factor math respectively).
export function computeRowWorldXPositions(rowCount: number, rowSpacingM: number): number[] {
  const positions: number[] = [];
  for (let i = 0; i < rowCount; i++) {
    positions.push((i - (rowCount - 1) / 2) * rowSpacingM);
  }
  return positions;
}

// How far (m, along the row's own Z/length axis) the row's ground shadow shifts from directly
// below the row, due to the sun's north-south direction component. Rotation is always about the
// row's own Z axis (see tracker.ts), so a row's Z-extent never changes with tilt — only this
// hub-height-driven shift moves the shadow's Z-range away from the row's own [-halfLength,
// +halfLength]. Approximates the whole row as occurring at a single height (hubHeightM), ignoring
// the small extra Z-spread the panel's own tilt-driven height variation would add — a second-order
// effect, similar in spirit to computeShadowFootprintWidthM's existing hub-height simplification.
export function computeRowShadowZShift(hubHeightM: number, sunDirZ: number, sunDirY: number): number {
  if (sunDirY <= 0) return 0;
  return (hubHeightM / sunDirY) * sunDirZ;
}

// "Anti-tracking": instead of facing the sun (computeTrackerRotationDeg), rotate 90deg off
// that angle — to whichever side (east, i.e. -90, or west, i.e. +90) yields the smaller
// shadow footprint once clamped to the mechanical limit. A literal 90deg offset usually
// exceeds maxRotationDeg, so in practice this mostly drives the tracker to one of its two
// physical end-stops; which one depends on the sun's actual position via
// computeShadowFootprintWidthM.
export function computeAntiTrackingRotationDeg(
  trackingRotationDeg: number,
  maxRotationDeg: number,
  moduleLengthM: number,
  sunDirX: number,
  sunDirY: number,
): number {
  const eastCandidate = clamp(trackingRotationDeg - 90, -maxRotationDeg, maxRotationDeg);
  const westCandidate = clamp(trackingRotationDeg + 90, -maxRotationDeg, maxRotationDeg);
  const eastFootprint = computeShadowFootprintWidthM(eastCandidate, moduleLengthM, sunDirX, sunDirY);
  const westFootprint = computeShadowFootprintWidthM(westCandidate, moduleLengthM, sunDirX, sunDirY);
  return eastFootprint <= westFootprint ? eastCandidate : westCandidate;
}

// Moves currentDeg toward targetDeg by at most maxStepDeg (always >= 0), without overshooting —
// models a real tracker motor's maximum slew rate, so switching tracking modes (or anything
// else that changes the target angle abruptly) drives the tracker there gradually rather than
// snapping instantly.
export function stepTowardDeg(currentDeg: number, targetDeg: number, maxStepDeg: number): number {
  const delta = targetDeg - currentDeg;
  if (Math.abs(delta) <= maxStepDeg) return targetDeg;
  return currentDeg + Math.sign(delta) * maxStepDeg;
}
