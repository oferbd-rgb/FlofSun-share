# CLAUDE.md

See [README.md](./README.md) first — it covers the project's purpose, architecture, and the
non-obvious decisions (local solar time model, tracker rotation axis, suncalc v2 type gotcha).

## Quick facts for working in this repo

- `npm install && npm run dev` — do this on a real local disk, not a cloud-synced folder (see
  README's "Running it" section for why).
- `npx tsc --noEmit` — type-check; this project has no test suite yet, so this plus visually
  checking the running app (`npm run dev`) is the verification loop.
- Config lives in one place: `src/config.ts`. Prefer adding a named constant there over
  hardcoding a number in a component file.
- `src/trackerMath.ts` and `src/sunPosition.ts` are intentionally kept free of three.js
  imports — pure functions, easy to sanity-check in isolation (e.g. via a throwaway Node script
  importing them directly, which is how the local-solar-time and polar-day/night bugs were
  originally found and verified).
