// Balance bots: npm run bots [-- --map id] [-- I1=..]. Prints outcome per map × strategy and
// exits 1 if a single-means strategy clears or a mixed one fails (DETAILED §21).
import { readFileSync } from 'node:fs';
import { loadMap } from '../src/game/map.ts';
import type { MapData } from '../src/game/map.ts';
import { STRATEGIES, runStrategy } from './strategies.ts';

const args = process.argv.slice(2);
const only = args.includes('--map') ? args[args.indexOf('--map') + 1] : null;
const I1 = args.find(a => a.startsWith('I1='));
const ids = ['dike-village', 'willow-fields', 'glacier-meadow', 'glacier-lake-valley'].filter(id => !only || id === only);
let bad = 0;
for (const id of ids) {
  const data = JSON.parse(readFileSync(`data/maps/${id}.json`, 'utf8')) as MapData;
  if (I1) data.I1 = +I1.slice(3);
  console.log(`\n${id} (I1=${data.I1})`);
  for (const [name, s] of Object.entries(STRATEGIES)) {
    const r = runStrategy(() => loadMap(data), name);
    const ok = s.mixed ? r.result === 'clear' : r.result === 'defeat';
    if (!ok) bad++;
    console.log(`${ok ? '  ' : '✗ '}${name.padEnd(18)} ${r.result.padEnd(7)} W${r.wave} hp ${r.hp}`);
  }
}
console.log(bad ? `\n${bad} outcome(s) off target` : '\nall maps on target');
process.exit(bad ? 1 : 0);
