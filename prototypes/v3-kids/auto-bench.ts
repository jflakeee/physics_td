// node prototypes/v3-kids/auto-bench.ts — button-mashing kid vs. nothing, and auto-aim cost.
import { createKidsWorld, fenceHealth, pickUpgrade, startWave, tick, upgradeChoices, useUlt, villageWater, type CharId } from './core.ts';
import { autoCanalRow, autoUse } from './auto.ts';

for (const char of ['keeper', 'mole'] as CharId[]) {
  const w = createKidsWorld(char);
  startWave(w);
  let presses = 0, ms = 0, worst = 0;
  while (w.phase !== 'won' && w.phase !== 'lost') {
    if (w.phase === 'pick') pickUpgrade(w, upgradeChoices(w)[0] ?? null);
    for (const s of w.char.skills) if (!w.cd[s] && (w.phase === 'wave')) {
      const t = performance.now(); autoUse(w, s); const d = performance.now() - t; ms += d; worst = Math.max(worst, d); presses++;
    }
    if (w.ult >= 1 && w.phase === 'wave') useUlt(w, w.char.ult === 'canalUlt' ? autoCanalRow(w) : undefined);
    tick(w);
  }
  console.log(char.padEnd(7), w.phase, 'stars', w.stars, 'fence', fenceHealth(w).toFixed(2), 'village', villageWater(w).toFixed(1), `presses ${presses} avg ${(ms / presses).toFixed(0)}ms worst ${worst.toFixed(0)}ms`);
}
