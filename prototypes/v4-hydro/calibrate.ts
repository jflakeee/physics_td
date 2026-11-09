// node prototypes/v4-hydro/calibrate.ts — scripted runs, observations only.
import { balance, chooseCard, createHydro, recommend, placeBuilding, seconds, start, tick, weatherAt, xpNeed, canBuild, type BuildKind, type HydroWorld } from './core.ts';

type Plan = (w: HydroWorld) => void;
function run(name: string, plan: Plan, log = false) {
  const w = createHydro(1);
  start(w);
  let lastSec = -1, minPow = 1e9, maxPow = 0;
  while (w.phase !== 'won' && w.phase !== 'lost') {
    if (w.phase === 'levelup') chooseCard(w, w.cards[0]);
    plan(w);
    tick(w);
    const s = Math.floor(seconds(w));
    if (s !== lastSec && (w.tick % 30 === 0)) {
      lastSec = s;
      minPow = Math.min(minPow, w.lastSecPower); maxPow = Math.max(maxPow, w.lastSecPower);
      if (log && s % 10 === 0) console.log(`  t${String(s).padStart(3)} mul ${weatherAt(s).mul.toFixed(2)} pow/s ${w.lastSecPower.toFixed(1)} Lv${w.level} coins ${w.coins} ♥${w.hearts} plants ${w.plants.map(p => `${p.hp.toFixed(1)}/${p.drown.toFixed(1)}`).join(' ')}`);
    }
  }
  console.log(name.padEnd(28), w.phase, `t${seconds(w).toFixed(0)} Lv${w.level} ♥${w.hearts} coins ${w.coins} plants ${w.plants.length} pow/s ${minPow.toFixed(1)}..${maxPow.toFixed(1)} bal ${balance(w).toExponential(1)}`);
}
const buildWhenRich = (order: BuildKind[]): Plan => { let k = 0; return w => {
  if (k >= order.length) return;
  const kind = order[k];
  const site = recommend(w, kind, 30);
  if (site !== null && canBuild(w, site, kind) && placeBuilding(w, site, kind)) k++;
}; };
run('nothing', () => {}, true);
run('wheels only', buildWhenRich(['wheel', 'wheel', 'wheel', 'wheel']));
run('wheel+res+wall mix', buildWhenRich(['wheel', 'reservoir', 'wheel', 'wall', 'reservoir', 'wheel', 'wall']));
console.log('xp need L1..6', [1, 2, 3, 4, 5, 6].map(xpNeed).join(' '));
