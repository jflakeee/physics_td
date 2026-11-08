// Glacier-lake outburst prototype (brief build order 2; story 001 AC 7).
// Runs the real sim (src/sim/*.ts via Node type stripping) on 둑마을 with a ring-shaped
// ice dam (a glacier pocket) holding a glacial lake off the inlet paths, plus the
// calibrated "ring levee + 1 pump" defence (levees repaired between waves).
// Usage: node prototypes/v2-glacier-lake.mjs [lake=30] [I1=120] [fracture=0.1]
import { buildTerrain } from '../src/sim/terrain.ts';
import { createWorld, runWaves, stepFluidOnly } from '../src/sim/step.ts';
import { addPump, setPump } from '../src/sim/sinks.ts';
import { buildLevee } from '../src/sim/structures.ts';
import { freezeCells, placeIce } from '../src/sim/ice.ts';

const arg = Object.fromEntries(process.argv.slice(2).map(a => a.split('=')).map(([k, v]) => [k, +v]));
const LAKE = arg.lake ?? 30, I1 = arg.I1 ?? 120, FRACTURE = arg.fracture ?? 0.1;
const DIKE = ['PPPIPPPO', 'PPFPPPPP', 'PPPPPPFP', 'PDPPPPPP', 'PPPPPPPP', 'IPPBBPPP', 'PPPBBPPI', 'PPPPPPPP', 'PPFPPPDP', 'PPPPPPPP', 'PPPPFPPP', 'OPPPIPPP'];
// glacier pocket: x 4..19, y 4..19 (NW, away from the N inlet at x 26..29)
const X0 = 4, X1 = 19, Y0 = 4, Y1 = 19;
const MELT = 0.0008;

function build({ lake, dam, defense, fracture = FRACTURE }) {
  const t = buildTerrain(DIKE);
  const w = createWorld(t, { I1 }, { cash: null, cfg: { iceFractureHead: fracture } });
  const W = t.grid.width, inside = [], rim = [];
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
    const edge = x === X0 || x === X1 || y === Y0 || y === Y1;
    (edge ? rim : inside).push(y * W + x);
  }
  // rim ice tall enough to hold the lake: dam = thickness above the rim ground
  placeIce(t.grid, rim, dam);
  for (const c of inside) t.grid.w[c] += lake / inside.length;
  const melt = w.cfg.iceMelt; w.cfg.iceMelt = 0;
  for (let k = 0; k < 2000; k++) stepFluidOnly(w); // settle the lake with melting off
  w.cfg.iceMelt = melt;
  if (defense) {
    const ring = [];
    for (let y = t.baseY - 6; y <= t.baseY + 6; y++) for (let x = t.baseX - 6; x <= t.baseX + 6; x++)
      if (Math.max(Math.abs(x - t.baseX), Math.abs(y - t.baseY)) === 6) ring.push(y * W + x);
    buildLevee(w, ring, 0.4);
    setPump(w, addPump(w, (t.baseY - 9) * W + t.baseX), true);
  }
  return { t, w, inside, rim };
}

/** Ice thickness that melts away at absolute tick `at` (waves run back to back). */
const damFor = at => at * MELT;
// absolute tick where each wave starts: 0, 1200, 2625, 4275, 6150
const WAVE_START = [0, 1200, 2625, 4275, 6150];

function play(o) {
  const { w, inside, rim } = build(o);
  let peak = 0;
  const r = runWaves(w, 1, 5, ww => {
    for (let i = 0; i < ww.grid.wall.length; i++) if (ww.grid.wall[i] > 0) ww.grid.dur[i] = 1; // repair
    if (o.blastAt === ww.wave) for (const c of rim) { ww.grid.w[c] += ww.grid.ice[c]; ww.grid.ice[c] = 0; }
    if (o.freezeAt === ww.wave) freezeCells(ww.grid, inside, 0.5);
  }, undefined, ww => {
    let f = 0; for (const c of ww.baseCore) f += ww.grid.w[c]; if (f > peak) peak = f;
  });
  let held = 0; for (const c of inside) held += w.grid.w[c] + w.grid.ice[c];
  return { ...r, peak: +peak.toFixed(2), held: +held.toFixed(1) };
}

/** Outflow hydrograph of the pocket with no inflow: how sudden is the release? */
function hydrograph(lake, dam, fracture) {
  const { w, inside } = build({ lake, dam, fracture });
  const sum = () => inside.reduce((s, c) => s + w.grid.w[c] + w.grid.ice[c], 0);
  let prev = sum(), peak = 0, start = -1, end = -1;
  const total = prev;
  for (let k = 0; k < Math.ceil(dam / MELT) + 3000; k++) {
    stepFluidOnly(w);
    const now = sum(), q = prev - now; prev = now;
    if (q > peak) peak = q;
    if (start < 0 && total - now > total * 0.1) start = k;
    if (end < 0 && total - now > total * 0.9) end = k;
  }
  return { held: +total.toFixed(1), damGoneAt: Math.ceil(dam / MELT), release10to90: `${start}..${end} (${end - start} ticks)`, peakPerTick: +peak.toFixed(3) };
}

console.log(`lake=${LAKE} I1=${I1}  (ring levee 0.4 + 1 pump, levees repaired each wave)`);
console.log('hydrograph, melt only    :', hydrograph(LAKE, damFor(WAVE_START[1]), 0));
console.log('hydrograph, with burst  :', hydrograph(LAKE, damFor(WAVE_START[1]), FRACTURE));
const rows = [
  ['no lake', { lake: 0, dam: 0, defense: true }],
  ...[1, 2, 3, 4, 5].map(k => [`lake bursts at W${k} start`, { lake: LAKE, dam: damFor(WAVE_START[k - 1]) + 0.01, defense: true }]),
  ['lake held past W5 (dam 7.0)', { lake: LAKE, dam: 7.0, defense: true }],
  ['burst W4 → blast at W1 (early release)', { lake: LAKE, dam: damFor(WAVE_START[3]) + 0.01, defense: true, blastAt: 1 }],
  ['burst W4 → freeze lake 50% at W4', { lake: LAKE, dam: damFor(WAVE_START[3]) + 0.01, defense: true, freezeAt: 4 }],
  ['burst W4 → freeze lake 50% at W5', { lake: LAKE, dam: damFor(WAVE_START[3]) + 0.01, defense: true, freezeAt: 5 }],
];
for (const [name, o] of rows) {
  const r = play(o);
  console.log(name.padEnd(40), r.result.padEnd(7), 'W' + r.wave, 'hp', String(r.hp).padStart(3), 'peakFlood', r.peak, 'leftInPocket', r.held);
}
