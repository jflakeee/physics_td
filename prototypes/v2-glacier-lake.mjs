// Glacier-lake outburst prototype (brief build order 2; story 001 AC 7).
// Runs the real sim (src/sim/*.ts via Node type stripping) on 둑마을: a glacier pocket in
// the NW (ice rim, FLAG.glacier → melts at glacierMelt) holds a glacial lake. Defence is the
// calibrated "levee ring r6 + 1 pump" with levees re-cast each wave. The player's counter is
// the freeze skill as an ice wall (freezeToWall): water around the base frozen into a ring.
// Usage: node prototypes/v2-glacier-lake.mjs [lake=40] [I1=120] [wall=0.4] [fracture=0.1]
import { buildTerrain } from '../src/sim/terrain.ts';
import { createWorld, runWaves, stepFluidOnly } from '../src/sim/step.ts';
import { addPump, setPump } from '../src/sim/sinks.ts';
import { buildLevee } from '../src/sim/structures.ts';
import { freezeToWall, placeIce } from '../src/sim/ice.ts';

const arg = Object.fromEntries(process.argv.slice(2).map(a => a.split('=')).map(([k, v]) => [k, +v]));
const LAKE = arg.lake ?? 40, I1 = arg.I1 ?? 120, WALL = arg.wall ?? 0.4, FRACTURE = arg.fracture ?? 0.1;
const DIKE = ['PPPIPPPO', 'PPFPPPPP', 'PPPPPPFP', 'PDPPPPPP', 'PPPPPPPP', 'IPPBBPPP', 'PPPBBPPI', 'PPPPPPPP', 'PPFPPPDP', 'PPPPPPPP', 'PPPPFPPP', 'OPPPIPPP'];
const X0 = 4, X1 = 19, Y0 = 4, Y1 = 19;            // glacier pocket, off the N inlet path
const WAVE_START = [0, 1200, 2625, 4275, 6150];    // absolute tick of each wave start
const COOLDOWN = 1800;                              // freeze cooldown 60 s

function build(o) {
  const t = buildTerrain(DIKE);
  const w = createWorld(t, { I1 }, { cash: null, cfg: { iceFractureHead: o.fracture ?? FRACTURE } });
  const W = t.grid.width, inside = [], rim = [], ring = [], wallRing = [], zone = [];
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++)
    (x === X0 || x === X1 || y === Y0 || y === Y1 ? rim : inside).push(y * W + x);
  for (let y = 0; y < t.grid.height; y++) for (let x = 0; x < W; x++) {
    const r = Math.max(Math.abs(x - t.baseX), Math.abs(y - t.baseY)), i = y * W + x;
    if (r === 6) ring.push(i);
    if (r === 8) wallRing.push(i);
    if (r >= 7 && r <= 16) zone.push(i);
  }
  if (o.rim) {
    placeIce(t.grid, rim, o.rim, true);
    for (const c of inside) t.grid.w[c] += LAKE / inside.length;
    const m = w.cfg.glacierMelt; w.cfg.glacierMelt = 0;
    for (let k = 0; k < 2000; k++) stepFluidOnly(w); // settle the lake, rim frozen in place
    w.cfg.glacierMelt = m;
  }
  buildLevee(w, ring, 0.4);
  setPump(w, addPump(w, (t.baseY - 9) * W + t.baseX), true);
  return { t, w, inside, rim, wallRing, zone };
}

function play(o) {
  const { w, inside, rim, wallRing, zone } = build(o);
  let peak = 0, frozen = 0, lastFreeze = -Infinity, casts = 0, burst = -1;
  const pocket = [...inside, ...rim], held = ww => pocket.reduce((a, c) => a + ww.grid.w[c] + ww.grid.ice[c], 0);
  const lake0 = held(w);
  const r = runWaves(w, 1, 5, ww => {
    for (let i = 0; i < ww.grid.wall.length; i++) if (ww.grid.wall[i] > 0) ww.grid.dur[i] = 1;
  }, undefined, ww => {
    let f = 0; for (const c of ww.baseCore) f += ww.grid.w[c]; if (f > peak) peak = f;
    if (burst < 0 && o.rim && held(ww) < lake0 * 0.8) burst = ww.tick; // 20% of lake + dam gone
    // dam upkeep: refreeze lake water into the glacier rim, back to its original height
    if (o.upkeep && ww.tick - lastFreeze >= COOLDOWN && ww.tick > 0) {
      frozen += freezeToWall(ww.grid, inside, rim, o.rim); lastFreeze = ww.tick; casts++;
    }
    // freeze policy: cast when the base flood passes `freezeAt` and the cooldown is over
    if (o.freezeAt !== undefined && f > o.freezeAt && ww.tick - lastFreeze >= COOLDOWN) {
      frozen += freezeToWall(ww.grid, zone, wallRing, WALL); lastFreeze = ww.tick; casts++;
    }
  });
  const wave = burst < 0 ? '-' : 'W' + (WAVE_START.filter(s => s <= burst).length);
  return { ...r, peak: +peak.toFixed(2), frozen: +frozen.toFixed(1), casts, burst: burst < 0 ? '-' : `${burst} (${wave})` };
}

/** Pocket outflow with no inflow: ticks to release 10%→90% of the lake once it goes. */
function release(fracture) {
  const { w, inside } = build({ rim: 0.5, fracture });
  const sum = () => inside.reduce((s, c) => s + w.grid.w[c] + w.grid.ice[c], 0);
  const total = sum();
  let a = -1, b = -1;
  for (let k = 0; k < 9000 && b < 0; k++) {
    stepFluidOnly(w);
    const out = total - sum();
    if (a < 0 && out > total * 0.1) a = k;
    if (b < 0 && out > total * 0.9) b = k;
  }
  return `${a}..${b} (${b - a} ticks)`;
}

console.log(`lake=${LAKE} I1=${I1} iceWall=${WALL} fracture=${FRACTURE}`);
console.log('release 10→90%: melt only', release(0), ' | with outburst rule', release(FRACTURE));
const rows = [['no lake', {}]];
for (const rim of [0.3, 0.5, 0.7, 0.9]) {
  rows.push([`glacier rim ${rim}`, { rim }]);
  rows.push([`glacier rim ${rim} + dam upkeep`, { rim, upkeep: true }]);
}
for (const [name, o] of rows) {
  const r = play(o);
  console.log(name.padEnd(28), r.result.padEnd(7), 'W' + r.wave, 'hp', String(r.hp).padStart(3),
    'peakFlood', String(r.peak).padStart(5), 'burst', String(r.burst).padEnd(11), 'casts', r.casts, 'frozen', r.frozen);
}
