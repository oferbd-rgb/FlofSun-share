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

export const tracker = {
  rowCount: 3,
  modulesPerRow: 10,
  moduleWidth: 2, // along the row's rotation axis is "length"; width is across it (m)
  moduleLength: 1.8, // module dimension along the row's N-S axis (m)
  moduleThickness: 0.05, // m — thin box, avoids shadow z-fighting a flat plane would have
  moduleGap: 0.05, // gap between adjacent modules along the row axis (m)
  rowSpacing: 6, // East-West distance between row centers (m)
  torqueTubeRadius: 0.08, // m
  axisAzimuthDeg: 180, // horizontal N-S axis, pointing south (PVPMC/pvlib convention)
  maxRotationDeg: 60, // symmetric rotation clamp; real hardware is often 45-50, tune here
  hubHeight: 1.5, // height of the rotation axis above the ground (m)
};

export const scene = {
  groundSize: 60, // m, square ground plane
};

export const animation = {
  simMinutesPerRealSecond: 30, // ~1440 min / 30 => full day sweeps in ~48s when playing
};
