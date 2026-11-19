// Shared M0 scenarios (Node checks and the browser benchmark).
import { buildTerrain } from '../../src/sim/terrain.ts';
import { createWorld, startWave, stepSim, stepFluidOnly } from '../../src/sim/step.ts';
import { addPump, setPump } from '../../src/sim/sinks.ts';
import { buildLevee } from '../../src/sim/structures.ts';
import { createTrace } from '../../src/sim/trace.ts';
import { createLayers, stepLayers, withLayersAsGround } from './core.mjs';
import MATS from './materials.json' with { type: 'json' };

export const DIKE = ['PPPIPPPO', 'PPFPPPPP', 'PPPPPPFP', 'PDPPPPPP', 'PPPPPPPP', 'IPPBBPPP', 'PPPBBPPI', 'PPPPPPPP', 'PPFPPPDP', 'PPPPPPPP', 'PPPPFPPP', 'OPPPIPPP'];
export { MATS };

/** A world on 둑마을 plus lava + sand layers. */
export function makeWorld(opt = {}) {
  const t = buildTerrain(DIKE);
  const world = createWorld(t, { I1: opt.I1 ?? 120 }, { cash: null });
  const L = createLayers(t.grid.width, t.grid.height, MATS.layers);
  return { t, world, g: world.grid, L };
}

/** Fill a rectangle of a layer (or water when k < 0). */
export function fill(s, k, x0, y0, x1, y1, v) {
  const W = s.g.width;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * W + x;
    if (k < 0) s.g.w[i] += v; else { s.L.depth[k][i] += v; if (s.L.defs[k].heat) s.L.energy[i] += v * s.L.defs[k].heat.initial; }
  }
}

/** One full tick: water (+ structures, sinks… when `full`) with layers as ground, then the layers. */
export function tick(s, full, reactions) {
  withLayersAsGround(s.L, s.g, () => full ? stepSim(s.world) : stepFluidOnly(s.world));
  stepLayers(s.L, s.g, reactions ? MATS.reactions : null);
}

/**
 * Worst case for the budget (§9): 둑마을 W5 with ring levee + 2 pumps (as scripts/bench-core.mjs)
 * and both special layers active over large areas, reactions on.
 */
export function worstCase(traced) {
  const s = makeWorld();
  const { t, world } = s, W = t.grid.width, ring = [];
  for (let y = t.baseY - 6; y <= t.baseY + 6; y++) for (let x = t.baseX - 6; x <= t.baseX + 6; x++)
    if (Math.max(Math.abs(x - t.baseX), Math.abs(y - t.baseY)) === 6) ring.push(y * W + x);
  buildLevee(world, ring, 0.4);
  setPump(world, addPump(world, (t.baseY - 9) * W + t.baseX), true);
  setPump(world, addPump(world, (t.baseY + 9) * W + t.baseX), true);
  if (traced) world.trace = createTrace(world);
  startWave(world, 5);
  fill(s, 0, 0, 0, 63, 30, 0.5);   // lava over the north third
  fill(s, 1, 0, 64, 63, 95, 0.6);  // sand over the south third
  for (let y = 70; y < 96; y += 6) fill(s, 1, 10, y, 50, y + 2, 0.6); // ridges keep sand moving
  return s;
}

/** Time `n` ticks of the worst case after a warm-up (ms stats). `layers=false` = water only. */
export function runBench(n = 3000, traced = false, layers = true) {
  const s = worstCase(traced);
  // keep both layers busy for the whole run: sources pour lava and sand (worst case, §9)
  let k = 0;
  const feed = () => { if (++k % 30 === 0) { fill(s, 0, 8, 2, 14, 8, 0.2); fill(s, 0, 49, 2, 55, 8, 0.2); fill(s, 1, 28, 88, 35, 94, 0.3); } };
  const step = layers ? () => { feed(); tick(s, true, true); } : () => stepSim(s.world);
  for (let k = 0; k < 300; k++) step();
  const times = new Float64Array(n);
  for (let k = 0; k < n; k++) { const a = performance.now(); step(); times[k] = performance.now() - a; }
  times.sort();
  let sum = 0; for (const v of times) sum += v;
  const r = v => +v.toFixed(3);
  return { ticks: n, mean: r(sum / n), p50: r(times[n >> 1]), p95: r(times[Math.floor(n * 0.95)]), p99: r(times[Math.floor(n * 0.99)]), max: r(times[n - 1]), activeLast: s.L.activeCount };
}
