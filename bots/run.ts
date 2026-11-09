// Balance bots: npm run bots [-- --map id] [-- I1=..]. Prints outcome per map × strategy and
// exits 1 if a single-means strategy clears or a mixed one fails (DETAILED §21).
import { readFileSync } from 'node:fs';
import { loadMap } from '../src/game/map.ts';
import type { MapData } from '../src/game/map.ts';
import { STRATEGIES, runStrategy } from './strategies.ts';
import { ECONOMY } from '../src/data/catalog.ts';

const args = process.argv.slice(2);
const only = args.includes('--map') ? args[args.indexOf('--map') + 1] : null;
const I1 = args.find(a => a.startsWith('I1='));
const ids = ['dike-village', 'willow-fields', 'glacier-meadow', 'glacier-lake-valley'].filter(id => !only || id === only);
/**
 * ⭐3 suggestion (DETAILED §8.2): the 숙련 bot (twoRingsTwoPumps) result score without draft
 * or first-clear bonuses — play + clear + HP×2 + no-retry — rounded down to 50. Real play adds
 * the build bonus (up to 300) and affinity on top, so ⭐3 asks for skilled play plus a build.
 */
const STAR3 = args.includes('--star3');
let bad = 0;
for (const id of ids) {
  const data = JSON.parse(readFileSync(`data/maps/${id}.json`, 'utf8')) as MapData;
  if (I1) data.I1 = +I1.slice(3);
  console.log(`\n${id} (I1=${data.I1})`);
  for (const [name, s] of Object.entries(STRATEGIES)) {
    const r = runStrategy(() => loadMap(data), name, ECONOMY);
    const ok = s.mixed ? r.result === 'clear' : r.result === 'defeat';
    if (!ok) bad++;
    if (STAR3 && name === 'twoRingsTwoPumps' && r.result === 'clear') {
      const R = ECONOMY.result, total = (r.score ?? 0) + R.clear + r.hp * R.hpPer + R.noRetry;
      console.log(`  ⭐3 suggestion: ${Math.floor(total / 50) * 50} (bot result ${total}, data ${data.star3Score})`);
    }
    console.log(`${ok ? '  ' : '✗ '}${name.padEnd(18)} ${r.result.padEnd(7)} W${r.wave} hp ${String(r.hp).padStart(3)} score ${String(r.score).padStart(5)} Lv${r.level}`);
  }
}
console.log(bad ? `\n${bad} outcome(s) off target` : '\nall maps on target');
process.exit(bad ? 1 : 0);
