/**
 * Story 001 — 물·얼음 시뮬레이션 코어. Acceptance criteria → tests (SIM-xx = DETAILED_DESIGN_V2 §20).
 * Story: production/epics/physics-td/story-001-water-ice-sim-core.md
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng, createStreams, seedState, streamsState, restoreStreams } from '../../../src/core/rng.ts';
import { FLAG } from '../../../src/core/types.ts';
import { createGrid, totalWater } from '../../../src/sim/grid.ts';
import { createFluidScratch, fluidStep } from '../../../src/sim/fluid.ts';
import { fractureIce, freezeCells, freezeToWall, meltIce, placeIce } from '../../../src/sim/ice.ts';
import { buildTerrain } from '../../../src/sim/terrain.ts';
import { createWorld, runWaves, startWave, stepSim } from '../../../src/sim/step.ts';
import { addPump, setPump, setPumpDischarge, applySinks } from '../../../src/sim/sinks.ts';
import { buildLevee, updateStructures } from '../../../src/sim/structures.ts';
import { applyDamage } from '../../../src/sim/metrics.ts';
import { waveInflow } from '../../../src/sim/inflow.ts';
import { DEFAULT_SIM_CONFIG, waveLen } from '../../../src/sim/config.ts';
import { DIKE_I1, DIKE_VILLAGE, FREEZE_COOLDOWN, GLACIER_POCKET, STRATEGIES, addGlacierLake, dikeWorld, flatGrid, hashGrid, randomGrid, repairLevees } from './fixtures.ts';

const K = DEFAULT_SIM_CONFIG.K;

// ---------------------------------------------------------------- determinism
test('rng: same seed → same sequence; streams are independent', () => {
  const a = createRng(seedState(42)), b = createRng(seedState(42));
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
  const s1 = createStreams(7), s2 = createStreams(7);
  for (let i = 0; i < 50; i++) s1.cards.next(); // rerolling cards…
  assert.equal(s1.events.next(), s2.events.next()); // …does not shift events
  assert.equal(s1.weather.next(), s2.weather.next());
  const snap = streamsState(s1), r = restoreStreams(snap);
  assert.equal(r.cards.next(), s1.cards.next());
});

test('determinism: same seed + same inputs → identical water/ice bytes', () => {
  const run = () => {
    const { t, w } = dikeWorld();
    STRATEGIES.ringPlusPump(w, t);
    placeIce(w.grid, [100, 101, 102], 0.3);
    startWave(w, 1);
    for (let k = 0; k < 800; k++) stepSim(w);
    return hashGrid(w.grid);
  };
  assert.equal(run(), run());
});

// ---------------------------------------------------------------- SIM-01 mass
test('SIM-01: no inflow/sinks, 10k ticks → total water+ice change < 1e-4', () => {
  const g = randomGrid(1, 64, 96), sc = createFluidScratch(g.w.length);
  const before = totalWater(g);
  for (let k = 0; k < 10000; k++) { fluidStep(g, K, sc); meltIce(g, DEFAULT_SIM_CONFIG.iceMelt, DEFAULT_SIM_CONFIG.iceEpsilon); }
  assert.ok(Math.abs(totalWater(g) - before) < 1e-4, `drift ${totalWater(g) - before}`);
});

// ---------------------------------------------------------------- SIM-02 symmetry
test('SIM-02: left/right symmetric terrain → mirrored cells differ < 1e-6', () => {
  const W = 64, H = 96, g = createGrid(W, H), r = createRng(seedState(3));
  for (let y = 0; y < H; y++) for (let x = 0; x < W / 2; x++) {
    const v = r.next() * 1.2;
    g.h[y * W + x] = v; g.h[y * W + (W - 1 - x)] = v;
  }
  g.w[48 * W + 31] = 1.0; g.w[48 * W + 32] = 1.0;
  const sc = createFluidScratch(W * H);
  for (let k = 0; k < 3000; k++) fluidStep(g, K, sc);
  let worst = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W / 2; x++)
    worst = Math.max(worst, Math.abs(g.w[y * W + x] - g.w[y * W + (W - 1 - x)]));
  assert.ok(worst < 1e-6, `asymmetry ${worst}`);
});

// ---------------------------------------------------------------- SIM-03 overtopping
function leveeColumn(level: number): number {
  // 1 × 5 strip: [water][water][levee 1.0][dry][dry]
  const g = flatGrid(5, 1), sc = createFluidScratch(5);
  g.wall[2] = 1.0; g.w[0] = level; g.w[1] = level;
  for (let k = 0; k < 600; k++) fluidStep(g, K, sc);
  return g.w[3] + g.w[4];
}
test('SIM-03: levee 1.0 — water 0.5 passes nothing, water 1.5 overtops', () => {
  assert.equal(leveeColumn(0.5), 0);
  assert.ok(leveeColumn(1.5) > 0.1);
});

// ---------------------------------------------------------------- SIM-05 levee collapse
test('SIM-05: constant pressure 1.0 → levee durability hits 0 at tick 1500 ± 1, then wall = 0', () => {
  const g = flatGrid(3, 1);
  const t = { grid: g, baseCore: new Uint32Array(0), baseX: 0, baseY: 0, inlets: [], distToBase: new Uint16Array(3) };
  const w = createWorld(t, { I1: 0 }, { cash: null });
  buildLevee(w, [1], 1.2);
  let tick = 0;
  while (g.wall[1] > 0 && tick < 3000) { g.w[0] = 1.0; updateStructures(w); tick++; }
  assert.ok(Math.abs(tick - 1500) <= 1, `collapsed at ${tick}`);
  assert.equal(g.wall[1], 0);
  assert.equal(w.metrics.collapses, 1);
});

test('levee with a dry uphill neighbour does not wear', () => {
  const g = flatGrid(3, 1);
  g.h[0] = 0.5;
  const t = { grid: g, baseCore: new Uint32Array(0), baseX: 0, baseY: 0, inlets: [], distToBase: new Uint16Array(3) };
  const w = createWorld(t, { I1: 0 }, { cash: null });
  buildLevee(w, [1], 0.4);
  for (let k = 0; k < 100; k++) updateStructures(w);
  assert.equal(g.dur[1], 1);
});

// ---------------------------------------------------------------- base damage
test('SIM-08: flood 1.7 for 1 s → hp −1; fractions accumulate; HP 0 → defeat', () => {
  const { w } = dikeWorld();
  startWave(w, 1);
  const core = w.baseCore;
  for (let k = 0; k < 30; k++) { for (const c of core) w.grid.w[c] = 1.7 / 9; applyDamage(w); }
  assert.equal(w.hp, 99);
  assert.ok(Number.isInteger(w.hp));
  w.hp = 1;
  for (const c of core) w.grid.w[c] = 1.0; // flood 9.0, far over threshold
  let r = stepSim(w);
  for (let k = 0; k < 30 && r !== 'defeat'; k++) { for (const c of core) w.grid.w[c] = 1.0; r = stepSim(w); }
  assert.equal(r, 'defeat');
  assert.equal(w.hp, 0);
});

test('base below threshold takes no damage', () => {
  const { w } = dikeWorld();
  for (const c of w.baseCore) w.grid.w[c] = 1.19 / 9;
  for (let k = 0; k < 300; k++) applyDamage(w);
  assert.equal(w.hp, 100);
});

// ---------------------------------------------------------------- inflow, pumps
test('SIM-07: one full wave adds I_w (inlets + rain) ± 1e-3', () => {
  for (const wave of [1, 3, 5]) {
    const { w } = dikeWorld();
    startWave(w, wave);
    for (let k = 0; k < waveLen(wave); k++) stepSim(w);
    assert.ok(Math.abs(w.metrics.waveInflow - waveInflow(DIKE_I1, w.cfg.growth, wave)) < 1e-3);
  }
});

test('SIM-09/10: pump removes its tick budget; a third pump is refused; cash −1 per second', () => {
  const t = buildTerrain(DIKE_VILLAGE);
  const w = createWorld(t, { I1: DIKE_I1 }, { cash: 150 });
  const W = t.grid.width;
  const ids = [addPump(w, 20 * W + 20), addPump(w, 20 * W + 40), addPump(w, 70 * W + 30)];
  for (let i = 0; i < w.grid.w.length; i++) w.grid.w[i] = 0.5;
  assert.equal(setPump(w, ids[0], true), null);
  assert.equal(setPump(w, ids[1], true), null);
  assert.equal(setPump(w, ids[2], true), 'maxOn');
  setPump(w, ids[1], false);
  const before = totalWater(w.grid, false);
  w.cfg.evap = 0; w.cfg.outletRate = 0;
  w.cfg.K = 0; // freeze flow so only the pump acts
  startWave(w, 1); w.waveParams.mul = 0;
  stepSim(w);
  assert.ok(Math.abs(before - totalWater(w.grid, false) - w.pumpBudget) < 1e-5);
  for (let k = 1; k < 30; k++) stepSim(w);
  assert.equal(w.cash, 149);
});

test('P1-C: power capacity limits simultaneous pumps without changing the default', () => {
  const t = buildTerrain(DIKE_VILLAGE);
  const w = createWorld(t, { I1: DIKE_I1 }, { cash: 100 });
  const ids = [addPump(w, 20 * t.grid.width + 20), addPump(w, 20 * t.grid.width + 40)];
  assert.equal(w.cfg.pumpPowerCapacity, 2);
  w.cfg.pumpPowerCapacity = 1;
  assert.equal(setPump(w, ids[0], true), null);
  assert.equal(setPump(w, ids[1], true), 'maxOn');
  assert.equal(w.pumps[1].on, false);
  assert.equal(setPump(w, ids[0], false), null);
  assert.equal(setPump(w, ids[1], true), null);
});

test('P1-C: routed pump preserves water and stops at discharge capacity', () => {
  const g = flatGrid(8, 1);
  const t = { grid: g, baseCore: new Uint32Array(0), baseX: 0, baseY: 0, inlets: [], distToBase: new Uint16Array(8) };
  const w = createWorld(t, { I1: 100 }, { cash: 100, cfg: { pumpRadius: 0, pumpRate: 0.5, pumpDischargeCellCap: 0.6, evap: 0, outletRate: 0 } });
  w.pumpBudget = 0.5;
  const id = addPump(w, 1);
  assert.equal(setPumpDischarge(w, id, 7), true);
  assert.equal(setPump(w, id, true), null);
  g.w[1] = 1;
  g.w[7] = 0.55;
  const before = totalWater(g, false), drained = w.metrics.drained;
  applySinks(w);
  assert.ok(Math.abs(totalWater(g, false) - before) < 1e-10);
  assert.ok(Math.abs(g.w[7] - 0.6) < 1e-10);
  assert.equal(w.metrics.drained, drained);
  const after = g.w[1];
  applySinks(w);
  assert.equal(g.w[1], after, 'full discharge cell blocks further transfer');
  assert.equal(setPumpDischarge(w, id, 99), false);
  assert.equal(setPumpDischarge(w, id, null), true);
  applySinks(w);
  assert.ok(w.metrics.drained > drained, 'outside-map discharge counts as drained');
});

test('pumps stop when cash runs out', () => {
  const t = buildTerrain(DIKE_VILLAGE);
  const w = createWorld(t, { I1: DIKE_I1 }, { cash: 1 });
  setPump(w, addPump(w, 20 * t.grid.width + 20), true);
  startWave(w, 1);
  let empty = false;
  for (let k = 0; k < 31; k++) { stepSim(w); empty ||= w.events.cashEmpty; }
  assert.equal(w.cash, 0);
  assert.ok(empty);
  assert.equal(w.pumps[0].on, false);
  assert.equal(setPump(w, 0, true), 'noCash');
});

// ---------------------------------------------------------------- ice
test('ice blocks flow, melts 0.0008/tick, and conserves water+ice', () => {
  const g = flatGrid(5, 1), sc = createFluidScratch(5);
  placeIce(g, [2], 1.0);
  g.w[0] = 0.5; g.w[1] = 0.5;
  const before = totalWater(g);
  for (let k = 0; k < 100; k++) { fluidStep(g, K, sc); meltIce(g, 0.0008, 1e-6); }
  assert.ok(Math.abs(g.ice[2] - (1.0 - 100 * 0.0008)) < 1e-9);
  // upstream water is held; only meltwater (shed both ways off the ice) moves
  assert.ok(g.w[0] + g.w[1] >= 1.0 - 1e-9, 'dam holds the upstream water');
  assert.ok(g.w[3] + g.w[4] <= 100 * 0.0008, 'downstream gets at most the meltwater');
  for (let k = 0; k < 2000; k++) { fluidStep(g, K, sc); meltIce(g, 0.0008, 1e-6); }
  assert.equal(g.ice[2], 0);
  assert.ok(g.w[4] > 0.25, 'water released after the dam melts');
  assert.ok(Math.abs(totalWater(g) - before) < 1e-9);
});

test('freeze converts the given fraction of water to ice', () => {
  const g = flatGrid(2, 1);
  g.w[0] = 0.4;
  assert.ok(Math.abs(freezeCells(g, [0], 0.5) - 0.2) < 1e-7);
  assert.ok(Math.abs(g.ice[0] - 0.2) < 1e-7 && Math.abs(g.w[0] - 0.2) < 1e-7);
});

function glacierStrip(fractureHead: number) {
  // 1 × 12 strip: lake (4 cells × 0.8) behind an ice cell (1.0), dry flat ground downstream
  const g = flatGrid(12, 1), sc = createFluidScratch(12);
  for (let x = 0; x < 4; x++) g.w[x] = 0.8;
  placeIce(g, [4], 1.0);
  const lake = () => g.w[0] + g.w[1] + g.w[2] + g.w[3];
  let leak = -1, half = -1, shattered = -1;
  for (let k = 0; k < 3000; k++) {
    fluidStep(g, K, sc); meltIce(g, 0.0008, 1e-6);
    if (fractureIce(g, fractureHead) > 0 && shattered < 0) shattered = k;
    if (leak < 0 && lake() < 3.2 - 0.01) leak = k;
    if (half < 0 && lake() < 3.2 / 2) half = k;
  }
  return { leak, half, shattered };
}
test('glacier lake: the ice dam holds the lake, then bursts once overtopped', () => {
  const burst = glacierStrip(DEFAULT_SIM_CONFIG.iceFractureHead);
  const meltOnly = glacierStrip(0);
  // crest 1.0 − 0.0008·t meets the lake surface (0.8 + meltwater) after ≈ 250 ticks
  assert.ok(burst.leak > 200, `lake leaked early at ${burst.leak}`);
  assert.ok(burst.shattered >= 0 && burst.shattered - burst.leak <= 5, 'dam shatters as soon as it is overtopped');
  // melt-only release is paced by the crest (≈ 0.0008/tick); the burst is several times faster
  assert.ok((burst.half - burst.leak) * 3 < meltOnly.half - meltOnly.leak, `burst ${burst.half - burst.leak} vs melt ${meltOnly.half - meltOnly.leak}`);
});

test('ice fracture leaves freeze films on still water intact and conserves mass', () => {
  const g = flatGrid(6, 6);
  g.w.fill(0.3);
  freezeCells(g, Array.from({ length: 36 }, (_, i) => i), 0.5);
  const before = totalWater(g);
  assert.equal(fractureIce(g, DEFAULT_SIM_CONFIG.iceFractureHead), 0);
  g.w[0] = 2.0; // big head difference next to an overtopped film
  assert.ok(fractureIce(g, DEFAULT_SIM_CONFIG.iceFractureHead) > 0);
  assert.ok(Math.abs(totalWater(g) - before - 1.85) < 1e-9);
});

test('glacier ice (FLAG.glacier) melts at glacierMelt, other ice at iceMelt', () => {
  const g = flatGrid(2, 1);
  placeIce(g, [0], 1.0, true);
  placeIce(g, [1], 1.0);
  for (let k = 0; k < 100; k++) meltIce(g, DEFAULT_SIM_CONFIG.iceMelt, 1e-6, DEFAULT_SIM_CONFIG.glacierMelt);
  assert.ok(Math.abs(g.ice[0] - (1 - 100 * DEFAULT_SIM_CONFIG.glacierMelt)) < 1e-9);
  assert.ok(Math.abs(g.ice[1] - (1 - 100 * DEFAULT_SIM_CONFIG.iceMelt)) < 1e-9);
});

test('ice wall: freezes existing water into the wall cells, mass conserving', () => {
  const g = flatGrid(10, 1);
  const src = [0, 1, 2, 3], wall = [5, 6];
  for (const c of src) g.w[c] = 0.5;
  const before = totalWater(g);
  assert.ok(Math.abs(freezeToWall(g, src, wall, 0.4) - 0.8) < 1e-9);
  assert.ok(Math.abs(g.ice[5] - 0.4) < 1e-9 && Math.abs(g.ice[6] - 0.4) < 1e-9);
  assert.ok(Math.abs(totalWater(g) - before) < 1e-12);
  // not enough water: wall is built partially, nothing created
  const g2 = flatGrid(4, 1); g2.w[0] = 0.1;
  assert.ok(Math.abs(freezeToWall(g2, [0], [2, 3], 0.4) - 0.1) < 1e-12);
  assert.ok(Math.abs(totalWater(g2) - 0.1) < 1e-12);
});

// ---------------------------------------------------------------- SIM-04 stability
test('SIM-04: 100k ticks on random terrain → no NaN, no negatives, no sustained oscillation', () => {
  const g = randomGrid(9), n = g.w.length, sc = createFluidScratch(n), r = createRng(seedState(10));
  const last = new Float32Array(n), prevD = new Float32Array(n), flips = new Uint16Array(n);
  let worstFlips = 0;
  for (let t = 0; t < 100000; t++) {
    if (t % 45 === 0) g.w[r.int(n)] += 0.5;
    last.set(g.w);
    fluidStep(g, K, sc);
    meltIce(g, 0.0008, 1e-6);
    for (let i = 0; i < n; i++) {
      const v = g.w[i];
      if (!(v >= 0) || !(g.ice[i] >= 0)) assert.fail(`bad value ${v} at cell ${i}, tick ${t}`);
      const d = v - last[i];
      if (Math.abs(d) > 1e-5 && d * prevD[i] < 0) { if (++flips[i] > worstFlips) worstFlips = flips[i]; } else flips[i] = 0;
      prevD[i] = d;
    }
  }
  // damped transients alternate for ~12 ticks; 30 alternating ticks (1 s) would be sustained
  assert.ok(worstFlips < 30, `sign alternated ${worstFlips} ticks in a row`);
});

// ---------------------------------------------------------------- terrain
test('terrain: base is the lowest ground; 9 base cells; inlet/outlet flags on edges', () => {
  const t = buildTerrain(DIKE_VILLAGE);
  const g = t.grid;
  let min = Infinity;
  for (let i = 0; i < g.h.length; i++) min = Math.min(min, g.h[i]);
  const centre = t.baseY * g.width + t.baseX;
  assert.ok(g.h[centre] - min <= 0.05, 'TER-03');
  assert.equal(t.baseCore.length, 9);
  for (const c of t.baseCore) assert.ok(g.flags[c] & FLAG.baseCore);
  assert.equal(t.inlets.length, 4);
  let outlets = 0;
  for (let i = 0; i < g.flags.length; i++) if (g.flags[i] & FLAG.outlet) outlets++;
  assert.equal(outlets, 8);
});

// ---------------------------------------------------------------- calibration (GD §25)
function playStrategy(name: string) {
  const { t, w } = dikeWorld();
  STRATEGIES[name](w, t);
  return runWaves(w, 1, 5, repairLevees);
}
test('calibration 둑마을: no defence → defeat in W2', () => {
  const r = playStrategy('none');
  assert.equal(r.result, 'defeat'); assert.equal(r.wave, 2);
});
test('calibration 둑마을: one pump on the path alone cannot clear', () => {
  assert.equal(playStrategy('onePumpOnPath').result, 'defeat');
});
test('calibration 둑마을: levee ring + one pump clears (levees re-cast each wave)', () => {
  const r = playStrategy('ringPlusPump');
  assert.equal(r.result, 'clear');
  assert.ok(r.hp > 0);
});

// ---------------------------------------------------------------- glacier lake calibration (AC 7)
function playGlacier(upkeep: boolean) {
  const { t, w } = dikeWorld();
  const { inside, rim } = addGlacierLake(w, t);
  STRATEGIES.ringPlusPump(w, t);
  let last = -Infinity;
  return runWaves(w, 1, 5, repairLevees, undefined, ww => {
    // the player keeps the dam: refreeze lake water into the rim whenever the cooldown allows
    if (upkeep && ww.tick > 0 && ww.tick - last >= FREEZE_COOLDOWN) {
      freezeToWall(ww.grid, inside, rim, GLACIER_POCKET.rim); last = ww.tick;
    }
  });
}
test('glacier lake is a threat: the calibrated ring + pump defence fails when the dam melts', () => {
  assert.equal(playGlacier(false).result, 'defeat');
});
test('glacier lake is a counter: keeping the ice dam frozen saves the same defence', () => {
  const r = playGlacier(true);
  assert.equal(r.result, 'clear');
  assert.ok(r.hp > 0);
});
