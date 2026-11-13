// V4 reservoirs (docs/REDESIGN_V4_HYDRO.md §4): they keep high water and give it back in a drought.
// Regressions found 2026-11-13: (1) the sand spirit took reservoir water for a flood and sandbagged the
// cut to the river shut; (2) most of a bowl sat below the river and never drained (no sluice).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { balance, chooseCard, createHydro, placeBuilding, start, tick, W, type HydroWorld } from '../../../prototypes/v4-hydro/core.ts';

const RES_ROW = 18;
const build = (reservoirs: boolean, sand = 0) => {
  const w = createHydro(1); w.coins = 1e6; w.mats = { wood: 1e6, stone: 1e6 }; w.hearts = 999;
  if (reservoirs) for (const s of w.map.sites) if (s.build === 'reservoir') placeBuilding(w, s.id);
  w.skill.sand = sand; if (sand) w.spiritTimer.sand = 30;
  return w;
};
const until = (w: HydroWorld, sec: number, each?: (w: HydroWorld) => void) => {
  if (w.phase === 'ready') start(w);
  while (w.tick < sec * 30 && w.phase !== 'won' && w.phase !== 'lost') {
    if (w.phase === 'levelup') chooseCard(w, w.cards.find(c => c !== 'sand') ?? w.cards[0]);
    tick(w); each?.(w);
  }
};
/** Water + ice in the bowls (radius 5 around each built reservoir, off the river). */
const held = (w: HydroWorld) => {
  let s = 0;
  w.map.sites.forEach((st, id) => {
    if (w.built[id] !== 'reservoir') return;
    for (let y = st.y - 5; y <= st.y + 5; y++) for (let x = st.x - 5; x <= st.x + 5; x++) {
      const i = y * W + x; if ((x - st.x) ** 2 + (y - st.y) ** 2 <= 25 && !w.channel[i]) s += w.g.w[i] + w.g.ice[i];
    }
  });
  return s;
};

test('the_sand_spirit_never_sandbags_the_cut_between_a_reservoir_and_the_river', () => {
  const w = build(true, 5);
  const st = w.map.sites.find(s => s.build === 'reservoir' && s.y === RES_ROW)!, rx = Math.round(w.map.river(st.y));
  const cut: number[] = [];
  for (let x = Math.min(st.x, rx); x <= Math.max(st.x, rx); x++) for (const y of [st.y, st.y + 1]) if (!w.channel[y * W + x]) cut.push(y * W + x);
  let blocked = 0;
  until(w, 100, w => { for (const i of cut) if (w.g.tmp[i] > 0) blocked++; });
  assert.equal(blocked, 0, `sandbag ticks on the cut: ${blocked}`);
});

test('in_a_drought_the_reservoirs_give_their_water_back', () => {
  const w = build(true);
  until(w, 72); // spring: thaw (high) then clear; the drought starts at 72 s
  const before = held(w);
  until(w, 98);
  assert.ok(before > 20, `stored ${before.toFixed(1)}`);
  assert.ok(held(w) < before * 0.7, `released: ${held(w).toFixed(1)} of ${before.toFixed(1)}`);
  assert.ok(Math.abs(balance(w)) < 1e-8);
});

test('reservoirs_make_more_power_in_a_drought_than_no_reservoirs', () => {
  const droughtPower = (res: boolean) => { const w = build(res); until(w, 72); const p = w.record.power; until(w, 98); return w.record.power - p; };
  const without = droughtPower(false), withRes = droughtPower(true);
  assert.ok(withRes > without * 1.15, `${withRes.toFixed(0)} vs ${without.toFixed(0)}`);
});

test('outside_a_drought_with_enough_power_the_sluices_stay_shut', () => {
  const w = build(true);
  until(w, 60);
  let opened = 0;
  until(w, 70, w => { if (w.lastSecPower >= 2.4 + 0.025 * w.tick / 30) opened += w.sluiceOpen.length; });
  assert.equal(opened, 0);
});
