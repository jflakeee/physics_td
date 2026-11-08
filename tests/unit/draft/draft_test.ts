/**
 * Story 005 — level-up draft (DETAILED_DESIGN_V2 §7, LVL-01/02, CRD-01..07, FUS-01).
 * Story: production/epics/physics-td/story-005-levelup-draft.md
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import dike from '../../../data/maps/dike-village.json' with { type: 'json' };
import willow from '../../../data/maps/willow-fields.json' with { type: 'json' };
import meadow from '../../../data/maps/glacier-meadow.json' with { type: 'json' };
import { loadMap } from '../../../src/game/map.ts';
import type { MapData } from '../../../src/game/map.ts';
import { CHARACTERS, ECONOMY, FUSIONS, SKILLS } from '../../../src/data/catalog.ts';
import { createRng, createStreams, seedState } from '../../../src/core/rng.ts';
import { createRules, grant } from '../../../src/rules/skills.ts';
import type { RulesState } from '../../../src/rules/skills.ts';
import { addScore, createScore, xpToNext } from '../../../src/rules/leveling.ts';
import { createDraft, needsReplace, pickCard, reroll, rollCards, rollRarity, skipDraft } from '../../../src/rules/cards.ts';
import type { Card, DraftState } from '../../../src/rules/cards.ts';
import { advance, createPlay, send, TICK_MS } from '../../../src/game/play.ts';
import { startWave, stepSim } from '../../../src/sim/step.ts';
import { loadMap as load } from '../../../src/game/map.ts';
import { runStrategy } from '../../../bots/strategies.ts';

const [DK, WR] = CHARACTERS;
const MAP = (d: unknown) => d as MapData;

function setup(data: unknown, char = DK, seed = 1, start?: string[]): { rs: RulesState; ds: DraftState } {
  const map = loadMap(MAP(data));
  const rs = createRules(map, SKILLS, char, ECONOMY, () => false, start);
  return { rs, ds: createDraft(createStreams(seed).cards, rs, map.data.style, CHARACTERS) };
}
const ctx = (rs: RulesState) => ({ rs, fusions: FUSIONS });
const skillCards = (cs: Card[]) => cs.filter((c): c is Extract<Card, { kind: 'skill' }> => c.kind === 'skill');

// ---------------------------------------------------------------- leveling
test('LVL-01: xp curve round(100·1.35^(Lv−1)); 995 XP → Lv6', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(l => xpToNext(l, ECONOMY)), [100, 135, 182, 246, 332, 448]);
  const map = loadMap(MAP(dike));
  const ss = createScore(map.world);
  addScore(ss, 995, ECONOMY, false);
  assert.equal(ss.level, 6);
  assert.equal(ss.pending, 5);
});

test('LVL-02: level-ups in the last wave become late levels, pending unchanged', () => {
  const ss = createScore(loadMap(MAP(dike)).world);
  addScore(ss, 100, ECONOMY, false);
  assert.equal(ss.pending, 1);
  addScore(ss, 135 + 182, ECONOMY, true);
  assert.equal(ss.lateLevels, 2);
  assert.equal(ss.pending, 1);
});

test('average play levels up 5–6 times per run (mixed bots on every map)', () => {
  for (const d of [dike, willow, meadow]) {
    for (const s of ['ringPlusPump', 'twoRingsTwoPumps']) {
      const r = runStrategy(() => load(MAP(d)), s, ECONOMY);
      assert.equal(r.result, 'clear');
      assert.ok(r.level! - 1 >= 5 && r.level! - 1 <= 6, `${(d as unknown as MapData).id} ${s}: ${r.level! - 1} level-ups (score ${r.score})`);
    }
  }
});

test('play: XP = score 1:1; wave level-ups wait as pending and open the draft after the wave', () => {
  const map = loadMap(MAP(dike));
  const p = createPlay(map, { seed: 3, chars: CHARACTERS, fusions: FUSIONS, rules: pp => createRules(map, SKILLS, DK, ECONOMY, () => pp.phase === 'wave') });
  send(p, { t: 'startWave' });
  p.score!.scoreF = 99.5; p.score!.xp = 99; // next whole point is the 100th
  p.world.metrics.drained += 2; // +0.6 score
  advance(p, TICK_MS);
  assert.equal(p.score!.level, 2);
  assert.equal(p.score!.pending, 1);
  assert.equal(p.phase, 'wave', 'no draft during the wave');
  while (p.phase === 'wave') advance(p, TICK_MS);
  assert.equal(p.phase, 'levelup');
  assert.equal(p.draft!.offer!.length, 3);
});

// ---------------------------------------------------------------- cards
test("CRD-01/02: own 1 + cross 2; never another character's ultimate; cross actives ≤ 2; cross Rank 1", () => {
  for (let seed = 1; seed <= 2000; seed++) {
    const { rs, ds } = setup(willow, DK, seed);
    const cards = skillCards(rollCards(ds, ctx(rs)));
    assert.equal(cards.filter(c => c.side === 'own').length, 1);
    for (const c of cards) {
      const d = rs.defs.get(c.skill)!;
      if (c.side === 'cross') { assert.notEqual(d.slot, 'ultimate'); assert.equal(c.rank, 1); assert.equal(c.rarity, 'common'); }
      if (d.owner !== DK.id) assert.equal(c.side, 'cross');
    }
  }
  // two cross actives held → no cross active offered
  const { rs, ds } = setup(willow, DK, 5);
  grant(rs, 'open-floodplain', true); grant(rs, 'restore-wetland', true);
  for (let k = 0; k < 50; k++) {
    const cards = skillCards(rollCards(ds, ctx(rs)));
    for (const c of cards.filter(x => x.side === 'cross')) assert.equal(rs.defs.get(c.skill)!.slot, 'passive');
  }
});

test('CRD-07: rarity draws 70/25/5 ± 0.5%p; released cards never show legendary', () => {
  const rng = createRng(seedState(99)), n = 100_000, cnt = { common: 0, rare: 0, legendary: 0 };
  for (let k = 0; k < n; k++) cnt[rollRarity(rng, ECONOMY.draft.rarity)]++;
  assert.ok(Math.abs(cnt.common / n - 0.70) < 0.005 && Math.abs(cnt.rare / n - 0.25) < 0.005 && Math.abs(cnt.legendary / n - 0.05) < 0.005, JSON.stringify(cnt));
  for (let seed = 1; seed < 500; seed++) {
    const { rs, ds } = setup(dike, DK, seed);
    for (const c of skillCards(rollCards(ds, ctx(rs)))) assert.notEqual(c.rarity, 'legendary');
  }
});

test('rare cards: own upgrade +2 ranks (max 3), new own skill at Rank 2', () => {
  let seenUp = false, seenNew = false;
  for (let seed = 1; seed < 400 && !(seenUp && seenNew); seed++) {
    const { rs, ds } = setup(dike, DK, seed);
    for (const c of skillCards(rollCards(ds, ctx(rs)))) {
      if (c.side !== 'own' || c.rarity !== 'rare') continue;
      if (c.upgrade) { assert.equal(c.rank, 3); seenUp = true; } else { assert.equal(c.rank, 2); seenNew = true; }
    }
  }
  assert.ok(seenUp && seenNew);
});

test('CRD-05: the Lv3 draft guarantees the own tactical, Lv5 the own ultimate (when not owned)', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const { rs, ds } = setup(dike, DK, seed);
    ds.drafted = 1; // next draft is Lv3
    assert.ok(skillCards(rollCards(ds, ctx(rs))).some(c => c.skill === 'sandbag' && c.side === 'own'));
    ds.drafted = 3; // Lv5
    assert.ok(skillCards(rollCards(ds, ctx(rs))).some(c => c.skill === 'night-repair' && c.side === 'own'));
  }
});

test('CRD-04: after 4 drafts without a fusion card the 5th has one', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const { rs, ds } = setup(willow, WR, seed);
    ds.sinceFusion = ECONOMY.draft.fusionCeiling;
    assert.ok(skillCards(rollCards(ds, ctx(rs))).some(c => c.fusion === 'green-levee'), `seed ${seed}`);
    assert.equal(ds.sinceFusion, 0);
  }
});

test('CRD-03: 정석 weighting applies to the home or neutral character, never to the 도전 character', () => {
  assert.equal(setup(dike, DK).ds.homeChar, 'dike-keeper');
  assert.equal(setup(willow, DK).ds.homeChar, null, 'dike-keeper is the challenge pick on a floodplain');
  assert.equal(setup(willow, WR).ds.homeChar, 'wetland-researcher');
  assert.equal(setup(meadow, DK).ds.homeChar, null, 'glacier maps have no home character yet');
});

test('CRD-06: same seed → same cards and rarities; reroll once; skip +40', () => {
  const a = setup(dike, DK, 42), b = setup(dike, DK, 42);
  assert.deepEqual(rollCards(a.ds, ctx(a.rs)), rollCards(b.ds, ctx(b.rs)));
  assert.equal(reroll(a.ds, ctx(a.rs)).ok, true);
  assert.deepEqual(reroll(a.ds, ctx(a.rs)), { ok: false, reason: 'NO_REROLL' });
  const cash = a.rs.world.cash!;
  skipDraft(a.ds, a.rs);
  assert.equal(a.rs.world.cash, cash + 40);
});

test('card stream is independent: rerolls never shift the events/weather streams', () => {
  const s1 = createStreams(5), s2 = createStreams(5);
  const { rs, ds } = setup(dike, DK, 5);
  ds.rng = s1.cards;
  rollCards(ds, ctx(rs)); reroll(ds, ctx(rs));
  assert.equal(s1.events.next(), s2.events.next());
  assert.equal(s1.weather.next(), s2.weather.next());
});

test('picking a new active with 4 actives needs a replacement', () => {
  const { rs, ds } = setup(willow, DK, 8, ['dike-passive', 'build-levee', 'sandbag', 'night-repair']);
  grant(rs, 'open-floodplain', true);
  const card: Card = { kind: 'skill', skill: 'restore-wetland', side: 'cross', upgrade: false, rank: 1, rarity: 'common', fusion: 'green-levee', completes: true };
  ds.offer = [card];
  assert.ok(needsReplace(rs, card));
  assert.deepEqual(pickCard(ds, ctx(rs), 0), { ok: false, reason: 'NEED_REPLACE' });
  const r = pickCard(ds, ctx(rs), 0, 'open-floodplain');
  assert.ok(r.ok);
  assert.ok(!rs.owned.some(o => o.id === 'open-floodplain'));
  assert.equal(rs.owned.find(o => o.id === 'restore-wetland')!.rank, 1);
});

// ---------------------------------------------------------------- fusion
test('FUS-01: 녹색 제방 fires once when build-levee + restore-wetland are owned; the levee inner side absorbs', () => {
  const { rs, ds } = setup(dike, DK, 1);
  ds.offer = [{ kind: 'skill', skill: 'restore-wetland', side: 'cross', upgrade: false, rank: 1, rarity: 'common', fusion: 'green-levee', completes: true }];
  const r = pickCard(ds, ctx(rs), 0);
  assert.deepEqual(r, { ok: true, fused: ['green-levee'] });
  assert.deepEqual(rs.fusions, ['green-levee']);
  assert.equal(rs.world.mods.greenLevee, 0.003);
  grant(rs, 'sandbag');
  ds.offer = [{ kind: 'sub', sub: 'supply' }];
  assert.deepEqual(pickCard(ds, ctx(rs), 0), { ok: true, fused: [] }, 'fires only once');
  // absorption on the inner side of a levee
  const w = rs.world, g = w.grid, W = g.width;
  const c = (rs.map.terrain.baseY - 6) * W + rs.map.terrain.baseX;
  g.wall[c] = 0.4;
  g.w[c + W] = 0.5; g.w[c - W] = 0.5; // inner (towards base) and outer
  w.cfg.K = 0; startWave(w, 1); w.waveParams.mul = 0;
  const d0 = w.metrics.drained;
  stepSim(w);
  assert.ok(w.metrics.drained - d0 >= 0.003 - 1e-9);
  assert.ok(g.w[c + W] < g.w[c - W], 'inner cell lost water, outer did not');
});
