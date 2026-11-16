/**
 * Balance bot runner: plays every strategy on every map and prints the result matrix.
 * Exit code 1 when a single-means strategy clears or a mixed strategy loses.
 * Usage: node bots/run.ts [mapId ...]
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRun } from '../src/game/machine.ts';
import { loadMaps } from '../src/game/maps.ts';
import { loadSkillData } from '../src/rules/skills.ts';
import { STRATEGIES } from './strategies.ts';
import { playBot } from './play.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = async (p: string): Promise<unknown> => JSON.parse(readFileSync(join(root, p), 'utf8'));
const SEED = 7;
const CHARACTER = 'dike-keeper';

const maps = await loadMaps(read);
const data = await loadSkillData(read);
const only = process.argv.slice(2);
let bad = 0;
for (const map of maps) {
  if (only.length > 0 && !only.includes(map.id)) continue;
  console.log(`${map.id} (I1=${map.waves.i1}, pulse=${map.waves.pulseEvery}, cash=${map.start.cash})`);
  for (const s of STRATEGIES) {
    const r = playBot(createRun(map, data, CHARACTER, SEED), s);
    const ok = r.cleared === s.mixed;
    if (!ok) bad++;
    console.log(`  ${s.name.padEnd(11)} ${s.mixed ? 'mixed ' : 'single'} ${(r.cleared ? 'CLEAR' : `lose W${r.wave}`).padEnd(8)} hp ${String(r.hp).padStart(3)} cash ${String(r.cash).padStart(4)} ${ok ? 'ok' : 'FAIL'}`);
  }
}
console.log(bad === 0 ? 'bots: all expectations hold' : `bots: ${bad} expectation(s) failed`);
process.exitCode = bad === 0 ? 0 : 1;
