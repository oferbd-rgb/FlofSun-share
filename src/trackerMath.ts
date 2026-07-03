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
// blowing up as tan(elevation) -> infinity near zenith.
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
  const deltaAzRad = (axisAzimuthDeg - solarAzimuthDeg) * DEG2RAD;
  const elevationRad = solarElevationDeg * DEG2RAD;
  const rotationRad = Math.atan2(Math.sin(deltaAzRad), Math.tan(elevationRad));
  const rotationDeg = rotationRad * RAD2DEG;
  return clamp(rotationDeg, -maxRotationDeg, maxRotationDeg);
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
