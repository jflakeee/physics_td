/**
 * Story 006 — result score, endings, codex, save (SCO-01..03, END-01/02, SAV-01..03).
 * Story: production/epics/physics-td/story-006-result-ending-save.md
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import dike from '../../../data/maps/dike-village.json' with { type: 'json' };
import willow from '../../../data/maps/willow-fields.json' with { type: 'json' };
import { CHARACTERS, ECONOMY, FUSIONS, SKILLS } from '../../../src/data/catalog.ts';
import { DATA_VERSION, ENDINGS } from '../../../src/data/version.ts';
import { buildBonus, buildMax, resultScore } from '../../../src/rules/scoring.ts';
import type { ResultInput } from '../../../src/rules/scoring.ts';
import { resolveEnding } from '../../../src/rules/endings.ts';
import { createRules, grant, rulesWaveEnd } from '../../../src/rules/skills.ts';
import { affinityOf, computeResult, contentOf, recordResult } from '../../../src/game/result.ts';
import { loadMap } from '../../../src/game/map.ts';
import type { MapData } from '../../../src/game/map.ts';
import { advance, createPlay, send, TICK_MS } from '../../../src/game/play.ts';
import type { Play } from '../../../src/game/play.ts';
import { stateHash } from '../../../src/game/checkpoint.ts';
import { createRng, seedState } from '../../../src/core/rng.ts';
import { SAVE_KEY, createStore, defaultSave, migrate, takeResumable } from '../../../src/save/storage.ts';
import type { SaveIssue, StorageLike } from '../../../src/save/storage.ts';
import { restoreRun, serializeRun } from '../../../src/save/snapshot.ts';

const [DK, WR] = CHARACTERS;
const DATA = { skills: SKILLS, chars: CHARACTERS, fusions: FUSIONS, eco: ECONOMY, endings: ENDINGS };
const content = contentOf(DK, DATA);
const base: ResultInput = { playScore: 1000, cleared: true, affinity: 'home', hp: 80, firstCombo: true, retries: 0, lateLevels: 1, ownRanks: [1, 1], crossOwners: [], fusionsFired: 0, skips: 0 };

// ---------------------------------------------------------------- scoring
test('SCO-01: fixed input → §8 formula', () => {
  const r = resultScore({ ...base, affinity: 'challenge' }, content, ECONOMY);
  // play 1000 + clear 500 + challenge 200 + artisan round(300·60/240)=75 + hp 160 + first 50 + no retry 100 + late 50
  assert.equal(r.total, 1000 + 500 + 200 + 75 + 160 + 50 + 100 + 50);
  assert.equal(r.build, 'artisan');
});

test('SCO-02: no item is ever negative', () => {
  const rng = createRng(seedState(4));
  const aff = ['home', 'neutral', 'challenge'] as const;
  for (let k = 0; k < 5000; k++) {
    const i: ResultInput = {
      playScore: rng.next() * 3000 - 500, cleared: rng.next() < 0.5, affinity: aff[rng.int(3)], hp: rng.int(140) - 20,
      firstCombo: rng.next() < 0.5, retries: rng.int(4), lateLevels: rng.int(4) - 1, ownRanks: [rng.int(4), rng.int(4)],
      crossOwners: Array.from({ length: rng.int(4) }, () => 'wetland-researcher'), fusionsFired: rng.int(2), skips: rng.int(8),
    };
    for (const it of resultScore(i, content, ECONOMY).items) assert.ok(it.value >= 0, `${it.key} = ${it.value}`);
  }
});

test('SCO-03: each build type at its theoretical max scores exactly 300', () => {
  const max = buildMax(content, ECONOMY.result);
  assert.deepEqual(max, { artisan: 240, fusion: 180, restraint: 540 });
  assert.deepEqual(buildBonus({ ...base, ownRanks: [3, 3, 2] }, content, ECONOMY), { type: 'artisan', value: 300 });
  assert.deepEqual(buildBonus({ ...base, crossOwners: [WR.id, WR.id], fusionsFired: 1, ownRanks: [1] }, content, ECONOMY), { type: 'fusion', value: 300 });
  assert.deepEqual(buildBonus({ ...base, skips: 6, crossOwners: [WR.id], ownRanks: [1] }, content, ECONOMY), { type: 'restraint', value: 300 });
});

test('affinity: 정석 0 / 보통 100 / 도전 200 from the map style', () => {
  assert.equal(affinityOf(DK, 'plain', CHARACTERS), 'home');
  assert.equal(affinityOf(DK, 'floodplain', CHARACTERS), 'challenge');
  assert.equal(affinityOf(DK, 'glacier', CHARACTERS), 'neutral');
});

// ---------------------------------------------------------------- endings
test('END-01: sub axis only from 30% of the main axis', () => {
  const ax = (h: number) => ({ safety: 10, harmony: h, conquest: 0, harvest: 0 });
  assert.equal(resolveEnding(DK.id, 'safety', ax(2.9), ENDINGS).id, 'dike-keeper');
  assert.equal(resolveEnding(DK.id, 'safety', ax(3.0), ENDINGS).id, 'dike-keeper+harmony');
  assert.equal(resolveEnding(WR.id, 'harmony', { safety: 4, harmony: 10, conquest: 0, harvest: 0 }, ENDINGS).id, 'wetland-researcher+safety');
});

test('END-02: a borrowed passive held for 5 waves gives its axis 3 + 5', () => {
  const map = loadMap(dike as unknown as MapData);
  const rs = createRules(map, SKILLS, DK, ECONOMY, () => false);
  grant(rs, 'wetland-passive', true);
  for (let w = 0; w < 5; w++) rulesWaveEnd(rs);
  assert.equal(rs.axes.harmony, 8);
});

// ---------------------------------------------------------------- run → result → codex
function newPlay(data: unknown, seed = 11, char = DK): Play {
  const map = loadMap(data as MapData);
  return createPlay(map, { seed, chars: CHARACTERS, fusions: FUSIONS, rules: p => createRules(map, SKILLS, char, ECONOMY, () => p.phase === 'wave') });
}
function playWave(p: Play): void {
  send(p, { t: 'startWave' });
  while (p.phase === 'wave') advance(p, TICK_MS);
  while (p.phase === 'levelup') send(p, { t: 'pick', index: 0 });
}

test('result: cleared run → stars, ending, codex; second clear is not a first combo', () => {
  const p = newPlay(dike);
  p.world.hp = 1e6; // play through every wave
  for (let w = 0; w < 5; w++) playWave(p);
  assert.equal(p.phase, 'result');
  p.world.hp = 90;
  const save0 = defaultSave();
  const r1 = computeResult(p, save0, DATA);
  assert.ok(r1.cleared && r1.stars >= 2);
  assert.ok(r1.items.find(i => i.key === 'firstCombo')!.value === 50);
  const save1 = recordResult(save0, p, r1);
  assert.deepEqual(save1.progress.maps['dike-village'].clearedBy, [DK.id]);
  assert.ok(save1.progress.endings.includes(r1.ending.id));
  const r2 = computeResult(p, save1, DATA);
  assert.equal(r2.items.find(i => i.key === 'firstCombo')!.value, 0);
});

// ---------------------------------------------------------------- storage
function fakeStorage(init: Record<string, string> = {}, fail = false): StorageLike & { data: Record<string, string> } {
  const data = { ...init };
  return {
    data,
    getItem: k => { if (fail) throw new Error('blocked'); return data[k] ?? null; },
    setItem: (k, v) => { if (fail) throw new Error('quota'); data[k] = v; },
    removeItem: k => { delete data[k]; },
  };
}

test('SAV-01: corrupt JSON → defaults, one corrupt notice, no crash', () => {
  const issues: SaveIssue[] = [];
  const store = createStore(fakeStorage({ [SAVE_KEY]: '{"v":1,"progress":' }), i => issues.push(i));
  assert.deepEqual(store.load(), defaultSave());
  store.load();
  assert.deepEqual(issues, ['corrupt']);
  assert.equal(migrate({ v: 99 }), null);
});

test('SAV-02: throwing storage → memory mode, one notice, the game keeps working', () => {
  const issues: SaveIssue[] = [];
  const store = createStore(fakeStorage({}, true), i => issues.push(i));
  const s = store.load();
  s.progress.endings.push('dike-keeper');
  store.save(s); store.save(s);
  assert.deepEqual(store.load().progress.endings, ['dike-keeper']);
  assert.ok(store.memory());
  assert.deepEqual(issues, ['memory']);
});

test('SAV-03: a run saved with other data is discarded with a notice', () => {
  const back = fakeStorage();
  const store = createStore(back);
  const s = defaultSave();
  s.run = { dataVersion: 'deadbeef', mapId: 'dike-village', charId: DK.id, seed: 1, wave: 2, snapshot: '{}' };
  store.save(s);
  assert.deepEqual(takeResumable(store, DATA_VERSION), { run: null, discarded: true });
  assert.equal(store.load().run, undefined);
  assert.ok(!JSON.parse(back.data[SAVE_KEY]).run);
});

test('snapshot: save in prepare → restore into a fresh play → same state, same future', () => {
  const a = newPlay(willow, 21, WR);
  playWave(a); playWave(a);
  assert.equal(a.phase, 'prepare');
  const snap = serializeRun(a)!;
  assert.ok(snap.length < 600_000, `${snap.length} bytes`);
  const b = newPlay(willow, 21, WR);
  restoreRun(b, snap);
  assert.equal(stateHash(b), stateHash(a));
  assert.deepEqual(b.rules!.owned, a.rules!.owned);
  playWave(a); playWave(b);
  assert.equal(stateHash(b), stateHash(a), 'identical after another wave (cards included)');
  // and through the store
  const store = createStore(fakeStorage());
  const s = store.load();
  s.run = { dataVersion: DATA_VERSION, mapId: 'willow-fields', charId: WR.id, seed: 21, wave: a.world.wave, snapshot: serializeRun(a)! };
  store.save(s);
  assert.equal(takeResumable(store, DATA_VERSION).run?.snapshot, s.run!.snapshot);
});

test('snapshot: a pending draft offer survives a save in the level-up phase', () => {
  const a = newPlay(dike, 5);
  send(a, { t: 'startWave' });
  a.world.metrics.drained += 1500;
  while (a.phase === 'wave') advance(a, TICK_MS);
  assert.equal(a.phase, 'levelup');
  const b = newPlay(dike, 5);
  restoreRun(b, serializeRun(a)!);
  assert.equal(b.phase, 'levelup');
  assert.deepEqual(b.draft!.offer, a.draft!.offer);
});

test('snapshot during a wave saves the wave-start state; result saves nothing', () => {
  const a = newPlay(dike, 9);
  playWave(a);
  const prep = serializeRun(a)!;
  send(a, { t: 'startWave' });
  for (let k = 0; k < 50; k++) advance(a, TICK_MS);
  const mid = serializeRun(a)!;
  const b = newPlay(dike, 9), c = newPlay(dike, 9);
  restoreRun(b, prep); restoreRun(c, mid);
  assert.equal(c.phase, 'prepare');
  assert.equal(stateHash(c), stateHash(b), 'mid-wave save = the state the wave started from');
  a.phase = 'result';
  assert.equal(serializeRun(a), null);
});
