// V4 hydro prototype rules (docs/REDESIGN_V4_HYDRO.md §2, §4–§7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  balance, canBuild, chooseCard, cost, createHydro, H, placeBuilding, recommend, SITES, start, tick, W, weatherAt, xpNeed,
  type HydroWorld,
} from '../../../prototypes/v4-hydro/core.ts';
import { T } from '../../../prototypes/v4-hydro/tuning.ts';

const runTicks = (w: HydroWorld, n: number) => { for (let k = 0; k < n && w.phase !== 'won' && w.phase !== 'lost'; k++) { if (w.phase === 'levelup') chooseCard(w, w.cards[0]); tick(w); } };
const riverSite = (y: number) => SITES.find(s => s.kind === 'river' && s.y === y)!.id;

test('water_is_conserved_with_plants_reservoirs_walls_and_ice', () => {
  const w = createHydro(1); w.coins = 1e6;
  placeBuilding(w, riverSite(60), 'wheel');
  placeBuilding(w, SITES.find(s => s.kind === 'bank')!.id, 'reservoir');
  placeBuilding(w, SITES.filter(s => s.kind === 'bank')[3].id, 'wall');
  w.skill.ice = 3; w.skill.sand = 3;
  start(w);
  runTicks(w, 30 * 110);
  assert.ok(w.drained > 0);
  assert.ok(Math.abs(balance(w)) < 1e-8, `balance ${balance(w)}`);
});

test('a_plant_makes_power_only_while_water_flows_through_it', () => {
  const w = createHydro(1);
  start(w);
  runTicks(w, 30 * 10);
  const p = w.plants[0];
  assert.ok(p.power > 0);
  // drain the river: no flow, no power
  w.g.w.fill(0);
  (T as { baseInflow: number }).baseInflow = 0;
  try { tick(w); assert.equal(w.plants[0].power, 0); }
  finally { (T as { baseInflow: number }).baseInflow = 0.07; }
});

test('more_inflow_gives_more_power_until_the_turbine_drowns', () => {
  // a wheel on a gentle reach (row 40): slow water there runs deep in a flood
  const at = (mul: number) => {
    const w = createHydro(1); w.coins = 1e6;
    placeBuilding(w, riverSite(40), 'wheel');
    const base = T.baseInflow;
    (T as { baseInflow: number }).baseInflow = base * mul;
    try { start(w); for (let k = 0; k < 30 * 20; k++) { tick(w); if (w.phase === 'levelup') chooseCard(w, w.cards[0]); } return w.plants[1]; }
    finally { (T as { baseInflow: number }).baseInflow = base; }
  };
  const low = at(0.5), mid = at(1), flood = at(6);
  assert.ok(mid.power > low.power, `${mid.power} > ${low.power}`);
  assert.ok(flood.drown > 0.5, `drown ${flood.drown}`);
  assert.ok(flood.power < mid.power, 'a drowned turbine makes less');
});

test('a_reservoir_fills_in_high_water_and_gives_it_back_when_the_river_falls', () => {
  const w = createHydro(1); w.coins = 1e6;
  const site = SITES.find(s => s.kind === 'bank' && s.y === 18)!;
  placeBuilding(w, site.id, 'reservoir');
  const stored = () => { let s = 0; for (let y = site.y - 4; y <= site.y + 4; y++) for (let x = site.x - 4; x <= site.x + 4; x++) s += w.g.w[y * W + x]; return s; };
  start(w);
  const base = T.baseInflow;
  (T as { baseInflow: number }).baseInflow = base * 3;
  try { runTicks(w, 30 * 20); } finally { (T as { baseInflow: number }).baseInflow = base; }
  const full = stored();
  (T as { baseInflow: number }).baseInflow = base * 0.2;
  try { runTicks(w, 30 * 30); } finally { (T as { baseInflow: number }).baseInflow = base; }
  assert.ok(full > 1, `stored ${full}`);
  assert.ok(stored() < full * 0.8, `released: ${stored()} < ${full}`);
});

test('weather_ramps_and_forecasts_the_next_change', () => {
  const a = weatherAt(28), b = weatherAt(33), c = weatherAt(38);
  assert.equal(a.now.kind, 'thaw');
  assert.ok(a.mul < b.mul && b.mul < c.mul);
  assert.equal(weatherAt(20).next?.kind, 'thaw');
  assert.equal(weatherAt(20).nextIn, 8);
});

test('building_rules_sites_and_costs', () => {
  const w = createHydro(1);
  const bank = SITES.find(s => s.kind === 'bank')!.id;
  assert.equal(canBuild(w, bank, 'wheel'), false);
  assert.equal(canBuild(w, riverSite(60), 'wall'), false);
  assert.equal(canBuild(w, riverSite(27), 'wheel'), false, 'occupied by the starting wheel');
  assert.ok(placeBuilding(w, riverSite(60), 'wheel'));
  assert.equal(w.coins, T.startCoins - T.cost.wheel);
  assert.equal(placeBuilding(w, bank, 'reservoir'), false, 'not enough coins');
  w.skill.cheap = 2;
  assert.equal(cost(w, 'wall'), Math.round(T.cost.wall * 0.7));
});

test('levels_follow_the_xp_curve_and_the_first_level_offers_both_spirits', () => {
  assert.equal(xpNeed(1), T.xpBase);
  assert.ok(xpNeed(5) > xpNeed(4));
  const w = createHydro(1);
  start(w);
  while (w.phase === 'run') tick(w);
  assert.equal(w.phase, 'levelup');
  assert.equal(w.level, 2);
  assert.ok(w.cards.includes('sand') && w.cards.includes('ice') && w.cards.length === 3);
  assert.ok(chooseCard(w, 'ice'));
  assert.equal(w.skill.ice, 1);
  assert.equal(w.phase, 'run');
});

test('blackout_costs_a_heart_and_doing_nothing_loses_the_game', () => {
  const w = createHydro(1);
  start(w);
  runTicks(w, 30 * 400);
  assert.equal(w.phase, 'lost');
  assert.equal(w.hearts, 0);
});

test('recommendation_is_deterministic_and_on_a_free_site_of_the_right_kind', () => {
  const w = createHydro(1);
  const a = recommend(w, 'wheel', 30), b = recommend(w, 'wheel', 30);
  assert.equal(a, b);
  assert.ok(a !== null && SITES[a].kind === 'river' && !w.built[a]);
  const r = recommend(w, 'wall', 30);
  assert.ok(r !== null && SITES[r].kind === 'bank');
  assert.equal(H, 96);
});
