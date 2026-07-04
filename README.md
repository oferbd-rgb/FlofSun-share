# FlofSun — Single-Axis Solar Tracker Sun-Path Visualizer

A browser-based 3D visualization of solar PV trackers whose panels physically rotate to follow
the sun, with live shadows, a world-map location picker, and a date/time control.

## Why this exists

Inspired by Andrew Marsh's [3D Sun-Path](https://andrewmarsh.com/) tool, which projects sun
shadows onto a **static** object — it has no way to represent solar trackers, whose panels
rotate throughout the day. This project fixes that: tracker rotation is computed from the real
sun position at every timestep, so the panels and the sun move together.

## Stack

- **three.js** — 3D rendering, shadow mapping, OrbitControls.
- **suncalc** (v2.x) — sun azimuth/altitude for a given lat/lng/date/time.
- **leaflet** — world-map location picker (click a spot on Earth to relocate the site).
- **Vite + TypeScript**.

## Running it

```
npm install
npm run dev
```

Do **not** run this inside a cloud-synced folder (Google Drive, OneDrive, etc.) — `npm install`
fails there (tar/EBADF errors) because those are virtual/streamed filesystems that don't support
the file operations npm needs. Work on a real local disk.

## How it works

- **`src/config.ts`** — fixed constants: default location, default date, scene size, and the
  tracker's fixed geometry (row count, modules per row, module width, gaps, torque tube radius,
  max rotation angle) plus the *default* values for the adjustable geometry (module length, hub
  height, row spacing, axis azimuth) — the running app reads the live values for those four from
  `appState.ts`, not straight from config.
- **`src/appState.ts`** — the *mutable* current location, date, and tracker geometry (as picked
  via the UI), plus two pub-subs: `onStateChange` (location/date — fires for anything that can
  shift sunrise/sunset bounds) and `onGeometryChange` (module length/hub height/row
  spacing/axis azimuth — kept separate since it doesn't affect daylight bounds and only the
  scene needs to react to it).
- **`src/sunPosition.ts`** — pure sun math:
  - `getSunAngles(date, lat, lng)` — wraps SunCalc for azimuth/altitude.
  - `sunAzElToVector3` — converts to a three.js direction vector (world convention: **+X = East,
    +Z = South, +Y = up**; azimuth is clockwise from north, so the south component is
    `-cos(azimuth)*cos(altitude)` — the north/south sign is easy to get backwards here, verify
    against a couple of real `suncalc` azimuth/altitude pairs if you touch this).
  - `getDaylightBounds` — sunrise/sunset for the time slider, using **local solar time**
    (`localSolarTimeToDate` / longitude-based, ~UTC + longitude/15h) rather than the browser's
    system timezone. This was a real bug we hit and fixed: using system time only "worked" for
    the default demo location by coincidence (the dev machine's timezone happened to match it).
    Also explicitly handles polar day/night (`alwaysUp`/`alwaysDown` from SunCalc) instead of
    silently defaulting to a fake 06:00–18:00 window.
- **`src/trackerMath.ts`** — pure tracker geometry math, no three.js dependency, independently
  testable:
  - `computeSolarAngleDeg` — the sun-facing angle implied by the sun's actual position, via
    `rotation = atan2(sin(axisAzimuth - solarAzimuth), tan(solarElevation))`. Note the
    subtraction order (axis minus solar, not the reverse) — that's what makes `axisAzimuthDeg=0`
    (a plain north-south axis) rotate correctly given how `tracker.ts` maps `rotation.z` to
    which side of the row tilts up. **Unclamped** — a property of the sun, not the tracker, so
    it can (and near sunrise/sunset, will) exceed a real tracker's mechanical range; that's the
    intended behavior for the "Solar angle" reading (`readingsPanel.ts`), which is meant to be
    comparable to (and can visibly diverge from) the tracker's actual, clamped angle.
  - `computeTrackerRotationDeg` — `computeSolarAngleDeg`, clamped to `maxRotationDeg`. This is
    what actually gets applied to the rendered rows. `axisAzimuthDeg` only changes this
    tracking-angle calculation; it does **not** rotate the row in 3D (see `tracker.ts`) — an
    earlier version tried to do both, using a yaw rotation on the row group, but combining a yaw
    with this formula's sign convention without re-deriving the formula for it flipped the
    default tracking direction. Removed rather than re-derived, to keep this formula's
    correctness easy to verify.
  - `computeShadowFootprintWidthM` / `computeAntiTrackingRotationDeg` — support the
    tracking/anti-tracking schedule bar in `timeControl.ts`. Anti-tracking rotates 90deg off the
    (clamped) sun-facing angle (further clamped to `maxRotationDeg`, so in practice it mostly
    drives to one of the two mechanical end-stops) toward whichever side — east or west — casts
    the smaller shadow, per `computeShadowFootprintWidthM`'s east-west shadow-edge projection
    for that candidate angle and the current sun direction.
  - `stepTowardDeg` — models a tracker motor's maximum slew rate
    (`tracker.maxRotationSpeedDegPerMin`, config.ts): moves the actual applied rotation toward
    whichever target is currently active (tracking or anti-tracking) by at most that much,
    instead of snapping straight to it. `main.ts` scales the step by
    `max(simulated-minutes-elapsed, real-minutes-elapsed)` per frame — using simulated time alone
    made a slider drag or fast "Play" look frozen (the tracker could take up to
    `2 * maxRotationDeg / maxRotationSpeedDegPerMin` real minutes to catch up regardless of how
    far simulated time actually jumped); using real time alone meant toggling a tracking-schedule
    interval produced no visible motion at all while the clock was paused. Taking the max of
    both covers both cases: whichever actually progressed since the last frame drives the step.
- **`src/tracker.ts`** — builds one tracker row as two nested groups: an outer `anchorGroup` at
  ground level, never rotated, holding `tracker.postCount` static ground-to-hub support posts
  (one at each end of the row, the rest evenly spaced); and an inner `pivotGroup`, translated up
  to hub height, holding the torque tube + modules. Only `pivotGroup`'s local **Z** rotation
  (the tube's own centerline) changes per frame to sweep the modules east-west — rotating
  around X or Y instead would incorrectly shift modules along the row, and rotating the posts
  along with it would make them (wrongly) swing with the panels. Always laid out along the
  world Z axis (N-S) regardless of `axisAzimuthDeg`. Modules are mounted **1P (one-in-portrait)**:
  `moduleWidth` (fixed) runs *along* the axis (the row-pitch dimension) and `moduleLength`
  (adjustable) runs *across* it — the dimension that actually sweeps toward/away from the sun
  as the row tilts.
- **`src/scene.ts`** / **`src/sunLight.ts`** — assembles the three.js scene: a light-sky-blue
  background (`sceneCfg.skyColor`), ground (plus a silver east-west reference strip,
  `shadeLine` in `config.ts`, for gauging tracker shadow position/length at a glance — a
  half-cylinder with the flat/open side down and the dome up, rather than a flat plane, so it
  catches highlights from a range of viewing angles instead of only reflecting strongly from
  directly overhead — note that `CylinderGeometry`'s local vertices are `(r*sin(theta), y,
  r*cos(theta))`, not `(r*cos, r*sin)` as the parameter names might suggest; verify against the
  actual `BufferGeometry` data before picking a `thetaStart`/`thetaLength`, since guessing this
  wrong once already silently produced a shape that bulged sideways instead of straight up),
  the shadow-casting `DirectionalLight` positioned along the computed sun
  vector, a visible sun marker sphere, tracker rows, compass labels (N/E/S/W), and a few static
  trees (so shadow behavior is visible independent of the moving panels). `scene.ts` rebuilds
  the tracker rows (disposing the old per-row geometries first) whenever `onGeometryChange`
  fires.
- **`src/timeControl.ts`** — the date input + time slider + play/pause + speed selector UI, plus
  a tracking/anti-tracking schedule bar directly beneath the slider: one clickable segment per
  half-hour, toggling `appState.ts`'s `trackingSchedule` for that interval.
  `main.ts`'s render loop looks up the current interval's mode each frame via
  `getTrackingModeAt`. The bar is positioned/sized to exactly match the slider above it — it
  spans `[bounds.sunriseMinutes, bounds.sunsetMinutes]`, the same as the slider's own min/max
  (not a fixed 00:00-24:00 range), clipping any half-hour interval that only partially overlaps
  that range at either end. The underlying schedule storage is still the fixed 48-slot
  00:00-24:00 clock, though — only the rendering is bounds-relative. The speed selector picks a
  rounded multiplier (`config.ts`'s `animation.speedOptions`) of the 1x base rate
  (`animation.simMinutesPerRealSecond` = 60, i.e. 1x = 1 simulated hour per real second).
- **`src/locationPicker.ts`** — the Leaflet world-map panel; click anywhere to relocate, with
  live reverse-geocoding via OpenStreetMap Nominatim (needs internet; falls back to a raw
  lat/lon label if the request fails).
- **`src/geometryControl.ts`** — the "Tracker geometry" panel: number inputs for module length,
  hub height, row spacing, and axis azimuth, writing straight into `appState.ts`'s tracker
  geometry state on change. Module width stays a fixed constant in `config.ts` — not exposed
  here.
- **`src/readingsPanel.ts`** — a live 2-column readout (bottom-left, positioned to clear above
  `.time-control`'s wide centered bar rather than sitting flush in the corner — see the CSS
  comment on `.readings-panel`): "Sun" (azimuth, altitude, then solar angle) beside "Tracker"
  (tracker angle — on the same CSS grid row as solar angle specifically, not just visually near
  it, to make the two easy to compare: solar angle is the **unclamped** ideal sun-facing angle
  from `computeSolarAngleDeg`, while tracker angle uses the same convention (0deg = horizontal,
  +-`maxRotationDeg` at full tilt) but is clamped and rate-limited — the two can genuinely
  diverge during anti-tracking or while still slewing
  toward a new target). Updated once per frame from `main.ts` with the same values
  already being applied to the sun light and tracker rows, so it always reflects what's
  actually rendered.
- **`src/groundTexture.ts`** — a small procedural canvas texture (lighter, speckled green,
  tiled via `RepeatWrapping`) used as the ground's `map`, instead of a single flat color.
- **`src/billboard.ts`** — signs textured with a logo image (`config.ts`'s `billboards.logoUrl`,
  currently `public/edf-logo.svg`), letterboxed to fit a fixed width/height without distorting
  the logo's aspect ratio, with a hard alpha cutout (`alphaTest`, no `transparent`) so there's
  no solid background panel and the cast shadow follows the logo's silhouette.
  `facingAzimuthDeg` yaws the whole mesh (geometry + texture together) around world Y. Rendered
  `DoubleSide` so it's always visible regardless of viewing direction — reads correctly from
  the configured facing direction, mirrored from the opposite side (the same tradeoff a real
  static decal has).
- **`src/sunPath.ts`** — a closed yellow ring (`LineLoop`) tracing the sun's *full* diurnal
  circle for the current date/site (not just the above-horizon daylight arc), sampled at
  `config.ts`'s `sunPath.sampleCount` points across 24h and projected at the same radius as the
  sun marker (`scene.sunMarkerDistance`) via `sunAzElToVector3`, so the ring passes through
  wherever the marker sits at any time. Rebuilt on `onStateChange` (location/date).
- **`src/suncalc.d.ts`** — local ambient type declaration. The published `@types/suncalc` still
  reflects suncalc's old v1.x API (radians, azimuth from south); suncalc v2.x is a breaking
  rewrite (degrees, azimuth clockwise from north). Don't `npm install @types/suncalc` and trust
  it blindly — it's for the wrong major version.
- **`src/shadeAnalysis.ts`** — pure (no three.js — recomputes the sun direction's X/Y components
  inline rather than importing `sunAzElToVector3`, same reasoning as `trackerMath.ts`),
  independently testable: `computeShadeMatrix` builds the "Cumulative sunhours" report's
  ground-shading heatmap by sampling the day at a fixed interval and, for each sample, using the
  *deterministic* tracking/anti-tracking angle (same formulas as `main.ts`'s render loop, but
  **not** the live rate-limited rotation — the report describes a fixed, reproducible outcome
  for the current settings, not a snapshot of in-progress animation) to compute each row's ground
  shadow interval (`trackerMath.ts`'s `computeRowShadowIntervalX`, which — unlike
  `computeShadowFootprintWidthM` — keeps hub height and row position rather than only measuring
  shadow *width*, so it can place the shadow in absolute ground coordinates).
- **`src/sunHoursReport.ts`** — no longer a separate full-screen page. `createSunHoursPanel`
  builds a small overlay panel (fixed-data summary line + a canvas-rendered binary grey/green
  heatmap from `computeShadeMatrix` — X = ground east-west position, Y = time of day, grey covers
  both "shaded by a row" and "night") that sits alongside the *live* 3D scene rather than hiding
  it. The "top view" is the real scene itself, not a schematic drawing: `main.ts`'s
  `enterReportMode`/`exitReportMode` switch the existing camera to a fixed, still, straight-down
  angle (disabling `OrbitControls` for the duration) and hide only the momentary/time-of-day
  panels (`.time-control`, `.readings-panel`) — the geometry-control and location-picker panels
  stay visible and live. `sunHoursPanel.refresh()` is re-invoked on `onGeometryChange`/
  `onStateChange` while the report is open, so editing geometry or location visibly updates both
  the 3D row layout (already reactive, via `scene.ts`'s `rebuildRows`) and the heatmap together.
  The top-down camera offsets by a tiny amount on the Z axis only (not X and Z) before letting
  `OrbitControls` re-derive its spherical coordinates from the new position — an equal X/Z offset
  would instead put the camera on a 45deg diagonal, rendering the square ground as a rotated
  diamond instead of a clean axis-aligned top-down rectangle.

The demo tracker is configured as a **1P** (one module wide per row, portrait orientation)
layout.

## Known limitations / possible next steps

- Single-axis (horizontal N-S) tracking only — no dual-axis or backtracking (backtracking exists
  in real installations purely to prevent row-to-row self-shading for energy-yield accuracy, not
  needed for this visualization).
- The "Axis azimuth" control changes the tracking-angle calculation but rows are always drawn
  along the north-south line — the row layout itself doesn't visually rotate to match a
  non-default axis azimuth yet (see `trackerMath.ts`).
- No video export yet (was scoped as a stretch goal — interactive browser viewing was the
  primary ask).
- Nominatim reverse-geocoding is a live network call; there's no offline fallback beyond a raw
  lat/lon label.
- `public/edf-logo.svg` is downloaded from [Wikimedia Commons](https://upload.wikimedia.org/wikipedia/commons/3/30/EDF_Power_Solutions_Logo.svg),
  marked public-domain there as "only simple geometric shapes and text," but the file page
  notes the EDF Power Solutions name/mark itself may still be trademarked — this demo uses it
  for a personal, non-commercial visualization.
