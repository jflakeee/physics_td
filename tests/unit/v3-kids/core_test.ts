// V3 kids prototype rules (docs/REDESIGN_V3_KIDS.md §3–§4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createKidsWorld, fenceHealth, KIND, lineCells, pickUpgrade, startWave, tick, upgradeChoices, useSkill, useUlt,
  villageWater, waterBalance, type KidsWorld,
} from '../../../prototypes/v3-kids/core.ts';
import { TUNING } from '../../../prototypes/v3-kids/tuning.ts';

const W = 64;
const playOut = (w: KidsWorld, each: (w: KidsWorld) => void = () => {}) => {
  startWave(w);
  for (let n = 0; n < 2e5 && w.phase !== 'won' && w.phase !== 'lost'; n++) {
    if (w.phase === 'pick') pickUpgrade(w, upgradeChoices(w)[0] ?? null);
    each(w);
    tick(w);
  }
};

test('water_is_conserved_through_sand_digging_and_basins', () => {
  const w = createKidsWorld('keeper');
  startWave(w);
  useSkill(w, 'sand', [[32, 40]]);
  w.char = { ...w.char, skills: ['dig', 'basin'] };
  useSkill(w, 'dig', [[5, 50], [40, 50]]);
  useSkill(w, 'basin', [[32, 70]]);
  for (let k = 0; k < 900; k++) tick(w);
  assert.ok(w.inflow > 0 && w.drained > 0);
  assert.ok(Math.abs(waterBalance(w)) < 1e-9, `balance ${waterBalance(w)}`);
});

test('doing_nothing_loses_and_records_where_the_fence_broke', () => {
  const w = createKidsWorld('mole');
  playOut(w);
  assert.equal(w.phase, 'lost');
  assert.ok(w.breaches.length > 0);
  assert.ok(villageWater(w) > TUNING.villageLimit);
});

test('a_wall_across_the_field_wins_the_map', () => {
  const w = createKidsWorld('keeper');
  let k = 0;
  const segs = [[1, 22], [22, 43], [43, 62]];
  playOut(w, x => {
    if (!x.cd.wall && k < 3 && useSkill(x, 'wall', [[segs[k][0], 66], [segs[k][1], 66]])) k++;
    if (x.ult >= 1) useUlt(x);
  });
  assert.equal(w.phase, 'won');
  assert.ok(w.stars >= 2);
});

test('dragged_lines_are_4_connected_so_water_cannot_slip_through_a_diagonal', () => {
  const w = createKidsWorld('keeper');
  const cells = new Set(lineCells(w, [[10, 20], [20, 30]], 100));
  for (const i of cells) {
    const x = i % W, y = (i / W) | 0;
    if (x === 20 && y === 30) continue;
    const next = [i + 1, i - 1, i + W, i - W].filter(j => cells.has(j));
    assert.ok(next.length >= 1, `isolated cell ${x},${y}`);
  }
  // every diagonal pair has a shared orthogonal neighbour in the line
  for (const i of cells) for (const j of [i + W + 1, i + W - 1]) {
    if (!cells.has(j)) continue;
    assert.ok(cells.has(i + W) || cells.has(j - W + (j - i - W)) || cells.has(i + (j - i - W)), 'diagonal gap');
  }
});

test('skills_never_touch_the_fence_village_or_side_rivers', () => {
  const w = createKidsWorld('mole');
  const before = w.g.h.slice();
  useSkill(w, 'dig', [[1, 70], [62, 95]]);
  for (let y = TUNING.aimRows[1] + 1; y < 96; y++) for (let x = 0; x < W; x++) assert.equal(w.g.h[y * W + x], before[y * W + x]);
  for (let y = 0; y < 96; y++) for (const x of [0, W - 1]) if (w.kind[y * W + x] === KIND.outlet) assert.equal(w.g.h[y * W + x], before[y * W + x]);
});

test('sand_stops_soaking_when_full', () => {
  const w = createKidsWorld('keeper');
  useSkill(w, 'sand', [[32, 20]]);
  const cells: number[] = [];
  for (let i = 0; i < w.sandCap.length; i++) if (w.sandCap[i] > 0) cells.push(i);
  startWave(w);
  for (let k = 0; k < 2000 && w.phase !== 'lost'; k++) tick(w);
  for (const i of cells) assert.ok(w.sandHeld[i] <= TUNING.sandCap + 1e-12);
});

test('cooldown_blocks_a_second_use_and_upgrades_stop_at_three_stars', () => {
  const w = createKidsWorld('keeper');
  assert.ok(useSkill(w, 'wall', [[10, 40], [20, 40]]) > 0);
  assert.equal(useSkill(w, 'wall', [[10, 50], [20, 50]]), 0);
  w.phase = 'pick'; pickUpgrade(w, 'wall'); w.phase = 'pick'; pickUpgrade(w, 'wall');
  assert.equal(w.level.wall, 3);
  w.phase = 'pick';
  assert.deepEqual(upgradeChoices(w), ['sand']);
});

test('the_fence_ultimate_restores_the_fence', () => {
  const w = createKidsWorld('keeper');
  startWave(w); w.phase = 'wave';
  for (let x = 0; x < W; x++) w.g.dur[TUNING.fenceRow * W + x] = 0.2;
  w.ult = 1;
  assert.ok(useUlt(w));
  assert.equal(fenceHealth(w), 1);
  assert.equal(w.ult, 0);
});

test('auto_aim_is_deterministic_and_beats_doing_nothing_over_its_horizon', async () => {
  const { autoAim, cloneWorld, threat } = await import('../../../prototypes/v3-kids/auto.ts');
  const w = createKidsWorld('keeper');
  startWave(w); w.phase = 'wave';
  for (let k = 0; k < 400; k++) tick(w);
  const a = autoAim(w, 'wall'), b = autoAim(w, 'wall');
  assert.ok(a);
  assert.deepEqual(a, b);
  const run = (c: KidsWorld) => { for (let k = 0; k < 120; k++) tick(c); return threat(c); };
  const placed = cloneWorld(w); useSkill(placed, 'wall', a);
  assert.ok(run(placed) < run(cloneWorld(w)));
});
