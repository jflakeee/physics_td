/**
 * Story 004 — 둑마을 tutorial (GD §18): order, conditions, skip, survives retry.
 * Story: production/epics/physics-td/story-004-regions-maps-waves-tutorial.md
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import dike from '../../../data/maps/dike-village.json' with { type: 'json' };
import { loadMap } from '../../../src/game/map.ts';
import type { MapData } from '../../../src/game/map.ts';
import { advance, createPlay, send, TICK_MS } from '../../../src/game/play.ts';
import type { Play } from '../../../src/game/play.ts';
import { CHARACTERS, ECONOMY, SKILLS } from '../../../src/data/catalog.ts';
import { createRules, zoneTargetable } from '../../../src/rules/skills.ts';
import * as tut from '../../../src/game/tutorial.ts';
import { defaultSave, isFirstRun } from '../../../src/save/storage.ts';

function setup() {
  const map = loadMap(dike as unknown as MapData);
  const p = createPlay(map, { rules: pp => createRules(map, SKILLS, CHARACTERS[0], ECONOMY, () => pp.phase === 'wave') });
  return { p, t: tut.createTutorial() };
}
/** Advance like the UI frame loop does: ticks feed the tutorial, events too. */
function frame(p: Play, t: tut.Tutorial, ms = TICK_MS): void {
  const n = advance(p, ms);
  for (let k = 0; k < n; k++) tut.onTick(t, p);
  for (const e of p.events) tut.onEvent(t, e);
  p.events.length = 0;
}
function pumpEvents(p: Play, t: tut.Tutorial): void { for (const e of p.events) tut.onEvent(t, e); p.events.length = 0; }

test('tutorial runs its 6 steps in order with their conditions', () => {
  const { p, t } = setup();
  assert.equal(t.step, 1);
  assert.ok(tut.visible(t, p) && tut.tapToContinue(t));
  tut.onTap(t, p); assert.equal(t.step, 2);
  tut.onTap(t, p); assert.equal(t.step, 2, 'step 2 needs a levee, not a tap');
  send(p, { t: 'toggle', kind: 'pump', id: 0 }); pumpEvents(p, t);
  assert.equal(t.step, 2, 'pumps do not count yet');
  send(p, { t: 'toggle', kind: 'pump', id: 0 }); pumpEvents(p, t);
  const z = p.map.zones.zones.find(zz => zoneTargetable(p.rules!, 'build-levee', zz.id))!;
  send(p, { t: 'skill', id: 'build-levee', zone: z.id }); pumpEvents(p, t);
  assert.equal(t.step, 3);
  assert.equal(tut.visible(t, p), false, 'step 3 waits for the wave');
  send(p, { t: 'startWave' });
  assert.ok(tut.visible(t, p) && tut.speedLocked(t));
  for (let k = 0; k < tut.WATCH_TICKS - 1; k++) frame(p, t);
  assert.equal(t.step, 3);
  frame(p, t);
  assert.equal(t.step, 4);
  send(p, { t: 'toggle', kind: 'pump', id: 0 });
  frame(p, t);
  assert.equal(t.step, 5);
  assert.equal(tut.visible(t, p), false, 'card step shows after W1');
  while (p.phase === 'wave') frame(p, t);
  assert.ok(tut.visible(t, p));
  if (p.phase === 'levelup') {
    tut.onTap(t, p); assert.equal(t.step, 5, 'card step waits for a pick');
    send(p, { t: 'pick', index: 0 }); pumpEvents(p, t);
    while (p.phase === 'levelup') { send(p, { t: 'skip' }); pumpEvents(p, t); }
  } else tut.onTap(t, p);
  assert.equal(t.step, 6);
  tut.onTap(t, p); assert.equal(t.step, tut.DONE);
  assert.equal(tut.visible(t, p), false);
});

test('tutorial: skip ends it; a defeat + retry keeps the step', () => {
  const { p, t } = setup();
  tut.onTap(t, p);
  const z = p.map.zones.zones.find(zz => zoneTargetable(p.rules!, 'build-levee', zz.id))!;
  send(p, { t: 'skill', id: 'build-levee', zone: z.id }); pumpEvents(p, t);
  send(p, { t: 'startWave' });
  for (let k = 0; k < tut.WATCH_TICKS; k++) frame(p, t);
  assert.equal(t.step, 4);
  p.phase = 'defeat';
  send(p, { t: 'retry' }); pumpEvents(p, t);
  assert.equal(p.phase, 'prepare');
  assert.equal(t.step, 4, 'retry does not roll the tutorial back');
  tut.skip(t);
  assert.equal(t.step, tut.DONE);
});

test('first run: nothing cleared and tutorial not started', () => {
  const s = defaultSave();
  assert.ok(isFirstRun(s));
  s.progress.maps['dike-village'] = { stars: 1, best: 0, clearedBy: ['dike-keeper'] };
  assert.ok(!isFirstRun(s));
  const s2 = defaultSave(); s2.progress.tutorial = 3;
  assert.ok(!isFirstRun(s2));
});
