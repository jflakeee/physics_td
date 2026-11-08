// Sim step timing on 둑마을 (story 001 AC: < 1.0 ms desktop, < 2.0 ms at 4× CPU throttle).
// Usage: node scripts/bench-sim.mjs [ticks=3000]
import { buildTerrain } from '../src/sim/terrain.ts';
import { createWorld, startWave, stepSim } from '../src/sim/step.ts';
import { addPump, setPump } from '../src/sim/sinks.ts';
import { buildLevee } from '../src/sim/structures.ts';

const N = +(process.argv[2] ?? 3000);
const DIKE = ['PPPIPPPO', 'PPFPPPPP', 'PPPPPPFP', 'PDPPPPPP', 'PPPPPPPP', 'IPPBBPPP', 'PPPBBPPI', 'PPPPPPPP', 'PPFPPPDP', 'PPPPPPPP', 'PPPPFPPP', 'OPPPIPPP'];
const t = buildTerrain(DIKE);
const w = createWorld(t, { I1: 120 }, { cash: null });
const ring = [];
for (let y = t.baseY - 6; y <= t.baseY + 6; y++) for (let x = t.baseX - 6; x <= t.baseX + 6; x++)
  if (Math.max(Math.abs(x - t.baseX), Math.abs(y - t.baseY)) === 6) ring.push(y * 64 + x);
buildLevee(w, ring, 0.4);
setPump(w, addPump(w, (t.baseY - 9) * 64 + t.baseX), true);
setPump(w, addPump(w, (t.baseY + 9) * 64 + t.baseX), true);
startWave(w, 5);
for (let k = 0; k < 300; k++) stepSim(w); // warm up the JIT
const times = [];
for (let k = 0; k < N; k++) { const a = performance.now(); stepSim(w); times.push(performance.now() - a); }
times.sort((a, b) => a - b);
const mean = times.reduce((a, b) => a + b, 0) / N;
console.log(`ticks ${N}  mean ${mean.toFixed(3)} ms  p50 ${times[N >> 1].toFixed(3)}  p95 ${times[Math.floor(N * 0.95)].toFixed(3)}  max ${times[N - 1].toFixed(3)}`);
