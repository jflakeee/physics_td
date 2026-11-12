// V4: tap to gather, respawn, build and upgrade with wood and stone, numbers over wheels.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canBuild, canUpgrade, chooseCard, createHydro, gather, lacking, nodeSpots, placeBuilding, start, tick, upgrade, upgradeCost, W,
  type HydroWorld, type NodeKind,
} from '../../../prototypes/v4-hydro/core.ts';
import { restoreRun, snapshotRun } from '../../../prototypes/v4-hydro/meta.ts';
import { T } from '../../../prototypes/v4-hydro/tuning.ts';

const run = (w: HydroWorld, sec: number) => { const end = w.tick + sec * 30; while (w.tick < end && w.phase !== 'won' && w.phase !== 'lost') { if (w.phase === 'levelup') chooseCard(w, w.cards[0]); tick(w); } };
const first = (w: HydroWorld, kind: NodeKind) => w.nodes.findIndex(n => n.kind === kind);
const site = (w: HydroWorld, build: string, free = true) => w.map.sites.find(s => s.build === build && (!free || !w.built[s.id]))!.id;

test('the_map_starts_with_trees_rocks_flowers_and_bushes_to_gather', () => {
  const w = createHydro(1);
  assert.equal(w.nodes.length, nodeSpots(w.map).length);
  for (const k of ['tree', 'rock', 'flower', 'bush'] as NodeKind[]) assert.ok(first(w, k) >= 0, k);
  assert.ok(w.nodes.filter(n => n.kind === 'tree').length > w.nodes.length / 3, 'mostly trees');
  assert.deepEqual(w.mats, { wood: 0, stone: 0 });
});

test('tapping_gathers_the_right_material_and_reports_the_number', () => {
  const w = createHydro(1), coins = w.coins;
  assert.deepEqual(gather(w, first(w, 'tree')), { cell: w.nodes[w.nodes.findIndex(n => n.kind === null)].cell, amount: T.gather.tree.wood, what: 'wood' });
  assert.equal(gather(w, first(w, 'rock'))?.what, 'stone');
  assert.equal(gather(w, first(w, 'flower'))?.amount, T.gather.flower.coins);
  assert.equal(gather(w, first(w, 'bush'))?.what, 'coins');
  assert.deepEqual(w.mats, { wood: T.gather.tree.wood, stone: T.gather.rock.stone });
  assert.equal(w.coins, coins + T.gather.flower.coins + T.gather.bush.coins);
  assert.equal(w.record.gathered, 4);
  const empty = w.nodes.findIndex(n => n.kind === null);
  assert.equal(gather(w, empty), null, 'an empty spot gives nothing');
});

test('an_empty_spot_grows_something_back_and_all_four_kinds_can_return', () => {
  const w = createHydro(1); w.hearts = 999; start(w);
  const k = first(w, 'tree'); gather(w, k);
  run(w, T.respawnSeconds - 1); assert.equal(w.nodes[k].kind, null);
  run(w, 2); assert.ok(w.nodes[k].kind, 'grown back');
  // gather everything a few times over: every kind comes back at some point
  const seen = new Set<string>();
  for (let round = 0; round < 6; round++) { w.nodes.forEach((_, i) => gather(w, i)); run(w, T.respawnSeconds + 1); w.nodes.forEach(n => n.kind && seen.add(n.kind)); }
  assert.deepEqual([...seen].sort(), ['bush', 'flower', 'rock', 'tree']);
});

test('building_needs_coins_and_materials', () => {
  const w = createHydro(1), wall = site(w, 'wall');
  assert.equal(canBuild(w, wall), false);
  assert.deepEqual(lacking(w, wall), { coins: 0, wood: T.mat.wall.wood, stone: T.mat.wall.stone });
  w.mats = { wood: 5, stone: 5 };
  assert.ok(placeBuilding(w, wall));
  assert.deepEqual(w.mats, { wood: 5 - T.mat.wall.wood, stone: 5 - T.mat.wall.stone });
  assert.equal(w.lvl[wall], 1);
});

test('upgrades_cost_wood_and_stone_and_stop_at_level_three', () => {
  const w = createHydro(1), wheel = w.plants[0].site;
  assert.deepEqual(upgradeCost(w, wheel), T.upgrade.cost.wheel);
  assert.equal(canUpgrade(w, wheel), false);
  w.mats = { wood: 100, stone: 100 };
  assert.ok(upgrade(w, wheel));
  assert.deepEqual(upgradeCost(w, wheel), { wood: T.upgrade.cost.wheel.wood * 2, stone: T.upgrade.cost.wheel.stone * 2 });
  assert.ok(upgrade(w, wheel));
  assert.equal(w.lvl[wheel], 3);
  assert.equal(upgradeCost(w, wheel), null);
  assert.equal(upgrade(w, wheel), false);
  assert.equal(upgradeCost(w, site(w, 'reservoir')), null, 'not built yet');
});

test('an_upgraded_wheel_makes_more_power', () => {
  const powerAt = (lvl: number) => { const w = createHydro(1); w.mats = { wood: 100, stone: 100 }; for (let k = 1; k < lvl; k++) upgrade(w, w.plants[0].site); start(w); run(w, 20); return w.plants[0].power; };
  const p1 = powerAt(1), p3 = powerAt(3);
  assert.ok(Math.abs(p3 / p1 - (1 + 2 * T.upgrade.wheelPower)) < 0.01, `×${(p3 / p1).toFixed(3)}`);
});

test('an_upgraded_wall_is_higher_and_an_upgraded_reservoir_deeper', () => {
  const w = createHydro(1); w.coins = 1e6; w.mats = { wood: 1e6, stone: 1e6 };
  const wall = site(w, 'wall'), res = site(w, 'reservoir'), rs = w.map.sites[res];
  placeBuilding(w, wall); placeBuilding(w, res);
  const top = () => Math.max(...w.g.wall), floor = () => w.g.h[rs.y * W + rs.x];
  const t1 = top(), f1 = floor();
  upgrade(w, wall); upgrade(w, res);
  assert.ok(Math.abs(top() - t1 - T.upgrade.wallHeight) < 1e-6);
  assert.ok(Math.abs(f1 - floor() - T.upgrade.reservoirDepth) < 1e-6);
});

test('each_second_a_working_wheel_reports_the_power_it_made_and_the_coins_earned', () => {
  const w = createHydro(1); start(w);
  const gains: { amount: number; what: string }[] = [];
  let xp = 0;
  for (let k = 0; k < 30 * 5; k++) { const before = w.xp; tick(w); xp += w.xp - before; for (const g of w.gains) gains.push({ ...g }); }
  const power = gains.filter(g => g.what === 'power'), coins = gains.filter(g => g.what === 'coins');
  assert.equal(power.length, 5, 'one number per second for the one wheel');
  assert.ok(Math.abs(power.reduce((a, g) => a + g.amount, 0) - xp) <= 3, 'the numbers add up to the power made (rounded)');
  assert.equal(coins.length, 10, 'each second: the wheel\'s coin and the village\'s');
  assert.equal(coins.reduce((a, g) => a + g.amount, 0), 5 * (T.coinPerWheel + T.coinVillage));
});

test('a_saved_run_keeps_materials_levels_and_what_was_gathered', () => {
  const w = createHydro(1); w.mats = { wood: 30, stone: 30 }; w.hearts = 999;
  upgrade(w, w.plants[0].site); gather(w, first(w, 'rock')); start(w); run(w, 10);
  const back = restoreRun(snapshotRun(w))!;
  assert.deepEqual(back.mats, w.mats);
  assert.deepEqual(back.lvl, w.lvl);
  assert.deepEqual(back.nodes, w.nodes);
  run(w, 20); run(back, 20);
  assert.deepEqual(back.nodes, w.nodes, 'the same things grow back');
  assert.equal(back.xp, w.xp);
});

test('coins_grow_with_the_number_of_working_wheels', () => {
  // regression: income was a flat 2 a second however many wheels turned
  const income = (extra: number[]) => {
    const w = createHydro(1); w.coins = 1e6; w.mats = { wood: 1e6, stone: 1e6 }; w.hearts = 999;
    for (const s of extra) placeBuilding(w, s);
    start(w); run(w, 5);
    const before = w.coins; run(w, 10);
    return (w.coins - before) / 10;
  };
  assert.equal(income([]), T.coinPerWheel + T.coinVillage);
  assert.equal(income([3, 4]), 3 * T.coinPerWheel + T.coinVillage);
  assert.equal(income([0, 3, 4, 5]), 5 * T.coinPerWheel + T.coinVillage);
});

test('rapid repeated taps cannot collect one node twice', () => {
  const w = createHydro(1);
  const i = first(w, 'tree');
  const before = { ...w.mats }, count = w.record.gathered;
  assert.ok(gather(w, i));
  assert.equal(gather(w, i), null);
  assert.equal(gather(w, i), null);
  assert.equal(w.mats.wood, before.wood + T.gather.tree.wood);
  assert.equal(w.mats.stone, before.stone);
  assert.equal(w.record.gathered, count + 1);
});

test('rapid repeated building taps cannot spend or construct twice', () => {
  const w = createHydro(1);
  w.coins = 1000; w.mats = { wood: 100, stone: 100 };
  const id = site(w, 'wall');
  assert.equal(placeBuilding(w, id), true);
  const after = { coins: w.coins, mats: { ...w.mats }, count: w.record.builds };
  assert.equal(placeBuilding(w, id), false);
  assert.deepEqual({ coins: w.coins, mats: w.mats, count: w.record.builds }, after);
});

test('saving after gathering prevents collecting the same empty node again', () => {
  const w = createHydro(1);
  const i = first(w, 'rock');
  assert.ok(gather(w, i));
  const back = restoreRun(snapshotRun(w))!;
  const before = { ...back.mats }, count = back.record.gathered;
  assert.equal(gather(back, i), null);
  assert.deepEqual(back.mats, before);
  assert.equal(back.record.gathered, count);
});

test('saved run preserves coin income and wheel count across the next second', () => {
  const w = createHydro(1);
  w.coins = 1000; w.mats = { wood: 100, stone: 100 }; w.hearts = 999;
  placeBuilding(w, site(w, 'wheel'));
  start(w);
  run(w, 5);
  const back = restoreRun(snapshotRun(w))!;
  assert.equal(back.coins, w.coins);
  assert.equal(back.plants.length, w.plants.length);
  run(w, 1); run(back, 1);
  assert.equal(back.coins, w.coins);
  assert.equal(back.lastSecPower, w.lastSecPower);
});
