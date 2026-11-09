/**
 * Story 003 — characters and skills (DETAILED_DESIGN_V2 §6, SKL-01..05).
 * Story: production/epics/physics-td/story-003-characters-and-skills.md
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import ko from '../../../i18n/ko.json' with { type: 'json' };
import { CHARACTERS, ECONOMY, SKILLS } from '../../../src/data/catalog.ts';
import { canUse, cooldownTicks, createRules, grant, regional, rulesTick, rulesWaveEnd, rulesWaveStart, useSkill, zoneTargetable } from '../../../src/rules/skills.ts';
import { REFUSAL_TOAST } from '../../../src/rules/types.ts';
import type { Refusal } from '../../../src/rules/types.ts';
import { swipeCells, threatDir } from '../../../src/rules/effects.ts';
import { totalWater } from '../../../src/sim/grid.ts';
import { startWave, stepSim } from '../../../src/sim/step.ts';
import { FLAG, ZT } from '../../../src/core/types.ts';
import { DIKE_AUTO as DIKE, WILLOW, dikeKeeper, setup, wetland, zonesOf } from './fixtures.ts';
import { loadMap } from '../../../src/game/map.ts';
import { advance, createPlay, send, TICK_MS } from '../../../src/game/play.ts';

const KNOWN_OPS = new Set(['buildLevee', 'iceLevee', 'tempWallPath', 'repairAll', 'lowerZone', 'convertZone', 'modifier', 'freezeZone', 'iceWall']);
const tps = 30;

// ---------------------------------------------------------------- data
test('data: 10 skills (2 common + 4 per character), every op known, every i18n key present', () => {
  assert.equal(SKILLS.length, 10);
  assert.equal(SKILLS.filter(s => s.owner === 'common').length, 2);
  for (const c of CHARACTERS) {
    const own = SKILLS.filter(s => s.owner === c.id);
    assert.equal(own.length, 4, c.id);
    for (const slot of ['passive', 'basic', 'tactical', 'ultimate'] as const) assert.ok(own.some(s => s.id === c.skills[slot] && s.slot === slot));
    assert.ok((ko as Record<string, string>)[c.i18n + '.name']);
  }
  for (const s of SKILLS) {
    assert.ok((ko as Record<string, string>)[s.i18n + '.name'], s.i18n);
    for (const r of [s, ...Object.values(s.regions ?? {})]) for (const rank of r.ranks ?? []) for (const op of rank.ops) assert.ok(KNOWN_OPS.has(op.op), op.op);
    for (const reg of Object.values(s.regions ?? {})) if (reg.i18n) assert.ok((ko as Record<string, string>)[reg.i18n + '.name'], reg.i18n);
  }
});

test('data: pump numbers come from pump.json', () => {
  const { world } = setup(DIKE);
  const p = SKILLS.find(s => s.id === 'pump')!.params!;
  assert.equal(world.cfg.pumpMaxOn, p.maxOn);
  assert.equal(world.cfg.pumpRate, p.ratePerCell);
  assert.equal(world.cfg.pumpRadius, p.radius);
  assert.ok(Math.abs(world.cfg.pumpCashPerTick - p.costPerSecond / tps) < 1e-12);
});

// ---------------------------------------------------------------- refusals (SKL-01)
test('SKL-01: each of the 8 refusal codes, each with its toast key', () => {
  const { rs, world } = setup(DIKE);
  const plain = zonesOf(rs, 'plain').find(id => zoneTargetable(rs, 'build-levee', id))!;
  const base = zonesOf(rs, 'base')[0];
  const got: Partial<Record<Refusal, true>> = {};
  const expect = (r: Refusal | null, code: Refusal) => { assert.equal(r, code); got[code] = true; };
  expect(canUse(rs, 'sandbag', false), 'NOT_OWNED');
  expect(canUse(rs, 'build-levee', true, plain), 'PAUSED');
  grant(rs, 'sandbag');
  assert.equal(useSkill(rs, 'sandbag', false, undefined, [[10, 20], [20, 20]]), null);
  expect(canUse(rs, 'sandbag', false), 'COOLDOWN');
  grant(rs, 'night-repair');
  expect(canUse(rs, 'night-repair', false), 'NO_GAUGE');
  world.cash = 5;
  expect(canUse(rs, 'build-levee', false, plain), 'NO_CASH');
  world.cash = 150;
  grant(rs, 'open-floodplain', true);
  expect(canUse(rs, 'open-floodplain', false), 'NO_TARGET_IN_MAP'); // 둑마을 has no field zone
  expect(canUse(rs, 'build-levee', false, base), 'BAD_TARGET');
  const w = setup(WILLOW, wetland);
  const field = zonesOf(w.rs, 'field')[0];
  assert.equal(useSkill(w.rs, 'open-floodplain', false, field), null);
  expect(canUse(w.rs, 'open-floodplain', false, field), 'ALREADY_DONE');
  assert.equal(Object.keys(got).length, 8);
  for (const k of Object.keys(REFUSAL_TOAST) as Refusal[]) {
    const key = REFUSAL_TOAST[k];
    if (key) assert.ok((ko as Record<string, string>)[key], key); else assert.equal(k, 'NOT_OWNED');
  }
});

// ---------------------------------------------------------------- cooldown (SKL-05)
test('SKL-05: cooldowns are ticks and only fall during wave ticks', () => {
  const { rs } = setup(DIKE);
  grant(rs, 'sandbag');
  useSkill(rs, 'sandbag', false, undefined, [[10, 20], [20, 20]]);
  const cd0 = cooldownTicks(rs, 'sandbag');
  assert.equal(cd0, 25 * tps);
  // prepare phase: nothing calls rulesTick, the cooldown stays (10 s of waiting)
  assert.equal(cooldownTicks(rs, 'sandbag'), cd0);
  for (let k = 0; k < 30; k++) rulesTick(rs);
  assert.equal(cooldownTicks(rs, 'sandbag'), cd0 - 30);
  // common freeze has its own cooldown record
  const plain = zonesOf(rs, 'plain')[0];
  assert.equal(useSkill(rs, 'freeze', false, plain), null);
  assert.equal(cooldownTicks(rs, 'freeze'), 60 * tps);
});

// ---------------------------------------------------------------- build levee (SKL-02)
test('SKL-02: levee goes on the line facing the threat, then the next line, then lowest +0.1 up to 0.6', () => {
  const { rs, world, map } = setup(DIKE);
  const zone = map.zones.zones.find(z => map.leveeLines[z.id - 1].length >= 2)!;
  const lines = map.leveeLines[zone.id - 1];
  const dir = threatDir(world, 1, map.terrain.baseX, map.terrain.baseY);
  const score = (l: typeof lines[0]) => -(l.facing[0] * dir[0] + l.facing[1] * dir[1]);
  const first = [...lines].sort((a, b) => score(b) - score(a))[0];
  world.cash = 10_000;
  assert.equal(useSkill(rs, 'build-levee', false, zone.id), null);
  assert.ok(first.cells.every(c => Math.abs(world.grid.wall[c] - 0.3) < 1e-6), 'first line faces the incoming water');
  for (let k = 1; k < lines.length; k++) useSkill(rs, 'build-levee', false, zone.id);
  for (const l of lines) assert.ok(l.cells.every(c => world.grid.wall[c] > 0), 'every line built');
  useSkill(rs, 'build-levee', false, zone.id);
  const heights = lines.map(l => world.grid.wall[l.cells[0]]).sort();
  assert.ok(Math.abs(heights.at(-1)! - 0.4) < 1e-6, 'lowest line raised by 0.1');
  for (let k = 0; k < 20; k++) useSkill(rs, 'build-levee', false, zone.id);
  for (const l of lines) for (const c of l.cells) assert.ok(world.grid.wall[c] <= 0.6 + 1e-6);
  assert.equal(world.cash, 10_000 - 20 * (lines.length + 21));
});

test('build-levee: zones without levee lines are not targets', () => {
  const { rs, map } = setup(DIKE);
  const none = map.zones.zones.find(z => z.type === 'plain' && map.leveeLines[z.id - 1].length === 0)!;
  assert.equal(zoneTargetable(rs, 'build-levee', none.id), false);
  assert.equal(canUse(rs, 'build-levee', false, none.id), 'BAD_TARGET');
});

// ---------------------------------------------------------------- sandbag (SKL-03)
test('SKL-03: 30-cell swipe → 24 path cells × width 2; nothing within 3 cells of inlets or the base', () => {
  const { world, map } = setup(DIKE);
  const y = 20;
  const cells = swipeCells(world, [[5, y], [34, y]], 24, 2, 3);
  assert.equal(cells.length, 48);
  for (const c of cells) assert.ok(c % 64 <= 28 && [y, y + 1].includes((c / 64) | 0));
  const bx = map.terrain.baseX, by = map.terrain.baseY;
  const near = swipeCells(world, [[bx - 6, by], [bx + 6, by]], 24, 2, 3);
  for (const c of near) {
    const x = c % 64, yy = (c / 64) | 0;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const f = world.grid.flags[(yy + dy) * 64 + x + dx];
      assert.ok(!(f & (FLAG.baseCore | FLAG.inlet)));
    }
  }
  assert.ok(near.length < 26, 'cells next to the base were dropped');
});

test('sandbag places a temporary wall for ttl ticks', () => {
  const { rs, world } = setup(DIKE, dikeKeeper, ['dike-passive', 'build-levee', 'sandbag']);
  assert.equal(useSkill(rs, 'sandbag', false, undefined, [[5, 20], [15, 20]]), null);
  const c = 20 * 64 + 8;
  assert.ok(Math.abs(world.grid.tmp[c] - 0.25) < 1e-6);
  assert.equal(world.grid.tmpTtl[c], 8 * tps);
});

// ---------------------------------------------------------------- gauge & ultimates
test('gauge: charges from the character metric, usable at 100, resets to 0 on use', () => {
  const { rs, world } = setup(DIKE, dikeKeeper, ['dike-passive', 'build-levee', 'night-repair']);
  world.metrics.blocked += 150; rulesTick(rs);
  assert.equal(rs.gauge, 75);
  assert.equal(canUse(rs, 'night-repair', false), 'NO_GAUGE');
  world.metrics.blocked += 100; rulesTick(rs);
  assert.equal(rs.gauge, 100, 'capped at 100');
  const w = setup(WILLOW, wetland);
  w.world.metrics.ecologyBest += 3; rulesTick(w.rs);
  assert.equal(w.rs.gauge, 15, 'wetland researcher: +5 per 1% of new ecology best');
  // night repair: full durability, +0.1 until wave end
  world.cash = 1000;
  const zone = rs.map.zones.zones.find(z => rs.map.leveeLines[z.id - 1].length)!;
  useSkill(rs, 'build-levee', false, zone.id);
  const c = rs.map.leveeLines[zone.id - 1][0].cells[0];
  world.grid.dur[c] = 0.2;
  assert.equal(useSkill(rs, 'night-repair', false), null);
  assert.equal(rs.gauge, 0);
  assert.equal(world.grid.dur[c], 1);
  assert.ok(Math.abs(world.grid.wall[c] - 0.4) < 1e-6);
  rulesWaveEnd(rs);
  assert.ok(Math.abs(world.grid.wall[c] - 0.3) < 1e-6, 'height restored at wave end');
});

test('river breath: absorbMul ×3 for 10 s, then back', () => {
  const { rs, world } = setup(WILLOW, wetland, ['wetland-passive', 'open-floodplain', 'river-breath']);
  assert.equal(world.mods.absorbMul, 1);
  rs.gauge = 100;
  assert.equal(useSkill(rs, 'river-breath', false), null);
  assert.equal(world.mods.absorbMul, 3);
  for (let k = 0; k < 10 * tps; k++) rulesTick(rs);
  assert.equal(world.mods.absorbMul, 1);
});

// ---------------------------------------------------------------- wetland researcher
test('SKL-04: an opened field earns no income at wave end; it was lowered by 0.15', () => {
  const a = setup(WILLOW, wetland), b = setup(WILLOW, wetland);
  const field = zonesOf(a.rs, 'field')[0];
  const cell = a.map.zones.zones[field - 1].cells[0];
  const h0 = a.world.grid.h[cell];
  useSkill(a.rs, 'open-floodplain', false, field);
  assert.ok(Math.abs(a.world.grid.h[cell] - (h0 - 0.15)) < 1e-6);
  rulesWaveStart(a.rs); rulesWaveStart(b.rs);
  const ia = rulesWaveEnd(a.rs), ib = rulesWaveEnd(b.rs);
  assert.equal(ib - ia, ECONOMY.fieldIncome);
  assert.equal(ib, ECONOMY.waveClear + ECONOMY.fieldIncome * zonesOf(b.rs, 'field').length);
});

test('restore wetland: converts after 10 s of wave time; ecology can exceed 100%', () => {
  const { rs, world, map } = setup(WILLOW, wetland, ['wetland-passive', 'open-floodplain', 'restore-wetland']);
  const field = zonesOf(rs, 'field')[0];
  assert.equal(useSkill(rs, 'restore-wetland', false, field), null);
  assert.equal(world.cash, 150 - 30);
  assert.equal(canUse(rs, 'restore-wetland', false, field), 'COOLDOWN');
  for (let k = 0; k < 10 * tps - 1; k++) rulesTick(rs);
  assert.equal(map.zones.zones[field - 1].type, 'field');
  rulesTick(rs);
  assert.equal(map.zones.zones[field - 1].type, 'wetland');
  assert.equal(world.grid.ztype[map.zones.zones[field - 1].cells[0]], ZT.wetland);
  startWave(world, 1); stepSim(world);
  assert.ok(world.metrics.ecology > 100, `ecology ${world.metrics.ecology}`);
});

test('wetland passive: absorption drains water on wetland cells only with the passive', () => {
  const run = (start: string[]) => {
    const { world, map } = setup(WILLOW, wetland, start);
    const wz = map.zones.zones.find(z => z.type === 'wetland')!;
    for (const c of wz.cells) world.grid.w[c] = 0.5;
    world.cfg.K = 0; startWave(world, 1); world.waveParams.mul = 0;
    for (let k = 0; k < 30; k++) stepSim(world);
    return world.metrics.drained;
  };
  assert.equal(run(['open-floodplain']), 0);
  assert.ok(run(['wetland-passive', 'open-floodplain']) > 0);
});

// ---------------------------------------------------------------- axes
test('axes: gain +3, rank up +1, use +cooldown/10 (cost-type +1), passive +1 per wave', () => {
  const { rs } = setup(DIKE);
  assert.equal(rs.axes.safety, 6, 'passive + basic granted');
  grant(rs, 'build-levee');
  assert.equal(rs.axes.safety, 7);
  grant(rs, 'sandbag');
  useSkill(rs, 'sandbag', false, undefined, [[5, 20], [15, 20]]);
  assert.equal(rs.axes.safety, 10 + 2.5);
  const z = rs.map.zones.zones.find(zz => rs.map.leveeLines[zz.id - 1].length)!;
  useSkill(rs, 'build-levee', false, z.id);
  assert.equal(rs.axes.safety, 13.5);
  rulesWaveEnd(rs);
  assert.equal(rs.axes.safety, 14.5);
  assert.equal(rs.axes.harmony, 0, 'common freeze has no axis');
});

// ---------------------------------------------------------------- regions
test('glacier region: build-levee is presented as 얼음 둑 and still builds in the prepare phase', () => {
  const { rs, world, map } = setup({ ...DIKE, region: 'glacier' });
  const def = rs.defs.get('build-levee')!;
  const g = regional(def, 'glacier');
  assert.equal(g.i18n, 'skill.iceLevee');
  assert.equal(g.icon, '🏔');
  assert.equal(regional(def, 'river').i18n, 'skill.buildLevee');
  const zone = map.zones.zones.find(z => map.leveeLines[z.id - 1].length)!;
  assert.equal(useSkill(rs, 'build-levee', false, zone.id), null);
  assert.ok(map.leveeLines[zone.id - 1].some(l => world.grid.wall[l.cells[0]] > 0), 'a dry zone still gets its levee');
});

test('freeze builds an ice wall from the zone water on its levee line', () => {
  const { rs, world, map } = setup(DIKE);
  const zone = map.zones.zones.find(z => map.leveeLines[z.id - 1].length)!;
  for (const c of zone.cells) world.grid.w[c] = 0.1;
  const before = totalWater(world.grid);
  useSkill(rs, 'freeze', false, zone.id);
  assert.ok(map.leveeLines[zone.id - 1].some(l => world.grid.ice[l.cells[0]] > 0));
  assert.ok(Math.abs(totalWater(world.grid) - before) < 1e-9);
});

// ---------------------------------------------------------------- play integration

test('play + rules: cooldown falls only in waves; wave end pays income; skill refusals surface as events', () => {
  const map = loadMap(DIKE);
  const p = createPlay(map, { rules: pp => createRules(map, SKILLS, dikeKeeper, ECONOMY, () => pp.phase === 'wave', ['dike-passive', 'build-levee', 'sandbag']) });
  const rs = p.rules!;
  send(p, { t: 'skill', id: 'sandbag', path: [[5, 20], [15, 20]] });
  const cd = cooldownTicks(rs, 'sandbag');
  advance(p, 1000);
  assert.equal(cooldownTicks(rs, 'sandbag'), cd, 'prepare: no decrease');
  send(p, { t: 'skill', id: 'sandbag', path: [[5, 30], [15, 30]] });
  assert.deepEqual(p.events.at(-1), { t: 'refused', reason: 'COOLDOWN' });
  send(p, { t: 'startWave' });
  advance(p, TICK_MS);
  assert.equal(cooldownTicks(rs, 'sandbag'), cd - 1);
  const cash0 = p.world.cash!;
  p.events.length = 0;
  while (p.phase === 'wave') advance(p, TICK_MS);
  const inc = p.events.find(e => e.t === 'income');
  assert.ok(inc && inc.t === 'income' && inc.amount === ECONOMY.waveClear);
  assert.ok(p.world.cash! >= cash0 + ECONOMY.waveClear - 1, 'income added (no pumps running)');
});
