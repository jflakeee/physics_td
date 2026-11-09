/**
 * Story 007 — world map, region unlock, memory fragments, recall cards, story text keys.
 * Story: production/epics/physics-td/story-007-world-map-prologue-memory.md
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import ko from '../../../i18n/ko.json' with { type: 'json' };
import { MEMORIES, PROLOGUE, WORLD } from '../../../src/data/story.ts';
import { MAPS } from '../../../src/data/maps.ts';
import { fragmentMet, homesteadCells, newFragments, openRecalls, regionOpen } from '../../../src/rules/story.ts';
import type { RunFacts } from '../../../src/rules/story.ts';
import { loadMap } from '../../../src/game/map.ts';
import { createPlay, send, advance, TICK_MS } from '../../../src/game/play.ts';
import { createRules } from '../../../src/rules/skills.ts';
import { CHARACTERS, ECONOMY, FUSIONS, SKILLS } from '../../../src/data/catalog.ts';
import { runFacts } from '../../../src/game/result.ts';

const K = ko as Record<string, string>;
const clearRun = (o: Partial<RunFacts> = {}): RunFacts => ({ region: 'river', char: 'dike-keeper', cleared: true, damage: 5, ecologyBest: 100, openedField: false, retries: 0, burstWaveClean: false, lakeHeld: false, ...o });

test('world: river homestead + 6 silhouettes beyond the border; every map belongs to a region', () => {
  assert.equal(WORLD.regions.length, 7);
  assert.equal(WORLD.regions.filter(r => !r.released).length, 5);
  const regionMaps = WORLD.regions.flatMap(r => r.maps ?? []);
  for (const m of MAPS) {
    assert.ok(regionMaps.includes(m.id), m.id);
    assert.equal(WORLD.regions.find(r => r.maps?.includes(m.id))!.id, m.region);
  }
});

test('homestead grows by one cell per cleared map', () => {
  assert.equal(homesteadCells(WORLD, []).length, 1);
  assert.equal(homesteadCells(WORLD, ['dike-village']).length, 2);
  const all = homesteadCells(WORLD, MAPS.map(m => m.id));
  assert.equal(all.length, 5);
  assert.equal(new Set(all.map(c => c.hex.join())).size, 5, 'distinct cells');
});

test('clearing the river region opens the glacier border', () => {
  const cleared = (ids: string[]) => (id: string) => ids.includes(id);
  assert.ok(regionOpen(WORLD, 'river', cleared([])));
  assert.ok(!regionOpen(WORLD, 'glacier', cleared(['dike-village'])));
  assert.ok(regionOpen(WORLD, 'glacier', cleared(['dike-village', 'willow-fields'])));
  assert.ok(!regionOpen(WORLD, 'volcano', cleared(MAPS.map(m => m.id))), 'unreleased stays closed');
});

test('8 fragments = 4 philosophies × 2 regions; each condition is judged', () => {
  assert.equal(MEMORIES.fragments.length, 8);
  for (const p of MEMORIES.philosophies) for (const r of ['river', 'glacier']) assert.equal(MEMORIES.fragments.filter(f => f.philosophy === p.id && f.region === r).length, 1);
  const f = (id: string) => MEMORIES.fragments.find(x => x.id === id)!;
  assert.ok(fragmentMet(f('love-river'), clearRun({ damage: 0 })));
  assert.ok(!fragmentMet(f('love-river'), clearRun({ damage: 0, char: 'wetland-researcher' })));
  assert.ok(!fragmentMet(f('love-river'), clearRun({ damage: 1 })));
  assert.ok(fragmentMet(f('nature-river'), clearRun({ ecologyBest: 120 })));
  assert.ok(!fragmentMet(f('nature-river'), clearRun({ ecologyBest: 119.9 })));
  assert.ok(fragmentMet(f('exchange-river'), clearRun({ openedField: true })));
  assert.ok(fragmentMet(f('lesson-river'), clearRun({ retries: 1 })));
  assert.ok(!fragmentMet(f('lesson-river'), clearRun({ retries: 1, cleared: false })), 'only on a clear');
  assert.ok(!fragmentMet(f('lesson-river'), clearRun({ retries: 1, region: 'glacier' })), 'region must match');
  assert.ok(fragmentMet(f('love-glacier'), clearRun({ region: 'glacier', burstWaveClean: true })));
  assert.ok(fragmentMet(f('nature-glacier'), clearRun({ region: 'glacier', char: 'wetland-researcher', ecologyBest: 110 })));
  assert.ok(fragmentMet(f('exchange-glacier'), clearRun({ region: 'glacier', lakeHeld: true })));
  assert.ok(fragmentMet(f('lesson-glacier'), clearRun({ region: 'glacier', retries: 2 })));
  assert.deepEqual(newFragments(MEMORIES, clearRun({ damage: 0, retries: 1 }), ['love-river']), ['lesson-river']);
});

test('recall card opens when a philosophy has its released fragments', () => {
  assert.deepEqual(openRecalls(MEMORIES, ['love-river']), []);
  assert.deepEqual(openRecalls(MEMORIES, ['love-river', 'love-glacier', 'nature-river']), ['love']);
});

test('every story text is an i18n key (prologue, unlock scenes, wave lines, foreshadow, memories)', () => {
  const keys = [...PROLOGUE.scenes, ...Object.values(PROLOGUE.unlockScenes).flat(), ...Object.values(PROLOGUE.waveLines).flat(), PROLOGUE.foreshadow.key];
  for (const p of MEMORIES.philosophies) keys.push(p.i18n + '.name', 'recall.' + p.id);
  for (const f of MEMORIES.fragments) keys.push(`memory.${f.id}.text`, `memory.${f.id}.hint`);
  for (const r of WORLD.regions) keys.push('region.' + r.id);
  for (const k of keys) assert.ok(K[k], k);
  for (const k of keys.filter(x => x.startsWith('prologue.') || x.startsWith('line.'))) {
    assert.ok(K[k].split(/[.!?。]\s/).length <= 3, `${k}: 1–3 sentences`);
  }
});

test('run facts: a glacier run records burst waves and held lakes; damage sums waves', () => {
  const data = MAPS.find(m => m.id === 'glacier-meadow')!;
  const map = loadMap(data);
  const p = createPlay(map, { seed: 2, chars: CHARACTERS, fusions: FUSIONS, rules: pp => createRules(map, SKILLS, CHARACTERS[0], ECONOMY, () => pp.phase === 'wave') });
  p.world.hp = 1e9;
  for (let w = 0; w < 5; w++) {
    send(p, { t: 'startWave' });
    while (p.phase === 'wave') advance(p, TICK_MS);
    while (p.phase === 'levelup') send(p, { t: 'skip' });
  }
  const f = runFacts(p);
  assert.equal(f.region, 'glacier');
  assert.ok(p.story.burstWaves.length === 1, `burst waves ${p.story.burstWaves}`);
  assert.equal(f.lakeHeld, false);
  assert.ok(f.damage > 0);
});
