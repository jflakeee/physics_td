# 강가 발전소 — V4 hydro prototype

- **Hypotheses** (docs/REDESIGN_V4_HYDRO.md §12): ① power you can see (spinning wheels, ⚡ bar) reads
  as progress ② swinging between drought and flood is fun to manage ③ one build button is enough.
- **Run:** `npm run build` → open `dist/v4/index.html` (or `/physics_td/v4/` on Pages).
  `?dev=1` exposes `__v4`, `?play` skips the title, `?seed=n`. Scripted runs: `node prototypes/v4-hydro/calibrate.ts`.
- **Status:** in progress — 1 map (작은 계곡), spring + summer (4 min), wheel / reservoir / wall,
  sand and ice spirits, six level-up cards. No sound, no player testing yet.
- **Findings so far:**
  - Power P = η·Q·H from the fluid step's own fluxes works; water stays conserved to 1e-8.
  - The pipe flow carries ≈ 0.2 × bed slope per cell per tick in uniform flow, so inflow and
    slope must be tuned together (first try drowned the upper river at normal weather).
  - Rapids stay shallow in floods; gentle reaches are where turbines drown.
  - Turbines must start drowning below bank height, or floods spill out before any turbine is hit.
  - Scripted plans: build nothing → lose at 92 s; wheels only → lose to floods at 165 s;
    wheels + reservoirs + walls → survive both seasons with all hearts, about 8 level-ups.
- **Art (2026-11-09):** one pixel grid per docs/ART_DIRECTION_V4_PIXEL.md — 3 art px per cell
  (192×288), integer device scale, water upsampled with dithering and a shoreline, all icons pixel
  sprites at the same pixel size, no emoji. Frame cost in Chromium (render + sim, 390×664 @2×):
  1× CPU p50 0.8 ms / p95 2.0 ms; 4× CPU throttle p50 3.1 ms / p95 8.3 ms. The art is repainted
  only after a sim tick (30/s) or while something animates.
- Files: `core.ts` rules (no DOM), `tuning.ts` numbers and weather, `main.ts` screen,
  `art.ts` pixel renderer (no DOM), `sprites.ts` palette-string sprites.
- Tests: `tests/unit/v4-hydro/`, `tests/e2e/v4-hydro.e2e.mjs`.
