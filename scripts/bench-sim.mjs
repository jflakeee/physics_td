// Sim step timing in Node (story 001 AC: < 1.0 ms desktop). Usage: node scripts/bench-sim.mjs [ticks=3000]
import { runBench } from './bench-core.mjs';
console.log(runBench(+(process.argv[2] ?? 3000)));
