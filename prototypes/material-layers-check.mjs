// Material layers M0 gate (docs/MATERIAL_LAYERS_DESIGN.md §11-1): water + lava + sand on the
// real sim grid. Checks (a) per-layer mass, (b) symmetry, (c) determinism, (d) 100k-tick
// robustness, (e) timing in headless Chromium at 1× and 4× CPU throttle (traced and not).
// Usage: node prototypes/material-layers-check.mjs [--skip-bench] [--ticks=100000]
// Prints observations and PASS/FAIL against the §11 numbers; exits 1 on any FAIL.
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { createRng, seedState } from '../src/core/rng.ts';
import { makeWorld, fill, tick } from './material-layers/scenario.mjs';
import { total, hashArrays } from './material-layers/core.mjs';

const args = process.argv.slice(2);
const LONG = +(args.find(a => a.startsWith('--ticks='))?.slice(8) ?? 100000);
let fails = 0;
const report = (name, ok, detail) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`); };

// (a) mass — no inflow, sinks or reactions; 10k ticks
{
  const s = makeWorld();
  fill(s, -1, 10, 10, 30, 40, 0.3); fill(s, 0, 35, 20, 55, 45, 0.6); fill(s, 1, 20, 55, 40, 80, 1.0);
  const w0 = total(s.g.w), l0 = total(s.L.depth[0]), s0 = total(s.L.depth[1]);
  for (let k = 0; k < 10000; k++) tick(s, false, false);
  const dw = Math.abs(total(s.g.w) - w0), dl = Math.abs(total(s.L.depth[0]) - l0), ds = Math.abs(total(s.L.depth[1]) - s0);
  report('(a) water mass 10k ticks', dw < 1e-4, `|Δ| ${dw.toExponential(2)} (< 1e-4, total ${w0.toFixed(1)})`);
  report('(a) lava mass 10k ticks', dl < 1e-3, `|Δ| ${dl.toExponential(2)} (< 1e-3, total ${l0.toFixed(1)})`);
  report('(a) sand mass 10k ticks', ds < 1e-3, `|Δ| ${ds.toExponential(2)} (< 1e-3, total ${s0.toFixed(1)})`);
}

// (b) symmetry — mirrored terrain and blobs; 2k ticks
{
  const s = makeWorld(), W = s.g.width, H = s.g.height;
  for (let y = 0; y < H; y++) for (let x = 0; x < W / 2; x++) s.g.h[y * W + (W - 1 - x)] = s.g.h[y * W + x];
  fill(s, -1, 4, 10, 59, 20, 0.3); fill(s, 0, 20, 30, 43, 40, 0.6); fill(s, 1, 10, 60, 53, 70, 1.0);
  for (let k = 0; k < 2000; k++) tick(s, false, false);
  const asym = a => { let m = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W / 2; x++) m = Math.max(m, Math.abs(a[y * W + x] - a[y * W + W - 1 - x])); return m; };
  const aw = asym(s.g.w), al = asym(s.L.depth[0]), as = asym(s.L.depth[1]);
  report('(b) water symmetry', aw < 1e-6, `max ${aw.toExponential(2)} (< 1e-6)`);
  report('(b) lava symmetry', al < 1e-4, `max ${al.toExponential(2)} (< 1e-4)`);
  report('(b) sand symmetry', as < 1e-4, `max ${as.toExponential(2)} (< 1e-4)`);
}

// (c) determinism — same seed, same hash; reactions on, real step (inflow, sinks)
{
  const run = seed => {
    const s = makeWorld(), rng = createRng(seedState(seed, 3)); // salt 3: a `material` stream (§2-3)
    for (let b = 0; b < 12; b++) {
      const x = rng.int(56), y = rng.int(88), k = rng.int(3) - 1;
      fill(s, k, x, y, x + 6, y + 6, 0.2 + rng.next() * 0.6);
    }
    for (let k = 0; k < 3000; k++) tick(s, true, true);
    return hashArrays(s.g.w, s.g.h, s.L.depth[0], s.L.depth[1], s.L.energy);
  };
  const a = run(7), b = run(7), c = run(8);
  report('(c) determinism', a === b && a !== c, `seed 7: ${a.toString(16)} / ${b.toString(16)}, seed 8: ${c.toString(16)}`);
}

// (d) robustness — random terrain, sources of all three, reactions on
{
  const s = makeWorld(), rng = createRng(seedState(42, 3)), n = s.g.h.length;
  for (let i = 0; i < n; i++) s.g.h[i] += (rng.next() - 0.5) * 0.6;
  const src = Array.from({ length: 6 }, () => [rng.int(60), rng.int(92), rng.int(3) - 1]);
  let bad = '';
  for (let k = 0; k < LONG && !bad; k++) {
    if (k % 30 === 0) for (const [x, y, m] of src) fill(s, m, x, y, x + 2, y + 2, 0.05);
    tick(s, false, true);
    if (k % 1000 === 999) for (const a of [s.g.w, s.L.depth[0], s.L.depth[1], s.L.energy, s.g.h])
      for (let i = 0; i < n; i++) if (!(a[i] >= 0) && a !== s.g.h || Number.isNaN(a[i])) { bad = `tick ${k} cell ${i} = ${a[i]}`; break; }
  }
  report(`(d) ${LONG} ticks, no NaN / negative`, !bad, bad || `lost: water ${s.L.lost.water.toFixed(1)}, lava→terrain ${s.L.lost.lava.toFixed(1)}`);
}

// (e) timing in Chromium (same method as scripts/bench-sim-browser.mjs)
if (!args.includes('--skip-bench')) {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const out = await build({ entryPoints: ['prototypes/material-layers/scenario.mjs'], bundle: true, write: false, format: 'iife', globalName: 'M0', target: 'es2020' });
  const browser = await chromium.launch();
  try {
    for (const rate of [1, 4]) {
      const page = await browser.newPage();
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate });
      await page.setContent('<!doctype html><title>m0</title>');
      await page.addScriptTag({ content: out.outputFiles[0].text });
      for (const traced of [false, true]) {
        const base = await page.evaluate(([t]) => globalThis.M0.runBench(2000, t, false), [traced]);
        const lay = await page.evaluate(([t]) => globalThis.M0.runBench(2000, t, true), [traced]);
        const label = `${rate}x${traced ? ' traced' : ''}`;
        console.log(`      ${label.padEnd(10)} water only ${JSON.stringify(base)}`);
        console.log(`      ${label.padEnd(10)} + lava/sand ${JSON.stringify(lay)}  (+${(lay.mean - base.mean).toFixed(3)} ms)`);
        if (rate === 4) report(`(e) 4× ${traced ? 'traced ' : ''}mean < 2.0 ms`, lay.mean < 2.0, `${lay.mean} ms (water only ${base.mean})`);
      }
      await page.close();
    }
  } finally { await browser.close(); }
}
console.log(fails ? `\n${fails} check(s) failed` : '\nall checks passed');
process.exit(fails ? 1 : 0);
