/**
 * Glacier 얼음 둑 (GAME_DESIGN_V2 §3.0 v2.4 decision): the glacier variant of build-levee is
 * a skill-ice wall that melts slowly, never wears or collapses, and is re-frozen for less.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { canUse, skillCost, useSkill } from '../../../src/rules/skills.ts';
import { updateStructures } from '../../../src/sim/structures.ts';
import { totalWater } from '../../../src/sim/grid.ts';
import { FLAG } from '../../../src/core/types.ts';
import { DIKE_AUTO as DIKE, setup } from './fixtures.ts';

function glacier() {
  const s = setup({ ...DIKE, region: 'glacier' });
  const zone = s.map.zones.zones.find(z => canUse(s.rs, 'build-levee', false, z.id) === null)!;
  const def = s.rs.defs.get('build-levee')!;
  const dam = def.regions!.glacier.ranks![0].ops[0] as { height: number; refreezeBelow: number; refreezeCost: number; cap: number };
  s.world.cash = 1000;
  return { ...s, zone, def, dam };
}
const builtLine = (g: ReturnType<typeof glacier>) => g.map.leveeLines[g.zone.id - 1].find(l => g.rs.iceBuilt[l.id] !== undefined)!;

test('ice dam: a cast builds a flagged wall of the rank height for the skill cost', () => {
  const g = glacier();
  assert.equal(useSkill(g.rs, 'build-levee', false, g.zone.id), null);
  const l = builtLine(g);
  assert.equal(g.world.cash, 1000 - g.def.cost);
  for (const c of l.cells) {
    assert.ok(Math.abs(g.world.grid.wall[c] - g.dam.height) < 1e-6);
    assert.ok(g.world.grid.flags[c] & FLAG.skillIce);
  }
});

test('ice dam: melts at skillIceMelt under full pressure, never wears to a collapse', () => {
  const g = glacier();
  useSkill(g.rs, 'build-levee', false, g.zone.id);
  const l = builtLine(g), c = l.cells[0], grid = g.world.grid;
  const ticks = 300;
  for (let t = 0; t < ticks; t++) { for (const j of g.zone.cells) grid.w[j] = 1; updateStructures(g.world); }
  assert.ok(Math.abs(grid.wall[c] - (g.dam.height - ticks * g.world.cfg.skillIceMelt)) < 1e-6);
  assert.equal(g.world.metrics.collapses, 0);
});

test('ice dam: melting adds no water and a melted-away cell loses its flag', () => {
  const g = glacier();
  useSkill(g.rs, 'build-levee', false, g.zone.id);
  const l = builtLine(g), grid = g.world.grid, before = totalWater(grid);
  const n = Math.ceil(g.dam.height / g.world.cfg.skillIceMelt) + 1;
  for (let t = 0; t < n; t++) updateStructures(g.world);
  assert.equal(totalWater(grid), before);
  for (const c of l.cells) { assert.equal(grid.wall[c], 0); assert.equal(grid.flags[c] & FLAG.skillIce, 0); }
});

test('ice dam: a line melted below refreezeBelow is re-frozen to its built height for refreezeCost', () => {
  const g = glacier();
  useSkill(g.rs, 'build-levee', false, g.zone.id);
  const l = builtLine(g), grid = g.world.grid;
  for (const c of l.cells) grid.wall[c] = g.dam.height * (g.dam.refreezeBelow - 0.05);
  assert.equal(skillCost(g.rs, g.def, g.zone.id), g.dam.refreezeCost);
  const cash = g.world.cash!;
  assert.equal(useSkill(g.rs, 'build-levee', false, g.zone.id), null);
  assert.equal(g.world.cash, cash - g.dam.refreezeCost);
  for (const c of l.cells) assert.ok(Math.abs(grid.wall[c] - g.dam.height) < 1e-6);
});

test('ice dam: refreeze is chosen only below the threshold; otherwise the next line costs full', () => {
  const g = glacier();
  useSkill(g.rs, 'build-levee', false, g.zone.id);
  const l = builtLine(g);
  for (const c of l.cells) g.world.grid.wall[c] = g.dam.height * (g.dam.refreezeBelow + 0.05);
  assert.equal(skillCost(g.rs, g.def, g.zone.id), g.def.cost);
});

test('ice dam: with every line at the cap and none melting the zone reports ALREADY_DONE', () => {
  const g = glacier();
  for (let k = 0; k < 40 && canUse(g.rs, 'build-levee', false, g.zone.id) === null; k++) useSkill(g.rs, 'build-levee', false, g.zone.id);
  for (const l of g.map.leveeLines[g.zone.id - 1]) for (const c of l.cells) assert.ok(g.world.grid.wall[c] <= g.dam.cap + 1e-6);
  assert.equal(canUse(g.rs, 'build-levee', false, g.zone.id), 'ALREADY_DONE');
});

test('button-level cash check allows a re-freeze when cash is below the build cost', () => {
  const g = glacier();
  g.world.cash = g.dam.refreezeCost;
  assert.equal(canUse(g.rs, 'build-levee', false), null);
  assert.equal(canUse(g.rs, 'build-levee', false, g.zone.id), 'NO_CASH');
});
