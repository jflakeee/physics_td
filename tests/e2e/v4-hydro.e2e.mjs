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
    check('no build menu: the bottom bar holds only 시작', (await page.locator('.bar > button').count()) === 1 && (await page.locator('.bar .go').count()) === 1 && (await page.locator('.build, .tray').count()) === 0);
    const hudNums = (await page.locator('.top').innerText()).match(/\d+/g) ?? [];
    check('top bar shows only level and coins as numbers', hudNums.length === 2, JSON.stringify(hudNums));
    await page.screenshot({ path: `${OUT}/v4-spring-${name}-${DATE}.png` });
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
    // tap a circle on the river: it builds a wheel (each spot has one building)
    const target = await page.evaluate(() => {
      const v = __v4, cv = document.querySelector('canvas.art'), r = cv.getBoundingClientRect();
      for (const [y, id] of [[10, 0], [27, 1], [40, 2], [60, 3], [72, 4], [86, 5]]) if (!v.w.built[id]) {
        const x = 30 + 9 * Math.sin(y / 15);
        return [r.left + ((Math.round(x) + 0.5) / 64) * r.width, r.top + ((y + 0.5) / 96) * r.height];
      }
      return null;
    });
    check('a free river spot exists', !!target);
    await page.waitForTimeout(300); // let the star settle
    await page.screenshot({ path: `${OUT}/v4-pick-site-${name}-${DATE}.png` });
    await page.mouse.click(target[0], target[1]);
    check('tapping a circle builds a wheel', await page.evaluate(() => __v4.w.plants.length === 2));
    check('a spot you cannot pay for does not build', await page.evaluate(() => { const v = __v4; const before = v.w.built.filter(Boolean).length; v.w.coins = 0; const r = v.placeBuilding(v.w, 6); return !r && v.w.built.filter(Boolean).length === before; }));
    await page.evaluate(() => { __v4.w.coins = 80; });
    // start and run to the first level-up
    const before = await page.locator('canvas.art').boundingBox();
    await page.locator('.bar .go').tap();
    await page.waitForFunction(() => __v4.w.phase === 'run');
    await page.waitForTimeout(150);
    check('after start the bottom bar is gone and the board grows', (await page.locator('.bar').count()) === 0 && (await page.locator('canvas.art').boundingBox()).height >= before.height);
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
    // seasons: the ground changes colour from spring to summer
    const grass = () => page.evaluate(() => { const c = document.querySelector('canvas.art'), d = c.getContext('2d').getImageData(0, 0, 192, 288).data; let r = 0, g = 0, n = 0; for (let y = 60; y < 120; y++) for (let x = 150; x < 190; x++) { const o = (y * 192 + x) * 4; r += d[o]; g += d[o + 1]; n++; } return [r / n, g / n]; });
    const spring = await grass();
    await page.evaluate(() => { const v = __v4; while (v.w.phase !== 'won' && v.w.phase !== 'lost' && v.w.tick < 30 * 135) { if (v.w.phase === 'levelup') v.chooseCard(v.w, v.w.cards[0]); v.tick(v.w); } v.w.hearts = 3; });
    await page.waitForTimeout(200);
    const summer = await grass();
    check('summer grass is darker than spring grass', summer[1] < spring[1] - 10, JSON.stringify({ spring, summer }));
    await page.screenshot({ path: `${OUT}/v4-summer-${name}-${DATE}.png` });
    await page.close();
  }
  // play feedback: water must stay visible — rapids under the wheels, and a flood in the village
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 664 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await page.goto(BASE + '&play');
    await page.waitForSelector('#app.play canvas.art');
    await page.evaluate(() => { const v = __v4; v.w.coins = 1e6; for (const s of [0, 2, 3, 4]) v.placeBuilding(v.w, s, 'wheel'); v.start(v.w); for (let k = 0; k < 30 * 20; k++) { if (v.w.phase === 'levelup') v.chooseCard(v.w, v.w.cards[0]); v.tick(v.w); } });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/v4-rapids-${DATE}.png` });
    const flooded = await page.evaluate(() => { const v = __v4; for (let k = 0; k < 30 * 240 && v.w.floodCooldown === 0 && v.w.phase !== 'won' && v.w.phase !== 'lost'; k++) { if (v.w.phase === 'levelup') v.chooseCard(v.w, v.w.cards[0]); v.tick(v.w); } return v.w.floodCooldown > 0 && v.w.floodFrom >= 0; });
    check('a wheels-only game floods the village and marks where the water came in', flooded);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/v4-village-flood-${DATE}.png` });
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
