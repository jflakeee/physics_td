// V4 progress between runs (main menu) and stage / character / bonus-skill rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { balance, chooseCard, cost, createHydro, eta, start, tick, type HydroWorld } from '../../../prototypes/v4-hydro/core.ts';
import {
  buyPowerup, defaultMeta, finishRun, loadMeta, META_KEY, openStages, restoreRun, runOptions, snapshotRun, type StorageLike,
} from '../../../prototypes/v4-hydro/meta.ts';
import { GEMS, STAGES, T } from '../../../prototypes/v4-hydro/tuning.ts';

const mem = (): StorageLike & { m: Map<string, string> } => { const m = new Map<string, string>(); return { m, getItem: k => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: k => void m.delete(k) }; };
const run = (w: HydroWorld, n: number) => { for (let k = 0; k < n && w.phase !== 'won' && w.phase !== 'lost'; k++) { if (w.phase === 'levelup') chooseCard(w, w.cards[0]); tick(w); } };

test('a_first_clear_gives_gems_the_bonus_skill_and_the_character_once', () => {
  const m = defaultMeta(), w = createHydro(1, runOptions(m, 0, 'miller'));
  w.phase = 'won'; w.hearts = 2; w.record.power = 600;
  const r = finishRun(m, w);
  assert.equal(r.gems, Math.floor(600 / GEMS.perPower) + 2 * GEMS.perStar);
  assert.equal(r.newSkill, STAGES[0].bonusSkill);
  assert.equal(r.newChar, STAGES[0].unlockChar);
  assert.ok(m.skills.includes('rain') && m.chars.includes('granny'));
  assert.equal(m.stats.wins, 1);
  const again = finishRun(m, w);
  assert.equal(again.newSkill, null, 'only on the first clear');
  assert.equal(openStages(m), 2);
});

test('a_loss_still_pays_for_the_power_made_but_unlocks_nothing', () => {
  const m = defaultMeta(), w = createHydro(1);
  w.phase = 'lost'; w.record.power = 300;
  const r = finishRun(m, w);
  assert.equal(r.gems, 5);
  assert.equal(r.newSkill, null);
  assert.equal(m.stats.losses, 1);
  assert.equal(openStages(m), 1);
});

test('power_ups_cost_gems_and_stop_at_their_last_rank', () => {
  const m = defaultMeta(); m.gems = 1000;
  assert.ok(buyPowerup(m, 'heart'));
  assert.equal(buyPowerup(m, 'heart'), false, 'max 1');
  assert.equal(m.gems, 1000 - 120);
  const poor = defaultMeta();
  assert.equal(buyPowerup(poor, 'purse'), false);
});

test('broken_or_missing_save_data_falls_back_to_defaults', () => {
  const s = mem();
  assert.deepEqual(loadMeta(s), defaultMeta());
  s.setItem(META_KEY, '{not json');
  assert.deepEqual(loadMeta(s), defaultMeta());
  s.setItem(META_KEY, JSON.stringify({ gems: 7 }));
  const m = loadMeta(s);
  assert.equal(m.gems, 7);
  assert.deepEqual(m.chars, ['miller']);
  assert.equal(loadMeta(null).gems, 0);
});

test('a_saved_run_continues_exactly_where_it_stopped', () => {
  const w = createHydro(5, { stage: 1, char: 'frost', powerups: { purse: 2 }, unlocked: ['rain'] });
  start(w); run(w, 30 * 30);
  const back = restoreRun(snapshotRun(w));
  assert.ok(back);
  run(w, 30 * 20); run(back, 30 * 20);
  assert.deepEqual(back.g.w, w.g.w);
  assert.equal(back.xp, w.xp);
  assert.equal(back.coins, w.coins);
  assert.equal(back.stage, 1);
  assert.equal(back.char, 'frost');
  assert.equal(restoreRun('{"v":1}'), null);
  assert.equal(restoreRun(null), null);
});

test('characters_and_power_ups_change_the_start', () => {
  const base = createHydro(1);
  const granny = createHydro(1, { char: 'granny', powerups: { purse: 1, heart: 1, builder: 2, turbine: 1 } });
  assert.equal(granny.skill.sand, 1, 'granny starts with the sand spirit');
  assert.equal(granny.coins, T.startCoins + 20);
  assert.equal(granny.hearts, T.hearts + 1);
  assert.ok(cost(granny, 'wall') < cost(base, 'wall'));
  assert.ok(eta(granny) > T.eta);
  assert.ok(eta(createHydro(1, { char: 'miller' })) > T.eta, 'the miller makes more power');
});

test('bonus_skills_only_join_the_cards_after_they_are_unlocked', () => {
  const seen = (unlocked: ('rain' | 'sun')[]) => {
    const w = createHydro(3, { unlocked }), got = new Set<string>();
    w.hearts = 99; // keep going without building: only the cards matter here
    start(w);
    for (let k = 0; k < 30 * 240 && w.phase !== 'won' && w.phase !== 'lost'; k++) { if (w.phase === 'levelup') { w.cards.forEach(c => got.add(c)); chooseCard(w, w.cards[w.cards.length - 1]); } tick(w); }
    return got;
  };
  assert.equal(seen([]).has('rain'), false);
  assert.ok(seen(['rain', 'sun']).has('rain') || seen(['rain', 'sun']).has('sun'));
});

test('the_rain_spirit_adds_water_in_a_drought_and_water_stays_conserved', () => {
  const w = createHydro(1, { unlocked: ['rain'] });
  w.skill.rain = 3; w.spiritTimer.rain = 1;
  start(w);
  while (w.tick < 30 * 74) { if (w.phase === 'levelup') chooseCard(w, w.cards[0]); tick(w); } // spring drought from 72 s
  const before = w.inflow;
  let rained = false;
  for (let k = 0; k < 30 * 12; k++) { if (w.phase === 'levelup') chooseCard(w, w.cards[0]); tick(w); if (w.events.spirit?.kind === 'rain') rained = true; }
  assert.ok(rained);
  assert.ok(w.inflow - before > T.baseInflow * 0.3 * 30 * 12, 'more than the river alone brought');
  assert.ok(Math.abs(balance(w)) < 1e-8);
});

test('winter_freezes_the_river_into_ice', () => {
  const w = createHydro(1, { stage: 2 });
  w.hearts = 99; // reach winter without building
  start(w);
  run(w, 30 * (120 + 40)); // autumn, then into the first winter freeze
  let ice = 0; for (let i = 0; i < w.g.ice.length; i++) if (w.channel[i]) ice += w.g.ice[i];
  assert.ok(ice > 1, `river ice ${ice}`);
  assert.ok(Math.abs(balance(w)) < 1e-8);
});

test('after_a_clear_계속하기_goes_on_season_after_season_and_books_only_the_extra', async () => {
  const { continueEndless, demand, seconds } = await import('../../../prototypes/v4-hydro/core.ts');
  const m = defaultMeta(), w = createHydro(1, runOptions(m, 0, 'miller'));
  w.phase = 'won'; w.record.power = 600; w.tick = w.totalSec * 30;
  finishRun(m, w);
  const runs = m.stats.runs, gems = m.gems, d0 = demand(w);
  assert.ok(continueEndless(w));
  assert.equal(w.phase, 'run');
  assert.deepEqual(w.seasons.map(s => s.name), ['봄', '여름', '가을']);
  assert.equal(w.totalSec, 360);
  // survive autumn: winter comes and the village needs more
  w.hearts = 99;
  while (seconds(w) < 360.5 && w.phase === 'run') { tick(w); if (w.phase === 'levelup') chooseCard(w, w.cards[0]); }
  assert.equal(w.extraSeasons, 1);
  assert.equal(w.seasons[w.seasons.length - 1].name, '겨울');
  assert.ok(demand(w) > d0);
  // the endless run ends: not a second run, not a loss, paid for the extra power and seasons
  const saved = restoreRun(snapshotRun(w));
  assert.ok(saved && saved.endless && saved.seasons.length === 4 && saved.totalSec === w.totalSec);
  w.phase = 'lost';
  const r = finishRun(m, w);
  assert.equal(m.stats.runs, runs);
  assert.equal(m.stats.losses, 0);
  assert.ok(r.gems >= GEMS.perStar && m.gems === gems + r.gems);
  assert.equal(m.stats.bestSeasons, 3);
});
