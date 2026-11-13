// V4 evolution card (survivors-style): 좋은 터빈 ★5 + 3 wheels → 도수관 (penstock: a longer drop per wheel).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canEvolvePenstock, chooseCard, createHydro, placeBuilding, start, tick, xpNeed, type HydroWorld } from '../../../prototypes/v4-hydro/core.ts';
import { restoreRun, snapshotRun } from '../../../prototypes/v4-hydro/meta.ts';

const wheels = (n: number) => {
  const w = createHydro(1); w.coins = 1e6; w.mats = { wood: 1e6, stone: 1e6 }; w.hearts = 999;
  for (const s of w.map.sites) if (s.build === 'wheel' && w.plants.length < n && !w.built[s.id]) placeBuilding(w, s.id);
  return w;
};
const run = (w: HydroWorld, sec: number) => { if (w.phase === 'ready') start(w); const end = w.tick + sec * 30; while (w.tick < end) { if (w.phase === 'levelup') chooseCard(w, w.cards.find(c => c !== 'penstock') ?? w.cards[0]); tick(w); } };

test('the_evolution_needs_turbine_five_and_three_wheels', () => {
  const w = wheels(3); w.skill.eta = 5;
  assert.equal(canEvolvePenstock(w), true);
  w.skill.eta = 4; assert.equal(canEvolvePenstock(w), false, 'turbine not at ★5');
  const two = wheels(2); two.skill.eta = 5;
  assert.equal(canEvolvePenstock(two), false, 'only two wheels');
  w.skill.eta = 5; w.skill.penstock = 1;
  assert.equal(canEvolvePenstock(w), false, 'only once');
});

test('once_eligible_the_evolution_is_the_first_card_and_never_before', () => {
  const offer = (eta: number) => {
    const w = wheels(3); w.skill.eta = eta; start(w);
    w.xp = xpNeed(w.level) - 0.001;
    for (let k = 0; k < 600 && w.phase !== 'levelup'; k++) tick(w);
    return w.cards;
  };
  const yes = offer(5), no = offer(4);
  assert.equal(yes[0], 'penstock');
  assert.equal(yes.length, 3);
  assert.equal(no.includes('penstock'), false);
});

test('the_penstock_makes_clearly_more_power', () => {
  const powerOf = (evo: number) => { const w = wheels(4); w.skill.eta = 5; w.skill.penstock = evo; run(w, 40); return w.record.power; };
  const without = powerOf(0), withIt = powerOf(1);
  assert.ok(withIt > without * 1.3, `${withIt.toFixed(0)} vs ${without.toFixed(0)}`);
});

test('a_saved_run_keeps_the_evolution', () => {
  const w = wheels(3); w.skill.eta = 5; w.skill.penstock = 1; run(w, 10);
  const back = restoreRun(snapshotRun(w))!;
  assert.equal(back.skill.penstock, 1);
  run(w, 5); run(back, 5);
  assert.equal(back.record.power, w.record.power);
});
