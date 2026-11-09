// Scripted runs for tuning (node prototypes/v3-kids/calibrate.ts). Observations only.
import { createKidsWorld, fenceHealth, pickUpgrade, startWave, tick, upgradeChoices, useSkill, useUlt, villageWater, waterBalance, type CharId, type KidsWorld } from './core.ts';

type Plan = (w: KidsWorld) => void;
let n = { k: 0 };
const run = (char: CharId, plan: Plan) => {
  n = { k: 0 };
  const w = createKidsWorld(char);
  startWave(w);
  let guard = 0;
  while (w.phase !== 'won' && w.phase !== 'lost' && guard++ < 1e6) {
    if (w.phase === 'pick') pickUpgrade(w, upgradeChoices(w)[0] ?? null);
    plan(w);
    tick(w);
  }
  return `${w.phase.padEnd(4)} wave ${w.wave} stars ${w.stars} fence ${fenceHealth(w).toFixed(2)} village ${villageWater(w).toFixed(1)} drained ${w.drained.toFixed(0)}/${w.inflow.toFixed(0)} balance ${waterBalance(w).toExponential(1)}`;
};
const strokes = (y: number, x0: number, x1: number): [number, number][] => [[x0, y], [x1, y]];
const plans: Record<string, [CharId, Plan]> = {
  'keeper none': ['keeper', () => {}],
  'mole none': ['mole', () => {}],
  'keeper wall row 66 (3 strokes) + sand': ['keeper', w => {
    const segs = [[1, 22], [22, 43], [43, 62]];
    if (!w.cd.wall && n.k < 3) { const [a, b] = segs[n.k]; if (useSkill(w, 'wall', strokes(66, a, b))) n.k++; }
    if (!w.cd.sand && w.phase === 'wave') useSkill(w, 'sand', [[32, 74]]);
    if (w.ult >= 1) useUlt(w);
  }],
  'keeper only sand': ['keeper', w => { if (!w.cd.sand && w.phase === 'wave') useSkill(w, 'sand', [[20 + (w.waveTick % 3) * 12, 76]]); }],
  'mole dig row 50 + basin': ['mole', w => {
    const segs = [[1, 22], [22, 43], [43, 62]];
    if (!w.cd.dig && n.k < 3) { const [a, b] = segs[n.k]; if (useSkill(w, 'dig', strokes(50, a, b))) n.k++; }
    if (!w.cd.basin && w.phase === 'wave') useSkill(w, 'basin', [[32, 72]]);
    if (w.ult >= 1) useUlt(w, 40);
  }],
  'mole only basins': ['mole', w => { if (!w.cd.basin && w.phase === 'wave') { useSkill(w, 'basin', [[8 + (n.k % 5) * 12, 72]]); n.k++; } }],
  'keeper one wall + ult only': ['keeper', w => { if (!w.cd.wall && n.k < 1) { useSkill(w, 'wall', strokes(66, 20, 44)); n.k++; } if (w.ult >= 1) useUlt(w); }],
};
for (const [name, [c, p]] of Object.entries(plans)) console.log(name.padEnd(40), run(c, p));
