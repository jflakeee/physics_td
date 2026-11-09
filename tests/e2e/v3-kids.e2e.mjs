// V3 kids prototype e2e (docs/REDESIGN_V3_KIDS.md §7, §11): big buttons, one-direction board,
// a dragged wall, a full wave. Screenshots go to production/qa/evidence/.
// Usage: node tests/e2e/v3-kids.e2e.mjs   (after npm run build; exit code 1 on any failed check)
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = pathToFileURL(resolve('dist/v3/index.html')).href + '?dev=1';
const OUT = 'production/qa/evidence';
const DATE = '2026-11-09';
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) failed++; };
const fits = page => page.evaluate(() => {
  const bad = [];
  if (document.documentElement.scrollWidth > innerWidth + 1) bad.push('page scrolls sideways');
  for (const e of document.querySelectorAll('button')) {
    const r = e.getBoundingClientRect();
    if (!r.width) continue;
    if (r.right > innerWidth + 1 || r.left < -1 || r.bottom > innerHeight + 1) bad.push(`off-screen ${e.className}`);
  }
  return [bad.length === 0, bad.join('; ')];
});

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  for (const [name, vp] of [['iphone-se', { width: 320, height: 568 }], ['iphone-13', { width: 390, height: 664 }]]) {
    console.log(`\n# ${name}`);
    const page = await browser.newPage({ viewport: vp, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await page.goto(BASE);
    await page.waitForSelector('#app.title');
    check('title shows two characters', (await page.locator('.char').count()) === 2);
    check('title fits', ...await fits(page));
    await page.screenshot({ path: `${OUT}/v3-title-${name}-${DATE}.png` });
    await page.locator('.char').first().tap();
    await page.waitForSelector('#app.play canvas');
    check('play has exactly 3 skill buttons + pause', (await page.locator('.bar .sk').count()) === 3 && (await page.locator('button.pause').count()) === 1);
    const sizes = await page.locator('.bar .sk').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().width)));
    check('skill buttons ≥ 72px', sizes.every(s => s >= 72), JSON.stringify(sizes));
    check('no numbers in the play HUD', !/\d/.test(await page.locator('.top').innerText()));
    check('play fits', ...await fits(page));
    // drag a wall across the board above the fence
    await page.locator('.bar .sk').first().tap();
    const box = await page.locator('canvas').boundingBox();
    const at = (gx, gy) => [box.x + (gx / 64) * box.width, box.y + (gy / 96) * box.height];
    await page.mouse.move(...at(10, 60));
    await page.mouse.down();
    for (let x = 12; x <= 30; x += 2) await page.mouse.move(...at(x, 62));
    await page.mouse.up();
    const walls = await page.evaluate(() => { const w = __v3.w; let n = 0; for (let i = 0; i < w.kind.length; i++) if (w.kind[i] === 2) n++; return n; });
    check('dragging builds a wall', walls >= 10, `${walls} cells`);
    // the HUD applies the cooldown on the next animation frame
    const cooling = await page.waitForFunction(() => document.querySelector('.bar .sk')?.classList.contains('cool'), null, { timeout: 2000 }).then(() => true, () => false);
    check('wall button is cooling down', cooling);
    await page.screenshot({ path: `${OUT}/v3-ready-wall-${name}-${DATE}.png` });
    await page.locator('.center .big').tap(); // start
    await page.waitForFunction(() => __v3.w.phase === 'wave');
    // fast-forward most of wave 1 in the page's own sim
    await page.evaluate(() => { const v = __v3; for (let k = 0; k < 600; k++) v.tick(v.w); });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/v3-wave-${name}-${DATE}.png` });
    await page.evaluate(() => { const v = __v3; while (v.w.phase === 'wave') v.tick(v.w); });
    await page.waitForSelector('.center.pick .card');
    check('between waves: upgrade cards', (await page.locator('.center.pick .card').count()) === 2);
    await page.screenshot({ path: `${OUT}/v3-pick-${name}-${DATE}.png` });
    await page.close();
  }
  // defeat screen explains where the water came in
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 664 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await page.goto(BASE + '&char=mole');
    await page.waitForSelector('#app.play canvas');
    await page.evaluate(() => { const v = __v3; v.startWave(v.w); for (let n = 0; n < 1e5 && v.w.phase !== 'lost' && v.w.phase !== 'won'; n++) { if (v.w.phase === 'pick') v.w.phase = 'ready', v.startWave(v.w); v.tick(v.w); } });
    await page.waitForSelector('.center.lost');
    check('doing nothing loses, with breach markers', await page.evaluate(() => __v3.w.breaches.length > 0));
    await page.screenshot({ path: `${OUT}/v3-lost-${DATE}.png` });
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
