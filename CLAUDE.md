# CLAUDE.md

See [README.md](./README.md) first — it covers the project's purpose, architecture, and the
non-obvious decisions (local solar time model, tracker rotation axis, suncalc v2 type gotcha).

## Quick facts for working in this repo

- `npm install && npm run dev` — do this on a real local disk, not a cloud-synced folder (see
  README's "Running it" section for why).
- `npx tsc --noEmit` — type-check.
- `npm test` — runs the vitest suite covering the pure math modules (`trackerMath.ts`,
  `sunPosition.ts`). Combine with visually checking the running app (`npm run dev`) for anything
  touching rendering/UI.
- Config lives in one place: `src/config.ts`. Prefer adding a named constant there over
  hardcoding a number in a component file. Note that `config.ts`'s `tracker.moduleLength`,
  `hubHeight`, `rowSpacing`, and `axisAzimuthDeg` are only the *defaults* — the running app reads
  the live values from `appState.ts`'s `TrackerGeometryState`, which the geometry control panel
  can change at runtime.
- `src/trackerMath.ts` and `src/sunPosition.ts` are intentionally kept free of three.js
  imports — pure functions, easy to sanity-check in isolation (e.g. via a throwaway Node script
  importing them directly, which is how the local-solar-time, polar-day/night, sun-vector N/S
  sign, and tracker-rotation sign-convention bugs were all originally found and verified).
