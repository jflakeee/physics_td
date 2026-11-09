// Sim step timing in headless Chromium at 1× and 4× CPU throttle (story 001 AC:
// < 1.0 ms desktop, < 2.0 ms at 4×). Bundles scripts/bench-core.mjs with esbuild.
// Usage: node scripts/bench-sim-browser.mjs [ticks=3000]
import { build } from 'esbuild';
import { createRequire } from 'node:module';

// playwright may be a global install (resolved via NODE_PATH), which ESM `import` ignores
const { chromium } = createRequire(import.meta.url)('playwright');

const N = +(process.argv[2] ?? 3000);
const out = await build({
  entryPoints: ['scripts/bench-core.mjs'], bundle: true, write: false, format: 'iife',
  globalName: 'Bench', target: 'es2020',
});
const code = out.outputFiles[0].text;
const browser = await chromium.launch();
try {
  for (const rate of [1, 4]) {
    const page = await browser.newPage();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    await page.setContent('<!doctype html><title>bench</title>');
    await page.addScriptTag({ content: code });
    for (const traced of [false, true]) {
      const r = await page.evaluate(([n, t]) => globalThis.Bench.runBench(n, t), [N, traced]);
      console.log(`chromium ${rate}x${traced ? ' traced' : '       '}`, r);
    }
    await page.close();
  }
} finally {
  await browser.close();
}
