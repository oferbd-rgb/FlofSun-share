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

- **`src/config.ts`** — fixed constants: default location, default date, tracker geometry
  (row count, module size, spacing, max rotation angle), scene size.
- **`src/appState.ts`** — the *mutable* current location and date (as picked via the UI), plus a
  simple pub-sub (`onStateChange`) so the render loop reacts when either changes.
- **`src/sunPosition.ts`** — pure sun math:
  - `getSunAngles(date, lat, lng)` — wraps SunCalc for azimuth/altitude.
  - `sunAzElToVector3` — converts to a three.js direction vector (world convention: **+X = East,
    +Z = South, +Y = up**).
  - `getDaylightBounds` — sunrise/sunset for the time slider, using **local solar time**
    (`localSolarTimeToDate` / longitude-based, ~UTC + longitude/15h) rather than the browser's
    system timezone. This was a real bug we hit and fixed: using system time only "worked" for
    the default demo location by coincidence (the dev machine's timezone happened to match it).
    Also explicitly handles polar day/night (`alwaysUp`/`alwaysDown` from SunCalc) instead of
    silently defaulting to a fake 06:00–18:00 window.
- **`src/trackerMath.ts`** — pure single-axis tracking formula for a horizontal N-S axis
  (`rotation = atan2(sin(solarAzimuth - axisAzimuth), tan(solarElevation))`, clamped), no
  three.js dependency, independently testable.
- **`src/tracker.ts`** — builds one tracker row (a pivot `Group` + N modules). The pivot rotates
  around its local **Z axis** (the torque tube's own centerline, matching the N-S axis
  convention above) — rotating around X or Y here would incorrectly shift modules along the row.
- **`src/scene.ts`** / **`src/sunLight.ts`** — assembles the three.js scene: ground, the
  shadow-casting `DirectionalLight` positioned along the computed sun vector, a visible sun
  marker sphere, tracker rows, compass labels (N/E/S/W), and a few static trees (so shadow
  behavior is visible independent of the moving panels).
- **`src/timeControl.ts`** — the date input + time slider + play/pause UI.
- **`src/locationPicker.ts`** — the Leaflet world-map panel; click anywhere to relocate, with
  live reverse-geocoding via OpenStreetMap Nominatim (needs internet; falls back to a raw
  lat/lon label if the request fails).
- **`src/suncalc.d.ts`** — local ambient type declaration. The published `@types/suncalc` still
  reflects suncalc's old v1.x API (radians, azimuth from south); suncalc v2.x is a breaking
  rewrite (degrees, azimuth clockwise from north). Don't `npm install @types/suncalc` and trust
  it blindly — it's for the wrong major version.

## Known limitations / possible next steps

- Single-axis (horizontal N-S) tracking only — no dual-axis or backtracking (backtracking exists
  in real installations purely to prevent row-to-row self-shading for energy-yield accuracy, not
  needed for this visualization).
- No video export yet (was scoped as a stretch goal — interactive browser viewing was the
  primary ask).
- Nominatim reverse-geocoding is a live network call; there's no offline fallback beyond a raw
  lat/lon label.
