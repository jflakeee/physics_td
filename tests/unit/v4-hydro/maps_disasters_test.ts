// V4: one map per stage, wheel synergy and spin, disasters other than plain high water.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { balance, chooseCard, createHydro, MAPS, placeBuilding, start, tick, W, H, type HydroWorld } from '../../../prototypes/v4-hydro/core.ts';
import { restoreRun, snapshotRun } from '../../../prototypes/v4-hydro/meta.ts';
import { SPRITES } from '../../../prototypes/v4-hydro/sprites.ts';
import { T } from '../../../prototypes/v4-hydro/tuning.ts';

const run = (w: HydroWorld, toSec: number) => { while (w.tick < toSec * 30 && w.phase !== 'won' && w.phase !== 'lost') { if (w.phase === 'levelup') chooseCard(w, w.cards[0]); tick(w); } };
const immortal = (stage: number) => { const w = createHydro(1, { stage }); w.hearts = 999; start(w); return w; };

test('each_stage_has_its_own_valid_map', () => {
  assert.equal(MAPS.length, 3);
  const rivers = MAPS.map(m => [10, 40, 70].map(y => Math.round(m.river(y))).join());
  assert.equal(new Set(rivers).size, 3, 'three different rivers');
  MAPS.forEach((m, k) => {
    const w = createHydro(1, { stage: k });
    assert.equal(w.map.id, m.id);
    let channel = 0, village = 0;
    for (let i = 0; i < W * H; i++) { channel += w.channel[i]; village += w.village[i]; assert.ok(!(w.channel[i] && w.village[i]), 'village off the river'); }
    assert.ok(channel > 400 && village > 150);
    assert.equal(m.sites.filter(s => s.build === 'wheel').length, 6);
    assert.equal(m.sites.filter(s => s.build === 'reservoir').length, 3);
    assert.equal(m.sites.filter(s => s.build === 'wall').length, 3);
    for (const s of m.sites) {
      assert.ok(s.x > 2 && s.x < W - 3 && s.y > 2 && s.y < H - 3, `site ${s.id} on the board`);
      assert.ok(!w.village[s.y * W + s.x], `site ${s.id} not in the village`);
      assert.equal(!!w.channel[s.y * W + s.x], s.build === 'wheel', `site ${s.id} ${s.build}`);
    }
    for (const a of m.sites) for (const b of m.sites) if (a.id < b.id) assert.ok((a.x - b.x) ** 2 + (a.y - b.y) ** 2 >= 25, `sites ${a.id} and ${b.id} apart`);
    assert.equal(w.plants.length, 1, 'one wheel to start');
    assert.equal(w.plants[0].site, m.startSite);
  });
});

test('more_working_wheels_lift_every_wheel', () => {
  const powerOf = (sites: number[]) => {
    const w = createHydro(1); w.coins = 1e6; w.mats = { wood: 1e6, stone: 1e6 };
    for (const s of sites) placeBuilding(w, s);
    start(w); run(w, 20);
    return w.plants.map(p => p.power);
  };
  const one = powerOf([]), three = powerOf([3, 4]);
  assert.ok(Math.abs(three[0] / one[0] - (1 + 2 * T.synergy)) < 0.02, `first wheel ×${(three[0] / one[0]).toFixed(3)}`);
  assert.ok(three.reduce((a, b) => a + b, 0) > one[0] * 2);
});

test('a_wheel_turns_while_it_makes_power_and_stops_when_dry', () => {
  assert.equal(SPRITES.wheel.length, 32, 'a full turn of frames');
  assert.notDeepEqual(SPRITES.wheel[0].px, SPRITES.wheel[8].px, 'the marked paddle moves');
  const w = createHydro(1); start(w); run(w, 5);
  const a = w.plants[0].spin; run(w, 6);
  assert.ok(w.plants[0].spin - a > 8, 'at least 8 frames per second of power');
  w.g.w.fill(0);
  const base = T.baseInflow; (T as { baseInflow: number }).baseInflow = 0;
  try { const b = w.plants[0].spin; tick(w); assert.equal(w.plants[0].spin, b); } finally { (T as { baseInflow: number }).baseInflow = base; }
});

test('ice_jam_dams_the_river_then_bursts_and_no_water_is_lost', () => {
  const w = immortal(0), row = w.map.jamRow;
  const iceAt = () => { let s = 0; for (let y = row; y < row + T.jam.rows; y++) for (let x = 0; x < W; x++) s += w.g.ice[y * W + x]; return s; };
  let jam = false, burst = false;
  run(w, 39.9); assert.equal(iceAt(), 0);
  while (w.tick < 48 * 30) { tick(w); if (w.phase === 'levelup') chooseCard(w, w.cards[0]); if (w.events.disaster?.kind === 'jam') jam = true; }
  assert.ok(jam && iceAt() > 2, `ice in the jam ${iceAt()}`);
  while (w.tick < 50 * 30) { tick(w); if (w.phase === 'levelup') chooseCard(w, w.cards[0]); if (w.events.disaster?.kind === 'burst') burst = true; }
  assert.ok(burst);
  assert.equal(iceAt(), 0, 'the dam is gone');
  assert.ok(Math.abs(balance(w)) < 1e-8);
});

test('a_saved_run_does_not_replay_a_disaster_it_already_had', () => {
  const w = immortal(0); run(w, 44);
  const back = restoreRun(snapshotRun(w))!;
  let again = false;
  for (let k = 0; k < 30; k++) { tick(back); if (back.events.disaster?.kind === 'jam') again = true; }
  assert.equal(again, false);
  assert.equal(back.jamTicks, w.jamTicks - 30);
});

test('landslide_blocks_the_river_for_a_while', () => {
  const w = immortal(1), row = w.map.slideRow; // stage 2: summer, then autumn with the slide at 58 s
  const blocked = () => { let n = 0; for (let x = 0; x < W; x++) if (w.channel[row * W + x] && w.g.tmp[row * W + x] > 0) n++; return n; };
  let slide = false;
  while (w.tick < (120 + 59) * 30) { tick(w); if (w.phase === 'levelup') chooseCard(w, w.cards[0]); if (w.events.disaster?.kind === 'slide') slide = true; }
  assert.ok(slide && blocked() >= 5, `blocked cells ${blocked()}`);
  run(w, 120 + 59 + T.slide.seconds + 1);
  assert.equal(blocked(), 0, 'washed away');
  assert.ok(Math.abs(balance(w)) < 1e-8);
});

test('a_storm_rains_on_the_whole_valley', () => {
  const w = immortal(0); run(w, 120 + 95); // summer storm from 88 s
  const before = w.inflow;
  tick(w);
  // this tick's new water = the river's inflow (×3.2 in the storm) + the rain on every cell
  assert.ok(Math.abs((w.inflow - before) - T.baseInflow * 3.2 - T.storm.rainPerTick) < 1e-9);
  let land = 0; for (let i = 0; i < W * H; i++) if (!w.channel[i] && !w.village[i] && w.g.w[i] > 0) land++;
  assert.ok(land > 2000, `wet land cells ${land}`);
  assert.ok(Math.abs(balance(w) ) < 1e-6);
});

test('a_wall_does_not_funnel_water_on_the_land_into_the_village', () => {
  // regression: on map 2 a wall trapped overland water behind it and led it into the village
  const w = createHydro(1, { stage: 1 }); w.coins = 1e6; w.mats = { wood: 1e6, stone: 1e6 };
  for (const s of w.map.sites) if (s.build !== 'reservoir' && !w.built[s.id]) placeBuilding(w, s.id);
  const wall = w.map.sites.find(s => s.build === 'wall')!;
  let tie = 0; for (let x = 0; x < W; x++) if (w.g.wall[(wall.y - 8) * W + x] > 0) tie++;
  assert.ok(tie >= 6, `the wall is tied back to high ground (${tie} cells)`);
});
