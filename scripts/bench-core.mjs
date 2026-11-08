// Shared sim-step benchmark (Node and browser). Scenario: 둑마을 W5, ring levee + 2 pumps.
import { buildTerrain } from '../src/sim/terrain.ts';
import { createWorld, startWave, stepSim } from '../src/sim/step.ts';
import { addPump, setPump } from '../src/sim/sinks.ts';
import { buildLevee } from '../src/sim/structures.ts';

const DIKE = ['PPPIPPPO', 'PPFPPPPP', 'PPPPPPFP', 'PDPPPPPP', 'PPPPPPPP', 'IPPBBPPP', 'PPPBBPPI', 'PPPPPPPP', 'PPFPPPDP', 'PPPPPPPP', 'PPPPFPPP', 'OPPPIPPP'];

/** Time `n` sim steps after a 300-tick warm-up. Returns ms statistics. */
export function runBench(n = 3000) {
  const t = buildTerrain(DIKE);
  const w = createWorld(t, { I1: 120 }, { cash: null });
  const W = t.grid.width, ring = [];
  for (let y = t.baseY - 6; y <= t.baseY + 6; y++) for (let x = t.baseX - 6; x <= t.baseX + 6; x++)
    if (Math.max(Math.abs(x - t.baseX), Math.abs(y - t.baseY)) === 6) ring.push(y * W + x);
  buildLevee(w, ring, 0.4);
  setPump(w, addPump(w, (t.baseY - 9) * W + t.baseX), true);
  setPump(w, addPump(w, (t.baseY + 9) * W + t.baseX), true);
  startWave(w, 5);
  for (let k = 0; k < 300; k++) stepSim(w); // JIT warm-up
  const times = new Float64Array(n);
  for (let k = 0; k < n; k++) { const a = performance.now(); stepSim(w); times[k] = performance.now() - a; }
  times.sort();
  let sum = 0; for (const v of times) sum += v;
  const r = v => +v.toFixed(3);
  return { ticks: n, mean: r(sum / n), p50: r(times[n >> 1]), p95: r(times[Math.floor(n * 0.95)]), max: r(times[n - 1]) };
}
