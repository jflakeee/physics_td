// Story 002 e2e (DETAILED_DESIGN_V2 §20 E2E-01): iPhone SE / iPhone 13 / landscape.
// Builds dist/v2 first (npm run build). Saves screenshots to production/qa/evidence/.
// Usage: node tests/e2e/mobile.e2e.mjs   (exit code 1 on any failed check)
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright'); // may be a global install
const URL = pathToFileURL(resolve('dist/v2/index.html')).href + '?dev=1&kit=all';
const OUT = 'production/qa/evidence';
const DATE = '2026-11-08';
const VIEWPORTS = [
  ['iphone-se', { width: 320, height: 568 }],
  ['iphone-13', { width: 390, height: 664 }],
  ['landscape', { width: 750, height: 342 }],
];
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) failed++; };

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  for (const [name, viewport] of VIEWPORTS) {
    console.log(`\n# ${name} ${viewport.width}×${viewport.height}`);
    const page = await browser.newPage({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(URL);
    await page.waitForFunction(() => globalThis.__ptd);
    const shot = async step => page.screenshot({ path: `${OUT}/story-002-${name}-${step}-${DATE}.png` });
    const S = fn => page.evaluate(fn);

    // layout: no document scroll, touch targets
    const m = await S(() => ({ sh: document.documentElement.scrollHeight, sw: document.documentElement.scrollWidth, ih: innerHeight, iw: innerWidth }));
    check('no document scroll', m.sh <= m.ih && m.sw <= m.iw, JSON.stringify(m));
    const sizes = await S(() => [...document.querySelectorAll('button')].filter(b => !b.hidden && b.offsetParent).map(b => {
      const r = b.getBoundingClientRect();
      return { cls: b.className, w: r.width, h: r.height, inView: r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5 && r.left >= -0.5 && r.top >= -0.5 };
    }));
    check('all buttons ≥ 48px and on screen', sizes.every(s => s.w >= 48 && s.h >= 48 && s.inView), JSON.stringify(sizes.filter(s => !(s.w >= 48 && s.h >= 48 && s.inView))));
    check('active skill buttons ≥ 56px', sizes.filter(s => /\bsk\b/.test(s.cls) && !/common/.test(s.cls)).every(s => s.w >= 56 && s.h >= 56));
    await shot('1-prepare');

    // geometry helpers: centre of a zone / a pump in client px
    const box = await page.locator('canvas.board').boundingBox();
    const cellPx = box.width / 64;
    const at = (cx, cy) => [box.x + (cx + 0.5) * cellPx, box.y + (cy + 0.5) * cellPx];
    const zones = await S(() => __ptd.zones.map(z => ({ id: z.id, type: z.type, c: z.center, tiles: z.tiles })));
    const plain = zones.find(z => z.type === 'plain' && z.tiles.length >= 3);
    const base = zones.find(z => z.type === 'base');
    const tile = (z) => z.tiles[0];
    const tileCentre = (z) => at(tile(z)[0] * 8 + 4, tile(z)[1] * 8 + 4);

    // zone tap → highlight; on a plain zone with levee lines it also builds a levee ($20)
    const leveeZone = await S(() => { const r = __ptd.play.rules; return __ptd.zones.find(z => r.map.leveeLines[z.id - 1].length > 0).id; });
    const lz = zones.find(z => z.id === leveeZone);
    await page.touchscreen.tap(...tileCentre(lz));
    const hl = await S(() => __ptd.target());
    check('zone tap highlights the zone', hl.mode === 'idle' && hl.highlight === lz.id, JSON.stringify(hl));
    check('zone tap builds a levee (basic skill)', await S(() => __ptd.play.world.cash === 130 && __ptd.play.world.grid.wall.some(v => v > 0)));
    await shot('2-zone-highlight');

    // skill button → targeting with dimmed zones; tap base (invalid) cancels
    await page.locator('[data-skill="freeze"]').tap();
    check('skill tap enters target selection', (await S(() => __ptd.target())).mode === 'selecting');
    await shot('3-targeting');
    await page.touchscreen.tap(...tileCentre(base));
    check('tap on an invalid target cancels', (await S(() => __ptd.target())).mode === 'idle');
    await page.locator('[data-skill="freeze"]').tap();
    await page.touchscreen.tap(...tileCentre(plain));
    check('tap on a valid zone uses the skill', (await S(() => __ptd.target())).mode === 'idle' &&
      (await page.locator('.toast').allTextContents()).some(t => t.includes('긴급 결빙')));

    // ultimate: tap only hints, long press fires
    const ult = page.locator('[data-skill="night-repair"]');
    await ult.tap();
    check('ultimate tap asks for a long press', (await page.locator('.toast').allTextContents()).some(t => t.includes('길게')));
    const ub = await ult.boundingBox();
    await page.mouse.move(ub.x + ub.width / 2, ub.y + ub.height / 2);
    await page.mouse.down(); await page.waitForTimeout(600); await page.mouse.up();
    check('ultimate with an empty gauge is refused', (await page.locator('.toast').allTextContents()).some(t => t.includes('게이지')));
    await S(() => { __ptd.play.rules.gauge = 100; });
    await page.mouse.move(ub.x + ub.width / 2, ub.y + ub.height / 2);
    await page.mouse.down(); await page.waitForTimeout(600); await page.mouse.up();
    check('ultimate long press fires', (await page.locator('.toast').allTextContents()).some(t => t.includes('철야 보강 사용')));

    // pump tap toggles
    const pump = await S(() => { const p = __ptd.play.world.pumps[0]; return [p.cell % 64, Math.floor(p.cell / 64)]; });
    await page.touchscreen.tap(...at(pump[0], pump[1]));
    check('pump tap turns it on', await S(() => __ptd.play.world.pumps[0].on));
    await page.touchscreen.tap(...at(pump[0], pump[1]));
    check('pump tap again turns it off', !(await S(() => __ptd.play.world.pumps[0].on)));
    await page.touchscreen.tap(...at(pump[0], pump[1]));

    // start wave, speed, pause, auto-pause on hide
    await page.locator('button.start').tap();
    check('start button starts the wave', (await S(() => __ptd.play.phase)) === 'wave');
    await page.waitForTimeout(1500);
    await shot('4-wave');
    const speed = page.locator('.hbtns button').nth(2);
    await speed.tap();
    check('speed toggles to 2×', (await S(() => __ptd.play.speed)) === 2 && (await speed.textContent()) === '2×');
    const pause = page.locator('.hbtns button').nth(1);
    await pause.tap();
    const t0 = await S(() => __ptd.play.world.tick);
    await page.waitForTimeout(400);
    check('pause stops the sim', (await S(() => __ptd.play.world.tick)) === t0 && (await S(() => __ptd.play.paused)));
    await pause.tap();
    await page.waitForTimeout(300);
    check('resume continues the sim', (await S(() => __ptd.play.world.tick)) > t0);
    await S(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    check('hidden page auto-pauses', await S(() => __ptd.play.paused));
    await S(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); });
    await pause.tap();

    // render frame budget
    await S(() => { __ptd.frames.length = 0; });
    await page.waitForTimeout(3000);
    const fr = await S(() => { const a = [...__ptd.frames].sort((x, y) => x - y); return { n: a.length, mean: a.reduce((s, v) => s + v, 0) / a.length, p95: a[Math.floor(a.length * 0.95)] }; });
    check('render frame < 6 ms (mean)', fr.mean < 6, `n=${fr.n} mean=${fr.mean.toFixed(2)} p95=${fr.p95.toFixed(2)}`);
    check('no page errors', errors.length === 0, errors.join(' | '));
    await page.close();
  }
  // story 003: regional skill presentation and the second character
  console.log('\n# variants (iPhone 13)');
  for (const [step, q, sel, label] of [
    ['glacier', '&region=glacier', '[data-skill="build-levee"]', '얼음 둑'],
    ['wetland-researcher', '&char=wetland-researcher', '[data-skill="open-floodplain"]', '범람원 개방'],
  ]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 664 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await page.goto(URL + q);
    await page.waitForFunction(() => globalThis.__ptd);
    check(`${step}: skill bar shows ${label}`, (await page.locator(sel).getAttribute('aria-label')) === label);
    await page.screenshot({ path: `${OUT}/story-003-${step}-${DATE}.png` });
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
