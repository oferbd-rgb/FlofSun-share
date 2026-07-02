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

// 1P (one-in-portrait — one module wide per row) tracker: rowCount/modulesPerRow/moduleWidth/
// moduleThickness/moduleGap/torqueTubeRadius/maxRotationDeg are fixed demo constants.
// moduleLength, hubHeight, rowSpacing, and axisAzimuthDeg are the *defaults* for the adjustable
// geometry controls — see appState.ts's TrackerGeometryState, which is what the running app
// actually reads.
export const tracker = {
  rowCount: 3,
  modulesPerRow: 10,
  // Module width runs ALONG the row's rotation axis (the row-pitch dimension) — fixed, not
  // user-adjustable. This is the "portrait" (1P) mounting: the module's long edge
  // (moduleLength) runs across the axis instead, sweeping toward/away from the sun as the row
  // tilts. See tracker.ts.
  moduleWidth: 1.1,
  moduleLength: 2.5, // module dimension across the row's rotation axis (m) — the tilt-facing side
  moduleThickness: 0.05, // m — thin box, avoids shadow z-fighting a flat plane would have
  moduleGap: 0.05, // gap between adjacent modules along the row axis (m)
  rowSpacing: 7.5, // distance between row (torque tube) centers (m)
  torqueTubeRadius: 0.08, // m
  // Compass bearing of the tracker axis (0=N, 90=E, 180=S, 270=W — same convention as solar
  // azimuth in sunPosition.ts), fed into computeTrackerRotationDeg. Rows are always physically
  // laid out along the N-S line (see tracker.ts/scene.ts) — this only changes the *tracking
  // angle* calculation, not the row's visual orientation. (An earlier version of this control
  // also visually rotated the row layout; that introduced a sign bug in the default tracking
  // direction, so it was removed — see the computeTrackerRotationDeg comment.)
  axisAzimuthDeg: 0,
  maxRotationDeg: 60, // symmetric rotation clamp; real hardware is often 45-50, tune here
  hubHeight: 3.0, // height of the rotation axis above the ground (m)
};

export const scene = {
  groundSize: 60, // m, square ground plane
  skyColor: 0xaee2fb, // light sky blue — three.js Scene background
};

export const animation = {
  simMinutesPerRealSecond: 30, // ~1440 min / 30 => full day sweeps in ~48s when playing
};
