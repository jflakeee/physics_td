# 강가 발전소 — V4 hydro prototype

- **Hypotheses** (docs/REDESIGN_V4_HYDRO.md §12): ① power you can see (spinning wheels, ⚡ bar) reads
  as progress ② swinging between drought and flood is fun to manage ③ one build button is enough.
- **Run:** `npm run build` → open `dist/v4/index.html` (or `/physics_td/v4/` on Pages).
  `?dev=1` exposes `__v4`, `?play` skips the title, `?seed=n`. Scripted runs: `node prototypes/v4-hydro/calibrate.ts`.
- **Status:** in progress — 1 map (작은 계곡), spring + summer (4 min), wheel / reservoir / wall,
  sand and ice spirits, level-up cards, stages, gathering and upgrades, sound. No player testing yet.
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
- **Play feedback (2026-11-09):** "the village floods with no water coming in" and "building a
  wheel makes the water vanish" were both water that existed but was not drawn: rapids run
  0.01–0.08 deep (below the old 0.04 draw threshold) and overflow crosses the banks as a thin
  sheet; the village also deleted its flood water the moment it lost a heart. Now thin water is
  drawn as a dithered film, fast water gets moving foam, flood water stays and is pumped out
  slowly (one flood heart per 12 s), and a red arrow marks where it came in. Regression tests:
  `tests/unit/v4-hydro/visible_water_test.ts` (fail on the old code, pass now).
- **No build menu (2026-11-09):** the build button and the wheel / reservoir / wall cards are gone.
  Each spot on the map has one building (river → wheel, bank by a bend → reservoir, bank by the
  village or a wheel → wall); tap a circle to build. Dim circles are spots you cannot pay for
  yet; the star is the spot that helps most over the next 3 s, compared with building nothing
  (look-ahead, one site per frame in the background). The bottom bar only holds 시작 and goes
  away when the game starts, so the board grows.
- **Seasons on the map:** spring (light green, flowers, blossom trees) → summer (deep green, green
  trees); autumn and winter palettes are ready for when those seasons are added. The change
  dithers in over the last 8 s of a season; trees switch one by one.
- **Stages and the main menu (2026-11-09):** three stages of two seasons — 작은 계곡 (spring,
  summer), 가을 계곡 (summer, autumn), 겨울 계곡 (autumn, winter; the river freezes). Clearing a
  stage for the first time gives its bonus skill (rain spirit, sun spirit — new level-up cards)
  and a character (둑 쌓는 할머니, 얼음 마법사), and the result screen offers 다음 스테이지 or
  메인으로. The main menu (survivors-like) has 계속하기 (the run in progress, saved every 10 s,
  when the app is hidden and on 메인으로), 시작 → stage → character, 캐릭터, 스킬 (codex with
  locked bonus skills), 아이템 (permanent power-ups bought with gems earned from power and
  clears), 기록 (lifetime stats and per-stage records). Progress lives in `meta.ts` (no DOM).
  Scripted balance (miller, rain unlocked from stage 2): nothing → lost at 112 / 83 / 39 s;
  wheels only → lost at 239 / 147 / 151 s; wheels + reservoirs + walls → won with 3 / 3 / 1 hearts.
- **After a clear: three buttons (2026-11-09):** 계속하기 keeps playing this map season after
  season (the year cycles; each extra season raises the village demand 10% and pays a star's
  worth of gems), 다음 스테이지, 메인으로. A clear is booked when it happens; when the endless run
  ends only the extra power and seasons are paid and it is not counted as a lost run.
- **Maps, wheels, disasters (2026-11-09):**
  - One map per stage (`MAPS` in `core.ts`): different bends, rapids, village bank and build spots.
    Scripted balance — nothing: lost at 106 / 68 / 135 s; wheels only: lost at 222 / 68 / 133 s;
    wheels + reservoirs + walls: won with 3 / 2 / 1 hearts.
  - Wheels turn: a full turn in 32 frames with one light paddle; speed follows the power made.
    The old 4-frame wheel advanced one frame every ~7 s, so it looked still.
  - Shared grid: each extra working wheel lifts every wheel by 10% (toast on build).
  - Disasters besides high water: storm (rain on the whole valley), ice jam (river water freezes
    into a dam for 9 s, then bursts as one surge), landslide (earth blocks the river for 25 s),
    drought and cold wave (already there). Each has a forecast icon and a toast; water stays conserved.
  - Finding: a wall beside the river trapped water that was already on the land and led it into
    the village (map 2 lost only when a wall was built). Walls now tie back to high ground at
    their upstream end (L-shaped levee). A map with many rapids never floods; flood risk needs a
    gentle reach beside the village.
- **Gathering, materials, upgrades, numbers (2026-11-12):**
  - Trees, rocks, flowers and berry bushes stand on the banks; tap one to gather (tree → wood 2,
    rock → stone 2, flower → coins 2, bush → coins 5). The spot stays empty for 14 s, then a tree,
    rock, flower or bush grows back (weights 40 / 30 / 18 / 12, own dice so cards are unaffected).
  - Buildings cost coins plus materials (wheel: wood 3; reservoir: stone 3; wall: wood 1, stone 2).
    Tap a standing building to upgrade it with wood and stone (base × level, up to Lv 3): wheel
    +25% power per level, reservoir 0.12 deeper, wall 0.2 higher. A green arrow marks buildings
    you can upgrade; the level shows beside the building.
  - Numbers pop up where something is gained: over each wheel the power it made that second
    (blue) and the coins earned (yellow, over the busiest wheel), and over a gathered spot.
  - Scripted balance with a bot that taps one thing a second — mixed build with upgrades: won
    with 3 / 3 / 1 hearts; without upgrades stage 3 is lost.
- **Sound (2026-11-12):** 16 short synthesized effects (`audio.ts`, no audio files): gather, build,
  upgrade, not enough, start, level-up, card, forecast, disaster, spirit, heart lost, season
  survived, win, lose. Screens call `sfx.play(name)`; the same sound will not stack within 50 ms.
  Pause menu has a 소리 switch, saved with the progress. Not played per coin or per wheel number
  (once a second per wheel would be noise).
- **Reservoirs fixed (2026-11-13):** reservoirs filled in high water but gave almost nothing back in a
  drought (41 stored, 1 released). Two causes: the sand spirit took reservoir water for a flood and
  sandbagged the cut to the river shut, and most of a bowl sits below the river so it can never drain
  by itself. Now the sand spirit leaves bowls and cuts alone, and an automatic sluice (designed in
  REDESIGN_V4_HYDRO §4, not built before) opens in a drought or while the village is short of power and
  lets the bowl drain by gravity into the river 6 rows downstream. Spring drought, one wheel: power
  130 → 183, seconds short of power 8 → 0. With these fixes the mixed-build bot wins all three stages
  with 3 hearts (stage 3 was 1 heart, lost to blackouts); raising stage 2–3 demand did not change that.
  The stage ramp now shows in how fast weaker plans lose (nothing: 106 / 68 / 135 s).
  The designed evolution 빙하 저수지 (ice spirit ★5 + reservoir) was tried and left out: with a working
  sluice it stored 28% more but made no more power (stage 2: less), so it would be a dead card.
- **Stage step restored (2026-11-13):** each stage has a bigger river (`inflowMul` 1 / 1.05 / 1.15; all
  weather scales with it). Bot that gathers one thing every 2 s — mixed build without upgrades wins
  with 3 / 2 / 1 hearts; with upgrades 3 / 3 / 3 (upgrading pays off). 1.1 / 1.2 was a cliff: without
  upgrades stages 2–3 were lost.
- Files: `core.ts` rules (no DOM), `tuning.ts` numbers and weather, `main.ts` screen,
  `art.ts` pixel renderer (no DOM), `sprites.ts` palette-string sprites, `meta.ts` progress and saved run (no DOM).
- Tests: `tests/unit/v4-hydro/`, `tests/e2e/v4-hydro.e2e.mjs`.
