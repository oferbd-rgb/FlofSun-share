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
  rowCount: 4,
  modulesPerRow: 15, // ~1.5x the original 10, making each row ~1.5x longer
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
  postCount: 5, // ground-to-hub support posts per row: one at each end, rest evenly spaced
  postRadius: 0.1, // m — static, do not rotate with the pivot (see tracker.ts)
  // Compass bearing of the tracker axis (0=N, 90=E, 180=S, 270=W — same convention as solar
  // azimuth in sunPosition.ts), fed into computeTrackerRotationDeg. Rows are always physically
  // laid out along the N-S line (see tracker.ts/scene.ts) — this only changes the *tracking
  // angle* calculation, not the row's visual orientation. (An earlier version of this control
  // also visually rotated the row layout; that introduced a sign bug in the default tracking
  // direction, so it was removed — see the computeTrackerRotationDeg comment.)
  axisAzimuthDeg: 0,
  maxRotationDeg: 60, // symmetric rotation clamp; real hardware is often 45-50, tune here
  hubHeight: 3.0, // height of the rotation axis above the ground (m)
  // Real tracker motors have a maximum slew rate — the rendered rotation moves toward its
  // target (whichever of tracking/anti-tracking is active) by at most this much per real
  // (wall-clock) minute each frame, rather than snapping instantly. Most noticeable when
  // switching tracking modes, since the target angle can jump by up to ~2*maxRotationDeg at
  // once — see main.ts's use of trackerMath.ts's stepTowardDeg.
  maxRotationSpeedDegPerMin: 5,
};

export const scene = {
  groundSize: 60, // m, square ground plane
  skyColor: 0xaee2fb, // light sky blue — three.js Scene background
  // Radius for both the sun marker and the sun-path ring (80 was too much per feedback, back
  // down to 60). Purely visual: the shadow-casting DirectionalLight in sunLight.ts uses its
  // own fixed SUN_DISTANCE, driven by the same direction *vector*, so this has no effect on
  // shadow direction/length.
  sunMarkerDistance: 60,
};

export const animation = {
  simMinutesPerRealSecond: 15, // 1x speed = 1 simulated hour per 4 real seconds (halved per feedback)
  speedOptions: [1, 2, 5, 10, 20], // selectable multiples of the 1x base rate above
  defaultSpeedMultiplier: 1,
};

export const billboards = {
  logoUrl: "/edf-logo.svg",
  widthM: 18, // doubled from 9 per feedback
  heightM: 3, // doubled from 1.5, keeping the same aspect ratio
  hoverHeightM: 1.5, // gap under the sign so it casts a shadow onto the ground, not touching it
  // Positioned toward the SE corner of the ground (groundSize/2 = 30). The north-facing sign
  // was removed per feedback — just the one, facing south, remains.
  signs: [{ worldX: 20, worldZ: 18, facingAzimuthDeg: 180 }],
};

export const sunPath = {
  color: 0xffdd33,
  sampleCount: 144, // every 10 minutes across 24h
};

// A reference strip across the ground, running east-west (perpendicular to the N-S tracker
// rows) so the shadow they cast sweeps across it — a visual ruler for gauging shadow position
// even in a single still frame.
export const shadeLine = {
  color: 0xc0c0c0, // silver
  widthM: 1, // north-south width of the strip
  worldZ: 0, // crosses through the tracker field's center
};
