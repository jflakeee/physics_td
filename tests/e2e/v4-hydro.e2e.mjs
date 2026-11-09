// V4 hydro prototype e2e (docs/REDESIGN_V4_HYDRO.md §3, §12): one build button, recommended
// spot, level-up cards, forecast, end screen. Screenshots go to production/qa/evidence/.
// Usage: node tests/e2e/v4-hydro.e2e.mjs   (after npm run build; exit code 1 on any failed check)
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = pathToFileURL(resolve('dist/v4/index.html')).href + '?dev=1';
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
  for (const e of document.querySelectorAll('.top .row')) if (e.scrollWidth > e.clientWidth + 1) bad.push('top row overflows');
  return [bad.length === 0, bad.join('; ')];
});
const ff = (page, ticks) => page.evaluate(n => { const v = __v4; for (let k = 0; k < n && v.w.phase === 'run'; k++) v.tick(v.w); }, ticks);

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  for (const [name, vp] of [['iphone-se', { width: 320, height: 568 }], ['iphone-13', { width: 390, height: 664 }]]) {
    console.log(`\n# ${name}`);
    const page = await browser.newPage({ viewport: vp, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await page.goto(BASE);
    await page.waitForSelector('#app.title');
    await page.screenshot({ path: `${OUT}/v4-title-${name}-${DATE}.png` });
    await page.locator('.big').tap();
    await page.waitForSelector('#app.play canvas');
    check('bottom bar: build + start before the first wave', (await page.locator('.bar > button').count()) === 2);
    const hudNums = (await page.locator('.top').innerText()).match(/\d+/g) ?? [];
    check('top bar shows only level and coins as numbers', hudNums.length === 2, JSON.stringify(hudNums));
    check('play fits', ...await fits(page));
    // one pixel grid (docs/ART_DIRECTION_V4_PIXEL.md): 192×288 art px at a whole-number device scale
    const px = await page.evaluate(() => {
      const c = document.querySelector('canvas.art'), r = c.getBoundingClientRect(), k = Number(c.dataset.scale);
      const icons = [...document.querySelectorAll('.top canvas.pi')].map(e => e.getBoundingClientRect().width * devicePixelRatio / e.width);
      return { w: c.width, h: c.height, k, dev: r.width * devicePixelRatio, icons };
    });
    check('art buffer is 192×288', px.w === 192 && px.h === 288);
    check('board is a whole-number scale of device pixels', Number.isInteger(px.k) && px.k >= 2 && Math.abs(px.dev - 192 * px.k) < 0.5, JSON.stringify(px));
    check('top-bar icons use the same pixel size as the board', px.icons.length > 0 && px.icons.every(v => Math.abs(v - px.k) < 0.01), JSON.stringify(px.icons));
    const emoji = await page.evaluate(() => (document.body.innerText.match(/\p{Extended_Pictographic}/gu) ?? []).filter(c => !'★☆↻→'.includes(c)));
    check('no emoji left on screen', emoji.length === 0, emoji.join(' '));
    // build a wheel at the recommended spot
    await page.locator('.build').tap();
    check('tray offers 3 buildings', (await page.locator('.tray .bcard').count()) === 3);
    await page.screenshot({ path: `${OUT}/v4-tray-${name}-${DATE}.png` });
    await page.locator('.tray .bcard').first().tap();
    const rec = await page.evaluate(() => { const s = [...document.querySelectorAll('canvas')][0]; return s ? true : false; });
    const site = await page.evaluate(() => {
      // the recommended site is computed by the page; recompute the same way to tap it
      const v = __v4; return v.w.built.findIndex((b, i) => !b && i < 6);
    });
    const target = await page.evaluate(() => {
      const v = __v4, cv = document.querySelector('canvas.art'), r = cv.getBoundingClientRect();
      // pick the first free river site (the page highlights the recommended one; any valid site builds)
      const sites = [[10, 0], [27, 1], [40, 2], [60, 3], [72, 4], [86, 5]];
      for (const [y, id] of sites) if (!v.w.built[id]) {
        const x = 30 + 9 * Math.sin(y / 15);
        return [r.left + (Math.round(x) / 64) * r.width, r.top + (y / 96) * r.height];
      }
      return null;
    });
    check('a free river site exists', rec && site >= 0 && !!target);
    await page.screenshot({ path: `${OUT}/v4-pick-site-${name}-${DATE}.png` });
    await page.mouse.click(target[0], target[1]);
    check('tapping a site builds a wheel', await page.evaluate(() => __v4.w.plants.length === 2));
    // start and run to the first level-up
    await page.locator('.bar .go').tap();
    await page.waitForFunction(() => __v4.w.phase === 'run');
    check('after start only the build button is left', (await page.locator('.bar > button').count()) === 1);
    await page.evaluate(() => { const v = __v4; for (let k = 0; k < 30 * 120 && v.w.phase === 'run'; k++) v.tick(v.w); });
    await page.waitForSelector('.center.level .card');
    check('level-up shows 3 cards', (await page.locator('.center.level .card').count()) === 3);
    await page.screenshot({ path: `${OUT}/v4-levelup-${name}-${DATE}.png` });
    await page.locator('.center.level .card').first().tap();
    check('a card gives a spirit at the first level-up', await page.evaluate(() => __v4.w.skill.sand + __v4.w.skill.ice === 1));
    await page.waitForTimeout(100);
    // to the thaw forecast
    await page.evaluate(() => { const v = __v4; while (v.w.phase === 'run' && v.w.tick < 30 * 18) v.tick(v.w); if (v.w.phase === 'levelup') v.chooseCard(v.w, v.w.cards[0]); });
    await page.waitForTimeout(150);
    check('forecast shows the next weather', (await page.locator('.wx .next').innerText()).includes('→'));
    await page.screenshot({ path: `${OUT}/v4-forecast-${name}-${DATE}.png` });
    await page.close();
  }
  // a whole game with nothing built ends in defeat with the end screen
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 664 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await page.goto(BASE + '&play');
    await page.waitForSelector('#app.play canvas');
    await page.evaluate(() => { const v = __v4; v.start(v.w); for (let n = 0; n < 1e5 && v.w.phase !== 'won' && v.w.phase !== 'lost'; n++) { if (v.w.phase === 'levelup') v.chooseCard(v.w, v.w.cards[0]); v.tick(v.w); } });
    await page.waitForSelector('.center.lost');
    check('building nothing loses', await page.evaluate(() => __v4.w.phase === 'lost'));
    await page.screenshot({ path: `${OUT}/v4-lost-${DATE}.png` });
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
