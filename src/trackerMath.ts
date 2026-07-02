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
// config.ts's tracker.axisAzimuthDeg for the exact convention). Note the subtraction order:
// (axisAzimuth - solarAzimuth), not the other way round — that sign is what makes a positive
// result correspond to the panel tilting toward the west side of the axis (matching how
// tracker.ts's pivot rotates its meshes), so a default axisAzimuth=0 (north) tracker rotates
// negative in the morning (facing east) and positive in the afternoon (facing west).
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

// Perpendicular-to-axis offset (in world X/Z meters) for a tracker row whose center is
// `offsetM` from the array's center, given the tracker axis's compass bearing. Uses the same
// azimuth convention as sunPosition.ts (0=N/-Z, 90=E/+X, 180=S/+Z, 270=W/-X): the perpendicular
// direction is 90deg clockwise from the axis bearing, so at axisAzimuthDeg=0 rows spread along
// +X (east), matching the original fixed N-S layout.
export function rowOffsetToWorldXZ(offsetM: number, axisAzimuthDeg: number): { x: number; z: number } {
  const azRad = axisAzimuthDeg * DEG2RAD;
  return { x: offsetM * Math.cos(azRad), z: offsetM * Math.sin(azRad) };
}

// Yaw (rotation around world Y, degrees) needed so a row group's local +Z axis — which points
// world south, (0,0,1), when unrotated — aligns with the tracker axis's compass bearing. At
// axisAzimuthDeg=0 this yaws 180deg, which is visually a no-op for a symmetric row (see
// scene.ts), preserving today's default north-south appearance exactly.
export function axisYawDeg(axisAzimuthDeg: number): number {
  return 180 - axisAzimuthDeg;
}
