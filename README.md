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
  - `computeFieldHalfWidthM`, `computeRowWorldXPositions`, `computeRowShadowZShift` — small shared
    geometry helpers used by `shadeAnalysis.ts`, `groundRadiation.ts`, and `main.ts`'s top-down
    report camera, so the row layout and shadow math stay in exactly one place.
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
- **`src/irradiance.ts`** — pure, no three.js. Defines the `IrradianceProvider` interface
  (`getIrradiance(altitudeDeg) -> { dni, dhi }`, in W/m^2) that all the radiation math below
  depends on, plus `createClearSkyIrradianceProvider()`, a simple Meinel & Meinel-style clear-sky
  approximation (DNI falls off with air-mass; DHI is a fixed fraction of DNI scaled by
  sin(altitude)) — a deliberate **stand-in**, not real weather data. This app has no live data
  source yet; real measured DNI/DHI (e.g. the Israel Meteorological Service's Envista API, Bet
  Dagan station — needs a personal API token obtained directly from IMS, there's no self-serve
  signup) is a planned follow-up. Because everything downstream only depends on the
  `IrradianceProvider` interface, swapping in a real data-backed provider later is an isolated
  change, not a rewrite. `computeUnshadedGHI(dni, dhi, sunDirY)` is the shared
  `DNI*cos(incidence) + DHI` formula — for flat ground, cos(incidence) = sin(altitude) = sunDirY
  exactly, so it needs no extra trig.
- **`src/groundRadiation.ts`** — pure, no three.js. `computeGroundRadiationGrid` computes ground
  radiation as a percentage of unshaded GHI on a fine (x, z) grid: sunlit points are always
  exactly 100% (DNI*cos(incidence)+DHI reduces to the unshaded GHI itself on flat ground), shaded
  points get `viewFactorToSky * DHI` only (direct beam blocked, just the visible slice of sky's
  diffuse light reaches them). The view factor itself
  (`computeViewFactorToSkyInterior`, exported for `shadeAnalysis.ts`'s reuse) comes from a classic
  2D radiative-transfer result: for a Lambertian ground point, the view factor to any angular
  slice of sky is linear in sin(phi) (phi measured from zenith), so each row's blocked angular
  span becomes an interval in "sin-space" over [-1, 1], and the blocked fraction is just the
  length of the UNION of those intervals (merged to avoid double-counting overlapping rows)
  divided by 2. This treats each row as an infinitely long tilted strip — exact deep within a
  row's own physical length, since the rows only rotate about their own Z axis (see `tracker.ts`),
  making the whole pattern Z-invariant there. Near a row's actual Z-ends, where a ground point can
  "see past" the row's finite length, `computeGroundRadiationGrid` instead calls
  `viewFactorToSkyFinite`, which numerically integrates the point-to-panel solid-angle blockage
  over a small (12x12) patch grid — the standard `cos(theta_point)*cos(theta_patch)*dA/(pi*r^2)`
  formula, both cosines needed (the receiving point's own Lambertian response, and the tilted
  patch's foreshortening). Performance: the fast interior formula is computed **once** per
  distinct case (shaded vs not) and reused across every interior Z row rather than recomputed per
  grid point — only the (few) Z-slices within `edgeMarginM` of a row's real ends pay for the
  slower per-point numerical treatment. `computeRowLengthM` is the row's fixed physical length
  (config-derived, not user-adjustable).
- **`src/groundRadiationOverlay.ts`** — a ground-hugging, unlit (`MeshBasicMaterial`) plane
  textured from a `CanvasTexture`, repainted via raw `ImageData` (not per-cell `fillRect` calls —
  far faster at tens of thousands of cells) every time `update()` gets a fresh
  `computeGroundRadiationGrid` result. Same two-stop color gradient (dark indigo -> warm yellow)
  as the Cumulative Sun Hours report's heatmap, so the two visualizations read consistently.
  Canvas row 0 maps to `grid.zCenters[0]` with no vertical flip needed — verified directly
  (`Vector3.project(camera)` against the grid's own indexing) rather than reasoned out purely on
  paper, since `CanvasTexture`'s default `flipY` combined with this mesh's -90deg X rotation put
  local +Y (V=1, canvas row 0) at world **-Z**, which happens to match `zCenters`' ascending
  order — a coincidence of this specific rotation, not something to assume holds for a
  differently-oriented mesh.
- **`src/shadeAnalysis.ts`** — pure (no three.js — recomputes the sun direction's X/Y components
  inline rather than importing `sunAzElToVector3`, same reasoning as `trackerMath.ts`),
  independently testable: `computeShadeMatrix` builds the "Cumulative sunhours" report's ground
  heatmap by sampling the day at a fixed interval and, for each sample, using the *deterministic*
  tracking/anti-tracking angle (same formulas as `main.ts`'s render loop, but **not** the live
  rate-limited rotation — the report describes a fixed, reproducible outcome for the current
  settings, not a snapshot of in-progress animation) to compute each row's ground shadow interval
  (`trackerMath.ts`'s `computeRowShadowIntervalX`, which — unlike `computeShadowFootprintWidthM`
  — keeps hub height and row position rather than only measuring shadow *width*, so it can place
  the shadow in absolute ground coordinates). Alongside the binary `shaded` matrix, it also
  returns `percentOfGHI` — reusing `groundRadiation.ts`'s `computeViewFactorToSkyInterior` (this
  report's 1D cross-section is, itself, always a "deep interior" slice at Z=0, so the same
  infinite-strip formula applies directly, no finite-edge correction needed here) and an injected
  `IrradianceProvider` to turn shading into an actual radiation percentage rather than a plain
  boolean.
- **`src/sunHoursReport.ts`** — no longer a separate full-screen page. `createSunHoursPanel`
  builds a small overlay panel that sits alongside the *live* 3D scene rather than hiding it,
  kept deliberately short (1px-tall heatmap rows, trimmed padding) so the top-down 3D view stays
  visible above it. It has no fixed-data text summary — date and the tracking/anti-tracking
  schedule are shown live by the (trimmed) time-control bar instead, see below. Contents: a
  canvas-rendered continuous radiation-percentage heatmap from `computeShadeMatrix`'s
  `percentOfGHI` (X = ground east-west position, Y = time of day; same dark-indigo-to-yellow
  gradient as `groundRadiationOverlay.ts`'s live 3D overlay, so the two read consistently — this
  replaced an earlier binary grey/green "shaded or not" version once the view-factor math existed
  to show a real percentage instead), two draggable horizontal lines overlaid directly on the
  matrix (`attachRangeHandle` — plain pointer-event dragging, not native range inputs, so each
  line can render as a full-width bar with its own floating time label in the y-axis gutter,
  dragged with the mouse rather than a side-to-side slider) that define the [start, end)
  time-of-day window, and a filled line-chart graph below showing cumulative *effective* sun-hours
  per x-position (`computeSunHoursByX` sums `percentOfGHI/100 * timeStepHours`, not a plain
  binary sunlit-hour count, so a partially-shaded point counts for a fraction of an hour) summed
  over exactly that window. The heatmap/graph canvas is a fixed `HEATMAP_CANVAS_WIDTH_PX` (810px —
  90 x-buckets at 9px each) and is centered under the panel independent of the y-axis label
  gutter (`.sun-hours-heatmap-wrap` in style.css: `width: fit-content; margin: 0 auto`, with the
  gutter absolutely positioned outside that box) so its horizontal center always lands on the
  window's own center — which is exactly where world X=0 projects to, since the top-down camera
  sits directly above the origin.
  The "top view" above the panel is the real scene itself, not a schematic drawing: `main.ts`'s
  `enterReportMode`/`exitReportMode` switch the existing camera to a fixed, still, straight-down
  angle (disabling `OrbitControls` for the duration) and hide only the momentary/instantaneous
  controls — the readings panel entirely, and (via `timeControl.ts`'s `setCompact`) just the play
  button, speed select, scrub slider, and clock from the time-control bar, leaving its date input
  and schedule bar in place. Geometry-control and location-picker stay visible and live
  throughout. `main.ts`'s `updateTopDownZoom` keeps the camera's height tuned so that world X =
  `+-fieldHalfWidthM` (`trackerMath.ts`'s `computeFieldHalfWidthM`, the same value the matrix uses
  for its own x-domain) projects to exactly `+-HEATMAP_CANVAS_WIDTH_PX/2` screen pixels around
  that shared center — meaning a row's shadow visible in the top-down view lines up, pixel for
  pixel, with the same x-position in the matrix below it (verified directly via
  `Vector3.project(camera)` against the matrix's own x-to-pixel formula). The derivation (in
  `updateTopDownZoom`'s comment): for a camera looking straight down, on-screen scale is
  `canvasHeightPx / (2 * H * tan(vFov/2))` px/meter — independent of canvas *width* since aspect
  ratio cancels out — so solving for `H` against the desired scale gives the camera height.
  `sunHoursPanel.refresh()` (heatmap + graph) and `updateTopDownZoom()` (camera height) both
  re-run on `onGeometryChange`/`onStateChange` while the report is open, so editing row spacing
  or location keeps the 3D layout, the zoom, and the heatmap all in sync; dragging an hour-range
  handle only needs to redraw the graph, not recompute the underlying matrix or re-zoom. The
  top-down camera offsets by a tiny amount on the Z axis only (not X and Z) before letting
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
- Ground radiation (`irradiance.ts`) uses a simplified clear-sky DNI/DHI model, not real weather
  data — no cloud cover, aerosols, or humidity. Wiring in the Israel Meteorological Service's
  Envista API (Bet Dagan station has measured direct/diffuse readings at 10-minute intervals) is
  planned but blocked on obtaining a personal API token directly from IMS (no self-serve signup);
  everything downstream only depends on the `IrradianceProvider` interface, so swapping it in
  later is an isolated change.
- `public/edf-logo.svg` is downloaded from [Wikimedia Commons](https://upload.wikimedia.org/wikipedia/commons/3/30/EDF_Power_Solutions_Logo.svg),
  marked public-domain there as "only simple geometric shapes and text," but the file page
  notes the EDF Power Solutions name/mark itself may still be trademarked — this demo uses it
  for a personal, non-commercial visualization.
