// Pure math — no three.js dependency, unit-testable in isolation.

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// Standard single-axis tracker rotation formula for a horizontal N-S axis
// (Lorenzo et al. 2011 / NREL TP-6A20-58891; reduces from pvlib's general
// single-axis-tracking model to this closed form when axis tilt = 0).
//
// rotation = atan2( sin(solarAzimuth - axisAzimuth), tan(solarElevation) )
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
  const deltaAzRad = (solarAzimuthDeg - axisAzimuthDeg) * DEG2RAD;
  const elevationRad = solarElevationDeg * DEG2RAD;
  const rotationRad = Math.atan2(Math.sin(deltaAzRad), Math.tan(elevationRad));
  const rotationDeg = rotationRad * RAD2DEG;
  return clamp(rotationDeg, -maxRotationDeg, maxRotationDeg);
}
