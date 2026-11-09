# 물막이 마을 — V3 kids prototype

- **Hypothesis:** a one-direction board with a fence as HP and three big buttons is playable by
  primary-school children (docs/REDESIGN_V3_KIDS.md §11).
- **Run:** `npm run build` → open `dist/v3/index.html` (or `/physics_td/v3/` on Pages).
  URL params: `?char=keeper|mole`, `?dev=1`. Scripted runs: `node prototypes/v3-kids/calibrate.ts`,
  `node prototypes/v3-kids/auto-bench.ts`.
- **Status:** paused — superseded by the V4 hydro-power review (`docs/REDESIGN_V4_HYDRO.md`).
  `auto.ts` (look-ahead auto placement) is done in the rules but not wired into the screen; V4
  reuses it for recommended build spots and automatic skills.
- **Findings so far:**
  - Water stays conserved to 1e-9 with sand, digging and basins (sand storage must be Float64).
  - Doing nothing loses on wave 3; one simple plan per character wins (doc §11.1 table).
  - Auto placement by look-ahead (10 candidates × 120 ticks, ~0.18 s) makes button-mashing win
    with ★3 for both characters — the map is too easy once placement is automatic.
- Files: `core.ts` rules (no DOM), `tuning.ts` numbers, `main.ts` screen, `auto.ts` auto placement.
- Tests: `tests/unit/v3-kids/`, `tests/e2e/v3-kids.e2e.mjs`.
