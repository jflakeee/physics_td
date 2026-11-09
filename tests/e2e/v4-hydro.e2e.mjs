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
    check('main menu: start + characters, skills, items, records', (await page.locator('.mainnav .big').count()) === 1 && (await page.locator('.subnav .sub').count()) === 4);
    check('main menu fits', ...await fits(page));
    await page.screenshot({ path: `${OUT}/v4-title-${name}-${DATE}.png` });
    await page.locator('.mainnav .big').tap();
    await page.waitForSelector('#app.menu .mrow');
    check('stage select: stage 1 open, stages 2–3 locked', (await page.locator('.mrow:not(.locked)').count()) === 1 && (await page.locator('.mrow.locked').count()) === 2);
    await page.screenshot({ path: `${OUT}/v4-stages-${name}-${DATE}.png` });
    await page.locator('.mrow').first().tap();
    await page.waitForSelector('#app.menu .mrow');
    check('character select: the miller is open, two are locked', (await page.locator('.mrow.locked').count()) === 2);
    await page.locator('.mrow').first().tap();
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
  // 계속하기: pause → 메인으로 keeps the run; the main menu continues it where it stopped
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 664 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await page.goto(BASE + '&play');
    await page.waitForSelector('#app.play canvas.art');
    await page.evaluate(() => { const v = __v4; v.start(v.w); for (let k = 0; k < 30 * 20; k++) { if (v.w.phase === 'levelup') v.chooseCard(v.w, v.w.cards[0]); v.tick(v.w); } });
    const t0 = await page.evaluate(() => __v4.w.tick);
    await page.locator('button.pause').tap();
    await page.locator('.center.pause .big.alt').last().tap();
    await page.waitForSelector('#app.title .cont');
    check('main menu offers 계속하기 after leaving a run', (await page.locator('.cont').innerText()).includes('계속하기'));
    await page.screenshot({ path: `${OUT}/v4-continue-${DATE}.png` });
    await page.locator('.cont').tap();
    await page.waitForSelector('#app.play canvas.art');
    const t1 = await page.evaluate(() => __v4.w.tick);
    check('계속하기 resumes the same run', t1 >= t0 && t1 - t0 < 60, `${t0} → ${t1}`);
    // win: bonus skill + next stage + back to the main menu with the unlocks
    await page.evaluate(() => { const v = __v4; v.w.phase = 'run'; v.w.tick = v.w.totalSec * 30 - 1; v.w.hearts = 3; v.tick(v.w); });
    await page.waitForSelector('.center.won');
    check('a clear shows the bonus skill and the new character', (await page.locator('.center.won .card.bonus').count()) === 2);
    const labels = await page.locator('.center.won .big').allInnerTexts();
    check('a clear offers 계속하기, 다음 스테이지 and 메인으로', labels.length === 3 && labels[0].includes('계속하기') && labels[1].includes('다음 스테이지') && labels[2].includes('메인으로'), JSON.stringify(labels));
    const boxes = await page.locator('.center.won .big').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, a: r.width * r.height }; }));
    check('다음 스테이지 is in the middle and the biggest', boxes[0].x < boxes[1].x && boxes[1].x < boxes[2].x && boxes[1].a > boxes[0].a && boxes[1].a > boxes[2].a, JSON.stringify(boxes));
    check('all three fit on screen', await page.evaluate(() => [...document.querySelectorAll('.center.won .big')].every(b => { const r = b.getBoundingClientRect(); return r.bottom <= innerHeight && r.right <= innerWidth && r.height >= 48; })));
    await page.screenshot({ path: `${OUT}/v4-clear-${DATE}.png` });
    await page.locator('.center.won .big', { hasText: '계속하기' }).tap();
    await page.waitForFunction(() => __v4.w.phase === 'run');
    check('계속하기 goes on into the next season', await page.evaluate(() => __v4.w.endless && __v4.w.seasons.at(-1).name === '가을'));
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/v4-endless-${DATE}.png` });
    // end the endless run to get back to the result screen, then take 다음 스테이지
    await page.evaluate(() => { const v = __v4; v.w.hearts = 0; v.tick(v.w); });
    await page.waitForSelector('.center.lost');
    await page.locator('.center.lost .big', { hasText: '다음 스테이지' }).tap();
    await page.waitForFunction(() => globalThis.__v4?.w.stage === 1);
    check('다음 스테이지 starts stage 2', await page.evaluate(() => __v4.w.seasons.map(s => s.name).join() === '여름,가을'));
    await page.locator('button.pause').tap();
    await page.locator('.center.pause .big.alt').last().tap();
    await page.waitForSelector('#app.title');
    await page.locator('.subnav .sub').nth(3).tap();
    await page.waitForSelector('table.stats');
    check('records count the win', (await page.locator('table.stats').innerText()).includes('버틴 판\t1'));
    await page.screenshot({ path: `${OUT}/v4-records-${DATE}.png` });
    await page.locator('.mhead .back').tap();
    await page.locator('.subnav .sub').nth(1).tap();
    await page.waitForSelector('.mrow');
    check('skills: the rain spirit is unlocked, the sun spirit still locked', (await page.locator('.mrow.locked').count()) === 1);
    await page.screenshot({ path: `${OUT}/v4-skills-${DATE}.png` });
    await page.locator('.mhead .back').tap();
    await page.locator('.subnav .sub').nth(2).tap();
    await page.waitForSelector('.mrow');
    const gems0 = Number(await page.locator('.mhead .gems b').innerText());
    await page.locator('.mrow.buyable').first().tap();
    await page.waitForTimeout(100);
    const gems1 = Number(await page.locator('.mhead .gems b').innerText());
    check('items: buying a power-up spends gems', gems1 < gems0, `${gems0} → ${gems1}`);
    check('menu screens fit', ...await fits(page));
    await page.screenshot({ path: `${OUT}/v4-items-${DATE}.png` });
    await page.close();
  }
  // one map per stage, turning wheels, disasters
  for (const [stage, sec, shot, want] of [[1, 47, 'jam', 'jam'], [2, 180, 'slide', 'slide'], [1, 215, 'storm', 'storm'], [3, 150, 'winter', 'freeze']]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 664 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await page.goto(BASE + `&play&stage=${stage}`);
    await page.waitForSelector('#app.play canvas.art');
    const info = await page.evaluate(([sec]) => {
      const v = __v4; v.w.hearts = 99; v.w.coins = 1e6;
      for (const s of v.w.map.sites) if (s.build === 'wheel' && !v.w.built[s.id]) v.placeBuilding(v.w, s.id);
      v.start(v.w);
      const seen = new Set();
      while (v.w.tick < sec * 30) { if (v.w.phase === 'levelup') v.chooseCard(v.w, v.w.cards[0]); v.tick(v.w); if (v.w.events.disaster) seen.add(v.w.events.disaster.kind); }
      const spin0 = v.w.plants.map(p => p.spin);
      for (let k = 0; k < 15; k++) v.tick(v.w);
      return { map: v.w.map.id, seen: [...seen], turning: v.w.plants.filter((p, i) => p.spin > spin0[i]).length, wheels: v.w.plants.length };
    }, [sec]);
    await page.waitForTimeout(250);
    if (want === 'jam') check('stage 1: an ice jam forms on the river', info.seen.includes('jam'), JSON.stringify(info));
    if (want === 'slide') check('stage 2 plays on its own map and has a landslide', info.map === 'valley-2' && info.seen.includes('slide'), JSON.stringify(info));
    if (want === 'storm') check('wheels turn while they make power', info.turning >= 4, JSON.stringify(info));
    if (want === 'freeze') check('stage 3 plays on its own map', info.map === 'valley-3', JSON.stringify(info));
    await page.screenshot({ path: `${OUT}/v4-${shot}-${DATE}.png` });
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
