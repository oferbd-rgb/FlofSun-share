// Single source of truth for the demo scene. All values here are meant to be trivially
// tweakable without touching any other file.

export const location = {
  // Tel Aviv, Israel area — change freely.
  latitude: 32.08,
  longitude: 34.78,
};

// Fixed demo date (year/month/day only; time-of-day is driven by the slider).
// Summer solstice gives the widest sun-azimuth swing, which makes the tracker's
// east-to-west sweep most visible.
export const demoDate = {
  year: 2026,
  month: 6, // 1-indexed (June)
  day: 21,
};

// 1P (one module wide) tracker: rowCount/modulesPerRow/moduleWidth/moduleThickness/moduleGap/
// torqueTubeRadius/maxRotationDeg are fixed demo constants. moduleLength, hubHeight, rowSpacing,
// and axisAzimuthDeg are the *defaults* for the adjustable geometry controls — see
// appState.ts's TrackerGeometryState, which is what the running app actually reads.
export const tracker = {
  rowCount: 3,
  modulesPerRow: 10,
  moduleWidth: 1.1, // across the row's rotation axis (m) — fixed, not user-adjustable
  moduleLength: 2.5, // module dimension along the row's rotation axis (m)
  moduleThickness: 0.05, // m — thin box, avoids shadow z-fighting a flat plane would have
  moduleGap: 0.05, // gap between adjacent modules along the row axis (m)
  rowSpacing: 7.5, // distance between row (torque tube) centers, measured perpendicular to the axis (m)
  torqueTubeRadius: 0.08, // m
  // Compass bearing of the tracker axis (0=N, 90=E, 180=S, 270=W — same convention as solar
  // azimuth in sunPosition.ts). 0 = a plain north-south axis. Since the axis is a physical line
  // (not a ray), az and az+180 describe the same orientation; computeTrackerRotationDeg and the
  // row yaw in scene.ts are both defined relative to this exact convention, so don't change one
  // without the other.
  axisAzimuthDeg: 0,
  maxRotationDeg: 60, // symmetric rotation clamp; real hardware is often 45-50, tune here
  hubHeight: 3.0, // height of the rotation axis above the ground (m)
};

export const scene = {
  groundSize: 60, // m, square ground plane
};

export const animation = {
  simMinutesPerRealSecond: 30, // ~1440 min / 30 => full day sweeps in ~48s when playing
};
