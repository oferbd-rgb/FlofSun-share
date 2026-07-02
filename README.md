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
  - `computeTrackerRotationDeg` — single-axis tracking formula (`rotation = atan2(sin(axisAzimuth
    - solarAzimuth), tan(solarElevation))`, clamped). Note the subtraction order (axis minus
    solar, not the reverse) — that's what makes `axisAzimuthDeg=0` (a plain north-south axis)
    rotate correctly given how `tracker.ts` maps `rotation.z` to which side of the row tilts up.
    `axisAzimuthDeg` only changes this tracking-angle calculation; it does **not** rotate the row
    in 3D (see `tracker.ts`) — an earlier version tried to do both, using a yaw rotation on the
    row group, but combining a yaw with this formula's sign convention without re-deriving the
    formula for it flipped the default tracking direction. Removed rather than re-derived, to
    keep this formula's correctness easy to verify.
- **`src/tracker.ts`** — builds one tracker row (a pivot `Group` + N modules), always laid out
  along the world Z axis (N-S) regardless of `axisAzimuthDeg`. The pivot rotates around its
  local **Z axis** (the torque tube's own centerline) every frame to sweep the modules east-west
  — rotating around X or Y here would incorrectly shift modules along the row. Modules are
  mounted **1P (one-in-portrait)**: `moduleWidth` (fixed) runs *along* the axis (the row-pitch
  dimension) and `moduleLength` (adjustable) runs *across* it — the dimension that actually
  sweeps toward/away from the sun as the row tilts.
- **`src/scene.ts`** / **`src/sunLight.ts`** — assembles the three.js scene: a light-sky-blue
  background (`sceneCfg.skyColor`), ground, the shadow-casting `DirectionalLight` positioned
  along the computed sun vector, a visible sun marker sphere, tracker rows, compass labels
  (N/E/S/W), and a few static trees (so shadow behavior is visible independent of the moving
  panels). `scene.ts` rebuilds the tracker rows (disposing the old per-row geometries first)
  whenever `onGeometryChange` fires.
- **`src/timeControl.ts`** — the date input + time slider + play/pause UI.
- **`src/locationPicker.ts`** — the Leaflet world-map panel; click anywhere to relocate, with
  live reverse-geocoding via OpenStreetMap Nominatim (needs internet; falls back to a raw
  lat/lon label if the request fails).
- **`src/geometryControl.ts`** — the "Tracker geometry" panel: number inputs for module length,
  hub height, row spacing, and axis azimuth, writing straight into `appState.ts`'s tracker
  geometry state on change. Module width stays a fixed constant in `config.ts` — not exposed
  here.
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

The demo tracker is configured as a **1P** (one module wide per row, portrait orientation)
layout — see the on-screen title.

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
