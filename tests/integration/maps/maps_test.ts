/**
 * Story 004 — maps, waves, glacier lakes, checkpoints (integration).
 * Story: production/epics/physics-td/story-004-regions-maps-waves-tutorial.md
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadMap } from '../../../src/game/map.ts';
import { validateMap } from '../../../src/game/validate.ts';
import { LAKE_WARN_TICKS, tickLakes } from '../../../src/game/lakes.ts';
import type { LakeEvent } from '../../../src/game/lakes.ts';
import { waveLen } from '../../../src/sim/config.ts';
import { waveInflow } from '../../../src/sim/inflow.ts';
import { runWaves } from '../../../src/sim/step.ts';
import { advance, createPlay, send, TICK_MS } from '../../../src/game/play.ts';
import type { Play } from '../../../src/game/play.ts';
import { stateHash } from '../../../src/game/checkpoint.ts';
import { createRules } from '../../../src/rules/skills.ts';
import { CHARACTERS, ECONOMY, FUSIONS, SKILLS } from '../../../src/data/catalog.ts';

import { MAPS, byId } from './fixtures.ts';


test('4 maps (river 2 + glacier 2) load from tiles + zone layers', () => {
  assert.equal(MAPS.length, 4);
  assert.deepEqual(MAPS.map(m => m.region).sort(), ['glacier', 'glacier', 'river', 'river']);
  for (const d of MAPS) {
    assert.ok(d.zones && d.zones.length === 12 && d.zones.every(r => r.length === 8), d.id);
    const m = loadMap(d);
    assert.equal(m.zones.zones.filter(z => z.type === 'base').length, 1);
  }
});

test('every map passes the design-guide validation (incl. ≥ 2 target zones per character)', () => {
  const basics = CHARACTERS.map(c => SKILLS.find(s => s.id === c.skills.basic)!);
  for (const d of MAPS) assert.deepEqual(validateMap(loadMap(d), basics), [], d.id);
});

test('waves: 5 per map, 40 → 70 s, inflow ×1.35 per wave, 20% rain', () => {
  const lens = [1, 2, 3, 4, 5].map(w => waveLen(w) / 30);
  assert.deepEqual(lens, [40, 47.5, 55, 62.5, 70]);
  for (const d of MAPS) {
    assert.equal(d.waves, 5);
    assert.equal(d.rain, 0.2);
    const m = loadMap(d);
    for (let w = 2; w <= 5; w++) assert.ok(Math.abs(waveInflow(d.I1, m.world.cfg.growth, w) / waveInflow(d.I1, m.world.cfg.growth, w - 1) - 1.35) < 1e-9);
  }
});

test('glacier maps: each lake warns 3 s ahead, then bursts during a wave', () => {
  for (const d of MAPS.filter(x => x.region === 'glacier')) {
    const m = loadMap(d);
    m.world.hp = 1e9; // observe the whole run
    const log: { e: LakeEvent; tick: number; wave: number }[] = [];
    const ev: LakeEvent[] = [];
    runWaves(m.world, 1, 5, undefined, undefined, w => {
      ev.length = 0; tickLakes(w, m.lakes, ev);
      for (const e of ev) log.push({ e, tick: w.tick, wave: w.wave });
    });
    for (const L of m.lakes) {
      const warn = log.find(x => x.e.t === 'lakeWarning' && x.e.lake === L.id);
      const burst = log.find(x => x.e.t === 'lakeBurst' && x.e.lake === L.id);
      assert.ok(warn && burst, `${d.id} lake ${L.id}: warning and burst`);
      assert.ok(burst!.tick - warn!.tick >= LAKE_WARN_TICKS - 1, `${d.id} lake ${L.id}: ${burst!.tick - warn!.tick} ticks of warning`);
      assert.ok(burst!.wave >= 2 && burst!.wave <= 5, `${d.id} lake ${L.id} bursts in W${burst!.wave}`);
      assert.ok(L.rim.every(c => m.world.grid.ice[c] === 0));
    }
  }
});

// ---------------------------------------------------------------- checkpoint
function newPlay(id: string): Play {
  const map = loadMap(byId(id));
  return createPlay(map, { seed: 7, chars: CHARACTERS, fusions: FUSIONS, rules: p => createRules(map, SKILLS, CHARACTERS[0], ECONOMY, () => p.phase === 'wave') });
}
/** Prepare-phase inputs: a levee and a pump. */
function prep(p: Play): void {
  const z = p.map.zones.zones.find(zz => zz.type === 'plain' && p.map.leveeLines[zz.id - 1].length)!;
  send(p, { t: 'skill', id: 'build-levee', zone: z.id });
  send(p, { t: 'toggle', kind: 'pump', id: 0 });
}
/** Start the wave, use freeze mid-wave, run to the end. */
function runWave(p: Play): void {
  send(p, { t: 'startWave' });
  for (let k = 0; p.phase === 'wave'; k++) {
    if (k === 300) send(p, { t: 'skill', id: 'freeze', zone: p.map.zones.zones[0].id });
    advance(p, TICK_MS);
  }
  while (p.phase === 'levelup') send(p, { t: 'pick', index: 0 });
}

test('defeat → retry restores the wave-start checkpoint; same inputs → same state', () => {
  for (const id of ['dike-village', 'glacier-meadow']) {
    const p = newPlay(id);
    prep(p); runWave(p); // W1
    assert.equal(p.phase, 'prepare');
    prep(p);
    const before = stateHash(p);
    runWave(p); // W2, then force a defeat
    const afterW2 = stateHash(p);
    p.phase = 'defeat';
    send(p, { t: 'retry' });
    assert.equal(p.phase, 'prepare');
    assert.equal(p.retries, 1);
    assert.equal(stateHash(p), before, `${id}: state equals the W2 checkpoint`);
    assert.equal(p.world.wave, 1);
    runWave(p);
    assert.equal(stateHash(p), afterW2, `${id}: replay is identical`);
  }
});
