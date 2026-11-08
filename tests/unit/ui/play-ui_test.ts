/**
 * Story 002 — pure logic behind the mobile play screen.
 * Story: production/epics/physics-td/story-002-mobile-ui-zone-control.md
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import dikeVillage from '../../../data/maps/dike-village.json' with { type: 'json' };
import ko from '../../../i18n/ko.json' with { type: 'json' };
import { loadMap } from '../../../src/game/map.ts';
import type { MapData } from '../../../src/game/map.ts';
import { ACC_CAP_MS, TICK_MS, advance, createPlay, send } from '../../../src/game/play.ts';
import { GESTURE, createGestureTracker } from '../../../src/input/gestures.ts';
import { hitTest, toCell } from '../../../src/input/hit.ts';
import { IDLE, brightZones, onBoardSwipe, onBoardTap, onSkillButton } from '../../../src/input/targeting.ts';
import { createHud } from '../../../src/ui/widgets/hud.ts';
import { expireToasts, pushToast, TOAST_MAX, TOAST_MS } from '../../../src/ui/widgets/toast.ts';
import { createT } from '../../../src/ui/i18n.ts';
import { fitBoard } from '../../../src/render/canvas.ts';
import { DIKE_KEEPER_ACTIVE, FREEZE } from '../../../src/ui/skillViews.ts';

const MAP = dikeVillage as unknown as MapData;
const SKILLS = [FREEZE, ...DIKE_KEEPER_ACTIVE];
const byId = (id: string) => SKILLS.find(s => s.id === id)!;

// ---------------------------------------------------------------- zones
test('zones: every non-base cell belongs to exactly one zone; one base zone; ids stable', () => {
  const a = loadMap(MAP), b = loadMap(MAP);
  const { zones, zoneOf } = a.zones;
  assert.equal(zones.filter(z => z.type === 'base').length, 1);
  for (let i = 0; i < zoneOf.length; i++) assert.ok(zoneOf[i] > 0);
  let total = 0; for (const z of zones) total += z.cells.length;
  assert.equal(total, zoneOf.length);
  assert.deepEqual(a.zones.zones.map(z => z.tiles), b.zones.zones.map(z => z.tiles));
  assert.ok(zones.length >= 6, `${zones.length} zones`);
});

test('zones: authored layer groups same-letter tiles; "." means no zone', () => {
  const layer = Array.from({ length: 12 }, (_, y) => y < 6 ? 'aaaabbbb' : y === 11 ? '........' : 'ccccdddd');
  const m = loadMap({ ...MAP, zones: layer });
  assert.equal(m.zones.zones.length, 4);
  assert.equal(m.zones.zoneOf[95 * 64], 0);
});

// ---------------------------------------------------------------- gestures
test('gestures: tap, long press (poll and release), swipe, second pointer ignored', () => {
  const g = createGestureTracker();
  g.down(1, 100, 100, 0);
  assert.equal(g.down(2, 0, 0, 10), false);
  assert.deepEqual(g.up(1, 103, 101, 200), { t: 'tap', x: 103, y: 101 });
  g.down(1, 50, 50, 0);
  assert.equal(g.poll(GESTURE.longMs - 1), null);
  assert.deepEqual(g.poll(GESTURE.longMs), { t: 'longPress', x: 50, y: 50 });
  assert.equal(g.up(1, 50, 50, 900), null, 'long press already fired');
  g.down(1, 0, 0, 0);
  for (let x = 4; x <= 40; x += 4) g.move(1, x, 0, x);
  const s = g.up(1, 40, 0, 60);
  assert.equal(s?.t, 'swipe');
  if (s?.t === 'swipe') assert.ok(s.path.length >= 5);
  g.down(1, 0, 0, 0);
  assert.equal(g.up(1, 15, 0, 100), null, 'between tap and swipe distance');
});

// ---------------------------------------------------------------- hit test
test('hit: pump (within 2 cells) beats zone; screen → cell mapping', () => {
  const m = loadMap(MAP), p = m.world.pumps[0], px = p.cell % 64, py = (p.cell / 64) | 0;
  assert.deepEqual(hitTest(m.world, m.zones, px + 1, py + 1), { t: 'pump', id: 0 });
  assert.equal(hitTest(m.world, m.zones, 2, 2).t, 'zone');
  assert.deepEqual(toCell({ left: 10, top: 20, width: 640, height: 960 }, 64, 96, 10 + 15, 20 + 25), [1, 2]);
  assert.equal(toCell({ left: 0, top: 0, width: 64, height: 96 }, 64, 96, -1, 5), null);
});

test('hit: gate cells beat zones', () => {
  const m = loadMap({ ...MAP, gates: [{ tiles: [[1, 8]], open: true }] });
  assert.deepEqual(hitTest(m.world, m.zones, 12, 68), { t: 'gate', id: 0 });
});

// ---------------------------------------------------------------- targeting
test('targeting: skill → selecting → valid zone uses; invalid tap cancels; same button cancels', () => {
  const m = loadMap(MAP), zones = m.zones.zones;
  const plain = zones.find(z => z.type === 'plain')!, base = zones.find(z => z.type === 'base')!;
  let [st, a] = onSkillButton(IDLE, FREEZE, false);
  assert.equal(st.mode, 'selecting'); assert.equal(a, null);
  const bright = brightZones(st, SKILLS, zones)!;
  assert.ok(bright.has(plain.id) && !bright.has(base.id), 'only valid zones are bright');
  [st, a] = onBoardTap(st, { t: 'zone', id: plain.id }, SKILLS, zones);
  assert.deepEqual(a, { t: 'use', skill: 'freeze', zone: plain.id });
  [st] = onSkillButton(IDLE, FREEZE, false);
  [st, a] = onBoardTap(st, { t: 'zone', id: base.id }, SKILLS, zones);
  assert.deepEqual([st, a], [IDLE, { t: 'cancel' }]);
  [st] = onSkillButton(IDLE, FREEZE, false);
  [st, a] = onBoardTap(st, { t: 'none' }, SKILLS, zones);
  assert.deepEqual(a, { t: 'cancel' }, 'empty tap cancels');
  [st] = onSkillButton(IDLE, FREEZE, false);
  [st, a] = onSkillButton(st, FREEZE, false);
  assert.deepEqual([st, a], [IDLE, { t: 'cancel' }]);
});

test('targeting: idle zone tap runs the single basic skill; pump/gate tap toggles; ult needs long press', () => {
  const m = loadMap(MAP), zones = m.zones.zones;
  const plain = zones.find(z => z.type === 'plain')!, field = zones.find(z => z.type === 'field');
  let [st, a] = onBoardTap(IDLE, { t: 'zone', id: plain.id }, SKILLS, zones);
  assert.deepEqual(a, { t: 'use', skill: 'build-levee', zone: plain.id });
  assert.deepEqual(st, { mode: 'idle', highlight: plain.id });
  if (field) { [st, a] = onBoardTap(IDLE, { t: 'zone', id: field.id }, SKILLS, zones); assert.equal(a?.t, 'info'); }
  [, a] = onBoardTap(IDLE, { t: 'pump', id: 1 }, SKILLS, zones);
  assert.deepEqual(a, { t: 'toggle', kind: 'pump', id: 1 });
  [, a] = onSkillButton(IDLE, byId('night-repair'), false);
  assert.equal(a?.t, 'needLongPress');
  [, a] = onSkillButton(IDLE, byId('night-repair'), true);
  assert.deepEqual(a, { t: 'use', skill: 'night-repair' });
  [st] = onSkillButton(IDLE, byId('sandbag'), false);
  [, a] = onBoardSwipe(st, [[1, 1], [2, 1]], SKILLS);
  assert.deepEqual(a, { t: 'use', skill: 'sandbag', path: [[1, 1], [2, 1]] });
});

// ---------------------------------------------------------------- HUD
test('HUD writes the DOM only when a value changes', () => {
  const el = () => { let n = 0; return { get n() { return n; }, set textContent(_v: string | null) { n++; }, get textContent() { return ''; } }; };
  const sinks = { hp: el(), cash: el(), wave: el(), level: el(), gaugeText: el(),
    gauge: { style: { width: '' }, setAttribute() {} } };
  const hud = createHud(sinks);
  const v = { hp: 100, cash: 150, wave: 1, waves: 5, level: 1, flood: 0, threshold: 1.2 };
  assert.equal(hud(v), 6);
  assert.equal(hud(v), 0);
  assert.equal(hud({ ...v, hp: 99 }), 1);
  assert.equal(sinks.hp.n, 2);
});

test('toasts: 2 s life, at most 2 queued, duplicates refresh', () => {
  const q = { items: [] as { text: string; until: number }[] };
  pushToast(q, 'a', 0); pushToast(q, 'b', 0); pushToast(q, 'c', 0);
  assert.deepEqual(q.items.map(i => i.text), ['b', 'c']);
  assert.equal(q.items.length, TOAST_MAX);
  pushToast(q, 'c', 500);
  assert.equal(q.items.length, 2);
  assert.ok(expireToasts(q, TOAST_MS + 1));
  assert.deepEqual(q.items.map(i => i.text), ['c']);
});

// ---------------------------------------------------------------- play controller
test('play: commands in a wave apply before the next tick; prepare applies at once', () => {
  const p = createPlay(loadMap(MAP));
  send(p, { t: 'toggle', kind: 'pump', id: 0 });
  assert.ok(p.world.pumps[0].on, 'prepare: immediate');
  send(p, { t: 'startWave' });
  assert.equal(p.phase, 'wave');
  send(p, { t: 'toggle', kind: 'pump', id: 0 });
  assert.ok(p.world.pumps[0].on, 'queued during the wave');
  advance(p, TICK_MS);
  assert.ok(!p.world.pumps[0].on);
});

test('play: step budget — 1× ≤ 2 ticks/frame, 2× ≤ 4, backlog capped; pause stops', () => {
  const p = createPlay(loadMap(MAP));
  send(p, { t: 'startWave' });
  assert.equal(advance(p, 1000), 2);
  assert.ok(p.acc <= TICK_MS);
  send(p, { t: 'speed', x: 2 });
  assert.equal(advance(p, 1000), 4, '2×: backlog capped at 100 ms real = 200 ms sim, frame budget 4');
  p.acc = 0;
  assert.equal(advance(p, TICK_MS), 2, '2×: one real tick of time = two sim ticks');
  send(p, { t: 'pause', on: true });
  const t0 = p.world.tick;
  assert.equal(advance(p, 500), 0);
  assert.equal(p.world.tick, t0);
  assert.ok(ACC_CAP_MS >= TICK_MS * 3);
});

test('play: third pump is refused with an event', () => {
  const m = loadMap({ ...MAP, pumps: [[1, 1], [6, 1], [1, 10]] });
  const p = createPlay(m);
  send(p, { t: 'toggle', kind: 'pump', id: 0 });
  send(p, { t: 'toggle', kind: 'pump', id: 1 });
  send(p, { t: 'toggle', kind: 'pump', id: 2 });
  assert.deepEqual(p.events.at(-1), { t: 'refused', reason: 'maxOn' });
});

test('play: gate toggle closes the gate (0.8 wall)', () => {
  const m = loadMap({ ...MAP, gates: [{ tiles: [[1, 8]], open: true }] });
  const p = createPlay(m);
  send(p, { t: 'toggle', kind: 'gate', id: 0 });
  assert.equal(p.world.gates[0].open, false);
  assert.ok(Math.abs(m.terrain.grid.gate[m.world.gates[0].cells[0]] - 0.8) < 1e-6);
});

// ---------------------------------------------------------------- layout & i18n
test('board fits a 2:3 box', () => {
  assert.deepEqual(fitBoard(320, 424), { cssW: 282, cssH: 424 });
  assert.deepEqual(fitBoard(390, 900), { cssW: 390, cssH: 585 });
});

test('i18n: params fill; every toast key used by the play screen exists', () => {
  const t = createT(ko);
  assert.equal(t('toast.waveStart', { wave: 3 }), '웨이브 3 시작');
  assert.equal(t('missing.key'), 'missing.key');
  for (const k of ['toast.maxOn', 'toast.noCash', 'toast.paused', 'toast.cashEmptyPumps', 'toast.autoPaused', 'hud.speed', 'bar.start'])
    assert.notEqual(t(k), k, k);
  for (const s of SKILLS) assert.notEqual(t(s.i18n + '.name'), s.i18n + '.name');
});
