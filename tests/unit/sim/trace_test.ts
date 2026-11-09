/**
 * Water source tracer for the defeat screen (DETAILED §15.5 침수 원인).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrace, damageShares, fractionAt } from '../../../src/sim/trace.ts';
import { startWave, stepSim } from '../../../src/sim/step.ts';
import { dikeWorld, hashGrid } from './fixtures.ts';

function run(traced: boolean, ticks: number, weights?: number[], rain?: number) {
  const { w } = dikeWorld();
  if (weights) w.inlets.forEach((inl, k) => { inl.weights = [weights[k], weights[k], weights[k], weights[k], weights[k]]; });
  if (traced) w.trace = createTrace(w);
  startWave(w, 3, rain === undefined ? {} : { rain });
  for (let k = 0; k < ticks; k++) stepSim(w);
  return w;
}

test('tracing does not change the simulation', () => {
  assert.equal(hashGrid(run(true, 600).grid), hashGrid(run(false, 600).grid));
});

test('fractions stay a mix: every wet cell sums to 1', () => {
  const w = run(true, 900), t = w.trace!;
  let worst = 0;
  for (let i = 0; i < w.grid.w.length; i++) {
    if (w.grid.w[i] < 1e-6) continue;
    let s = 0; for (let k = 0; k < t.n; k++) s += fractionAt(t, i, k);
    worst = Math.max(worst, Math.abs(s - 1));
  }
  assert.ok(worst < 1e-6, `worst ${worst}`);
});

test('base damage is attributed to the source that flooded it', () => {
  // only inlet 0 carries water, no rain
  const w = run(true, 1650, [1, 0, 0, 0], 0);
  assert.ok(w.metrics.waveDamage > 0, 'the base took damage');
  const sh = damageShares(w.trace!);
  assert.ok(Math.abs(sh.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.ok(sh[0] > 0.95, `inlet 0 share ${sh[0]}`);
  // mixed run: rain gets a share too
  const m = run(true, 1650);
  const sm = damageShares(m.trace!);
  assert.ok(sm[m.trace!.rain] > 0.05 && sm[m.trace!.rain] < 0.6, `rain ${sm[m.trace!.rain]}`);
});

test('play: the tracer is on during real play and its mix survives a retry', async () => {
  const { loadMap } = await import('../../../src/game/map.ts');
  const { createPlay, send, advance, TICK_MS } = await import('../../../src/game/play.ts');
  const { createRules } = await import('../../../src/rules/skills.ts');
  const { CHARACTERS, ECONOMY, FUSIONS, SKILLS } = await import('../../../src/data/catalog.ts');
  const { MAPS } = await import('../../../src/data/maps.ts');
  const map = loadMap(MAPS[0]);
  const p = createPlay(map, { seed: 1, chars: CHARACTERS, fusions: FUSIONS, rules: pp => createRules(map, SKILLS, CHARACTERS[0], ECONOMY, () => pp.phase === 'wave') });
  assert.ok(p.world.trace);
  send(p, { t: 'startWave' });
  while (p.phase === 'wave') advance(p, TICK_MS);
  while (p.phase === 'levelup') send(p, { t: 'skip' });
  send(p, { t: 'startWave' });
  for (let k = 0; k < 600; k++) advance(p, TICK_MS);
  const f = p.world.trace!.f.slice();
  p.phase = 'defeat';
  send(p, { t: 'retry' });
  assert.ok(!p.world.trace!.f.every((v, i) => v === f[i]), 'mix rolled back with the checkpoint');
  assert.ok(p.world.trace!.damage.every(v => v === 0));
});
