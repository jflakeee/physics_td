# 범람 방어 — V6 flood-defense prototype

- **Hypotheses** (docs/REDESIGN_V6_FLOOD.md): ① reading terrain (valleys, saddles, corner outlets) and
  redirecting water is a fun core puzzle ② a heightfield + virtual-pipes water model is fast and stable
  enough for phones ③ polluted water creates a second routing decision ("where may this water go?").
- **Run:** `npm run build` → serve `dist/` and open `/v6/` (or `/physics_td/v6/` on Pages). Plain ES
  modules, so `file://` does not work. Tests: `node --test tests/v6-flood.test.js`.
  Strategy sims: `node prototypes/v6-flood/balance-sim.mjs`.
- **Status:** in progress — 7 maps (입문 one-inlet, 두 갈래 강 polluted, 4 four-inlet, random), levee /
  trench / gate / pump / cooler / remove, repair-all, wave retry, PC + mobile input. No player testing yet.
- **Findings so far:**
  - Water and pollutant are both conserved (balance error < 1e-3 and < 1e-5 over full games).
  - The original v5 had no way for water to leave the map, so three pumps beat every wave; corner
    outlets plus saddles made "dig a spillway, dam the valley" the winning line on 3 of 5 four-inlet seeds.
  - Hillshade sign and device-pixel line widths both made the terrain unreadable once (inverted relief;
    invisible contours on DPR 2–3 phones). Contour labels and downhill ticks now carry the relief.
  - Gates matter: on the beginner map a closed gate at the spillway mouth leaves base HP 42, open 99.8.
  - Pollution as a base-damage multiplier did not change any outcome (winning lines keep the base dry).
    A protected intake outlet did: same river, same spillway — clean wins, polluted loses, far route wins.
- **Deviation from `.claude/rules/prototype-code.md`:** like `prototypes/v4-hydro`, this prototype is
  built to `dist/v6/` and deployed on Pages, and its tests and design doc live outside `prototypes/`.
