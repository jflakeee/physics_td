// Story 002 e2e (DETAILED_DESIGN_V2 §20 E2E-01): iPhone SE / iPhone 13 / landscape.
// Builds dist/ first (npm run build). Saves screenshots to production/qa/evidence/.
// Usage: node tests/e2e/mobile.e2e.mjs   (exit code 1 on any failed check)
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright'); // may be a global install
const BASE = pathToFileURL(resolve('dist/index.html')).href + '?dev=1';
const URL = BASE + '&kit=all&map=dike-village&tutorial=0';
const OUT = 'production/qa/evidence';
const DATE = '2026-11-08';
const VIEWPORTS = [
  ['iphone-se', { width: 320, height: 568 }],
  ['iphone-13', { width: 390, height: 664 }],
  ['landscape', { width: 750, height: 342 }],
];
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) failed++; };
/** DETAILED §15.6: at 120% text nothing scrolls sideways and no button clips its label. Returns [ok, detail]. */
const fitsAt120 = page => page.evaluate(() => {
  const bad = [];
  if (document.documentElement.scrollWidth > innerWidth + 1) bad.push(`page ${document.documentElement.scrollWidth}>${innerWidth}`);
  for (const e of document.querySelectorAll('#app button, #app a, #app .stats')) {
    const r = e.getBoundingClientRect();
    if (!r.width) continue;
    if (r.right > innerWidth + 1 || r.left < -1) bad.push(`off-screen ${e.className || e.tagName}`);
    if (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1) bad.push(`clipped ${e.className || e.tagName} "${e.textContent.trim().slice(0, 12)}"`);
  }
  return [bad.length === 0, bad.slice(0, 6).join('; ')];
});

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  for (const [name, viewport] of VIEWPORTS) {
    console.log(`\n# ${name} ${viewport.width}×${viewport.height}`);
    const page = await browser.newPage({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(URL);
    await page.waitForFunction(() => globalThis.__ptd?.play);
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
    const leveeZone = await S(() => { const r = __ptd.play.rules; return __ptd.zones.find(z => z.type === 'plain' && r.map.leveeLines[z.id - 1].length > 0).id; });
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
    if (name === 'iphone-13') {
      // B3: water around a running pump is tinted teal while it drains
      await S(() => { const w = __ptd.play.world, p = w.pumps[0]; p.on = true; const W = 64, cx = p.cell % W, cy = (p.cell / W) | 0;
        for (let y = cy - 6; y <= cy + 6; y++) for (let x = cx - 6; x <= cx + 6; x++) w.grid.w[y * W + x] = 0.25; });
      await page.waitForTimeout(120);
      await page.screenshot({ path: `${OUT}/b3-pump-tint-${DATE}.png` });
    }
    const speed = page.locator('.hbtns button').nth(2);
    await speed.tap();
    check('speed toggles to 2×', (await S(() => __ptd.play.speed)) === 2 && (await speed.textContent()) === '2×');
    await speed.tap();
    check('speed toggles to 0.5× (B2)', (await S(() => __ptd.play.speed)) === 0.5 && (await speed.textContent()) === '0.5×');
    await S(() => { const w = __ptd.play.world; for (const c of w.baseCore) w.grid.w[c] = 0.2; });
    await page.waitForTimeout(150);
    if (name === 'iphone-13') await page.screenshot({ path: `${OUT}/b1-villagers-alarmed-${DATE}.png` });
    await speed.tap(); await speed.tap();
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

    // level-up: pending badge in the wave, draft sheet after it (story 005)
    await S(() => { __ptd.play.world.metrics.drained += 1200; });
    await page.waitForTimeout(200);
    check('level-up waits as a badge during the wave', await page.locator('.lvbadge:not([hidden])').isVisible() && (await S(() => __ptd.play.phase)) === 'wave');
    await S(() => { __ptd.play.world.waveTick = __ptd.play.world.waveLen - 2; });
    await page.waitForSelector('.levelup:not([hidden])');
    check('draft opens after the wave with 3 cards', (await page.locator('.levelup .card').count()) === 3);
    check('B6: every skill card shows a map preview', (await page.locator('.levelup .card:not(.sub)').count()) === (await page.locator('.levelup .card .preview').count()));
    check('odds are published (ⓘ)', (await page.locator('.levelup .odds p').textContent()).includes('70'));
    const cardBtns = await page.locator('.levelup button, .levelup summary').evaluateAll(els => els.every(e => { const r = e.getBoundingClientRect(); return r.height >= 48 && r.width >= 48; }));
    check('draft targets ≥ 48px', cardBtns);
    await shot('6-levelup');
    const pend0 = await S(() => __ptd.play.score.pending);
    await page.locator('.levelup .reroll').tap();
    await page.waitForTimeout(150);
    check('reroll once per run', (await S(() => __ptd.play.draft.rerollsLeft)) === 0 && await page.locator('.levelup .reroll').isDisabled());
    await page.locator('.levelup .card').first().tap();
    check('picking a card consumes one pending level', (await S(() => __ptd.play.score.pending)) === pend0 - 1);
    while ((await S(() => __ptd.play.phase)) === 'levelup') await page.locator('.levelup .skip').tap();
    check('draft ends in prepare', (await S(() => __ptd.play.phase)) === 'prepare');
    await page.locator('button.start').tap();

    // render frame budget
    await S(() => { __ptd.frames.length = 0; });
    await page.waitForTimeout(3000);
    const fr = await S(() => { const a = [...__ptd.frames].sort((x, y) => x - y); return { n: a.length, mean: a.reduce((s, v) => s + v, 0) / a.length, p95: a[Math.floor(a.length * 0.95)] }; });
    check('render frame < 6 ms (mean)', fr.mean < 6, `n=${fr.n} mean=${fr.mean.toFixed(2)} p95=${fr.p95.toFixed(2)}`);
    // defeat → overlay → retry from the wave checkpoint
    const waveAtDefeat = await S(() => __ptd.play.world.wave);
    // flood the base for a moment so this wave records damage (and its cause), then end it
    await S(() => { const w = __ptd.play.world; for (const c of w.baseCore) w.grid.w[c] = 0.4; });
    await page.waitForTimeout(400);
    await S(() => { __ptd.play.world.hp = 0; });
    await page.waitForSelector('.overlay:not([hidden])');
    await shot('5-defeat');
    if (name === 'iphone-13') check('defeat shows the flood cause (§15.5)', (await page.locator('.causes .cause').count()) >= 1 && (await page.locator('.cause-hint').count()) === 1);
    await page.locator('.overlay button.primary').tap();
    check('retry returns to prepare of the same wave', (await S(() => __ptd.play.phase === 'prepare' && __ptd.play.world.hp > 0)) && (await S(() => __ptd.play.world.wave)) === waveAtDefeat - 1);
    check('no page errors', errors.length === 0, errors.join(' | '));
    await page.close();

    // map select on a first run: "여기부터" on 둑마을
    const ms = await browser.newPage({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await ms.goto(BASE + '&screen=maps');
    await ms.waitForSelector('.map-card');
    check('map select lists 4 maps', (await ms.locator('.map-card').count()) === 4);
    check('first run: 여기부터 badge on 둑마을', (await ms.locator('.map-card[data-map="dike-village"] .badge.here').count()) === 1 && (await ms.locator('.badge.here').count()) === 1);
    const cards = await ms.locator('.map-card, .chip').evaluateAll(els => els.every(e => { const r = e.getBoundingClientRect(); return r.height >= 48 && r.width >= 48; }));
    check('map select targets ≥ 48px', cards);
    await ms.screenshot({ path: `${OUT}/story-004-${name}-map-select-${DATE}.png` });
    await ms.close();
  }

  // tutorial on the first 둑마을 play (iPhone 13)
  console.log('\n# tutorial (iPhone 13)');
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 664 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto(BASE + '&screen=maps');
    await page.locator('.map-card[data-map="dike-village"]').tap();
    await page.waitForSelector('.bubble:not([hidden])');
    check('tutorial step 1 shows on the first play', (await page.locator('.bubble p').textContent()).includes('네 방향'));
    await page.screenshot({ path: `${OUT}/story-004-tutorial-1-${DATE}.png` });
    await page.locator('.bubble .bnext').tap();
    check('step 2 asks for a levee', (await page.locator('.bubble p').textContent()).includes('제방'));
    const z = await page.evaluate(() => { const r = __ptd.play.rules; const zz = __ptd.zones.find(z => z.type === 'plain' && r.map.leveeLines[z.id - 1].length > 0); return zz.tiles[0]; });
    const box = await page.locator('canvas.board').boundingBox();
    const px = box.width / 64;
    await page.touchscreen.tap(box.x + (z[0] * 8 + 4) * px, box.y + (z[1] * 8 + 4) * px);
    await page.waitForTimeout(100);
    check('levee advances to step 3 (hidden until the wave)', await page.evaluate(() => document.getElementById('app').dataset.tutorial === ''));
    await page.locator('button.start').tap();
    await page.waitForSelector('.bubble:not([hidden])');
    check('step 3 shows in W1 with speed locked', (await page.locator('.bubble p').textContent()).includes('막히는') && await page.locator('.hbtns button').nth(2).isDisabled());
    await page.screenshot({ path: `${OUT}/story-004-tutorial-3-${DATE}.png` });
    await page.reload();
    await page.locator('.map-card[data-map="dike-village"]').tap();
    await page.waitForTimeout(300);
    check('progress survives a reload (step kept)', await page.evaluate(() => document.getElementById('app').dataset.tutorial !== '1'));
    await page.locator('.bubble .bskip').tap().catch(() => {});
    await ctx.close();
  }
  // result screen, save + resume, storage failures (story 006, iPhone 13)
  console.log('\n# result & save (iPhone 13)');
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 664 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto(BASE + '&map=dike-village&tutorial=0&seed=3');
    await page.waitForFunction(() => globalThis.__ptd?.play);
    const S = fn => page.evaluate(fn);
    // play W1 quickly, then save happens at prepare entry
    await page.locator('button.start').tap();
    await S(() => { __ptd.play.world.waveTick = __ptd.play.world.waveLen - 2; });
    await page.waitForFunction(() => __ptd.play.phase !== 'wave');
    while ((await S(() => __ptd.play.phase)) === 'levelup') await page.locator('.levelup .skip').tap();
    await page.waitForTimeout(100);
    check('a run snapshot is saved at prepare entry', await S(() => !!__ptd.store.load().run && __ptd.store.load().run.wave === 1));
    await page.goto(BASE + '&screen=maps');
    await page.waitForSelector('.map-select .resume');
    check('map select offers 이어하기', (await page.locator('.resume').textContent()).includes('W2'));
    await page.screenshot({ path: `${OUT}/story-006-resume-${DATE}.png` });
    await page.locator('.resume').tap();
    await page.waitForFunction(() => globalThis.__ptd?.play);
    check('resume restores wave 1 done, prepare phase', await S(() => __ptd.play.world.wave === 1 && __ptd.play.phase === 'prepare'));
    // jump to the last wave and clear it
    await S(() => { __ptd.play.world.wave = 4; });
    await page.locator('button.start').tap();
    await S(() => { __ptd.play.world.waveTick = __ptd.play.world.waveLen - 2; });
    await page.waitForSelector('.result-screen .epilogue');
    await page.screenshot({ path: `${OUT}/story-006-epilogue-${DATE}.png` });
    check('epilogue: 얻은 것 first', (await page.locator('.epilogue .label').textContent()).includes('얻은'));
    await page.locator('.epilogue').tap();
    check('epilogue: 잃은 것 second', (await page.locator('.epilogue .label').textContent()).includes('잃은'));
    await page.locator('.epilogue').tap();
    await page.waitForSelector('.score-table');
    const first = await page.locator('.result-screen button').first().textContent();
    check('[같은 맵 다시] is the top button', first.includes('같은 맵 다시'));
    check('score rows hide zero items', await page.locator('.score-table tr td').evaluateAll(tds => tds.every(td => td.textContent !== '0')));
    check('stars and next goal shown', (await page.locator('.stars').count()) === 1 && (await page.locator('.goal p').textContent()).length > 0);
    check('ending recorded in the codex; run cleared from the save', await S(() => __ptd.store.load().progress.endings.length === 1 && !__ptd.store.load().run));
    await page.screenshot({ path: `${OUT}/story-006-result-${DATE}.png` });
    await ctx.close();
  }
  for (const [label, init] of [
    ['memory mode', () => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); }],
    ['corrupt save', () => { localStorage.setItem('physics-td:v2', '{"v":1,"progress":'); }],
  ]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 664 } });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await ctx.addInitScript(init);
    await page.goto(BASE + '&screen=maps');
    await page.waitForSelector('.map-card');
    check(`${label}: no crash, one notice`, errs.length === 0 && (await page.locator('.notice').count()) === 1, errs.join('|'));
    await page.locator('.map-card[data-map="dike-village"]').click();
    await page.waitForFunction(() => globalThis.__ptd?.play);
    check(`${label}: the game still starts`, await page.evaluate(() => __ptd.play.phase === 'prepare'));
    await ctx.close();
  }

  // story 007: prologue → world map → codex, at every viewport
  console.log('\n# world map & codex');
  for (const [name, viewport] of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto(BASE);
    await page.waitForSelector('#app.scenes');
    check(`${name}: first launch shows the prologue`, (await page.locator('.scene-text').textContent()).includes('강'));
    if (name === 'iphone-13') await page.screenshot({ path: `${OUT}/story-007-prologue-${DATE}.png` });
    for (let k = 0; k < 3; k++) await page.locator('.scene-next').tap();
    await page.waitForSelector('#app.world');
    const noScroll = await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth);
    check(`${name}: world map has no scroll`, noScroll);
    const sizes = await page.locator('.world-svg [role=button], #app.world button').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height); }));
    check(`${name}: world map targets ≥ 48px`, sizes.length > 0 && sizes.every(v => v >= 48), JSON.stringify(sizes.map(Math.round)));
    await page.locator('.world-svg [data-region="glacier"]').click();
    check(`${name}: glacier is locked until the river is cleared`, (await page.locator('.world-status').textContent()).includes('닫혀'));
    await page.screenshot({ path: `${OUT}/story-007-world-${name}-${DATE}.png` });
    await page.locator('.world-svg [data-region="river"]').click();
    await page.waitForSelector('.map-card');
    check(`${name}: river opens its map list`, (await page.locator('.map-card').count()) === 2);
    check(`${name}: no page errors`, errs.length === 0, errs.join('|'));
    await ctx.close();
  }
  {
    // a player who cleared the river: homestead grows, glacier opens (with its scene), memories + recall
    const ctx = await browser.newContext({ viewport: { width: 390, height: 664 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await ctx.addInitScript(() => {
      localStorage.setItem('physics-td:v2', JSON.stringify({ v: 1, progress: {
        maps: { 'dike-village': { stars: 2, best: 1800, clearedBy: ['dike-keeper'], ending: 'dike-keeper' }, 'willow-fields': { stars: 1, best: 1500, clearedBy: ['wetland-researcher'], ending: 'wetland-researcher+safety' } },
        endings: ['dike-keeper', 'wetland-researcher+safety'], fusions: ['green-levee'], lastChar: 'dike-keeper', tutorial: 7,
        memories: ['love-river', 'love-glacier', 'nature-river'], seen: ['prologue'] }, settings: {} }));
    });
    const page = await ctx.newPage();
    await page.goto(BASE);
    await page.waitForSelector('#app.scenes');
    check('clearing the river plays the glacier unlock scene', (await page.locator('.scene-text').textContent()).includes('얼음'));
    for (let k = 0; k < 2; k++) await page.locator('.scene-next').tap();
    await page.waitForSelector('#app.world');
    check('homestead shows 3 cells (home + 2 cleared maps)', (await page.locator('.world-svg .home-cell').count()) === 2 && (await page.locator('.world-head .count').textContent()).includes('3'));
    await page.locator('.world-svg .home-cell').first().click();
    check('a homestead cell shows its record', (await page.locator('.world-status').textContent()).includes('버틴 자들'));
    await page.screenshot({ path: `${OUT}/story-007-world-unlocked-${DATE}.png` });
    await page.locator('.world-svg [data-region="glacier"]').click();
    await page.waitForSelector('.map-card');
    check('glacier maps are playable', (await page.locator('.map-card').count()) === 2);
    await page.goto(BASE + '&screen=codex&tab=memories');
    await page.waitForSelector('.philosophy');
    check('memory tab: 3 fragments known, 5 silhouettes with hints', (await page.locator('.fragment.known').count()) === 3 && (await page.locator('.fragment.unknown').count()) === 5);
    check('recall card open for 사랑 only', (await page.locator('.recall.open').count()) === 1 && (await page.locator('.recall.open p').textContent()).includes('둑'));
    const codexBtns = await page.locator('#app.codex button').evaluateAll(els => els.every(e => e.getBoundingClientRect().height >= 48));
    check('codex targets ≥ 48px', codexBtns);
    await page.screenshot({ path: `${OUT}/story-007-codex-memories-${DATE}.png`, fullPage: true });
    await ctx.close();
  }

  // settings: left-hand mode and tutorial replay (iPhone SE — the narrowest header)
  console.log('\n# settings (iPhone SE)');
  {
    const ctx = await browser.newContext({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await ctx.addInitScript(() => { if (!localStorage.getItem('physics-td:v2')) localStorage.setItem('physics-td:v2', JSON.stringify({ v: 1, progress: { maps: {}, endings: [], fusions: [], lastChar: null, tutorial: 7, memories: [], seen: ['prologue'] }, settings: {} })); });
    const page = await ctx.newPage();
    await page.goto(BASE);
    await page.waitForSelector('#app.world');
    const headOk = await page.locator('.world-head button').evaluateAll(els => els.every(e => { const r = e.getBoundingClientRect(); return r.right <= innerWidth && r.width >= 48 && r.height >= 48; }));
    check('world header buttons fit at 320px', headOk);
    await page.locator('.settings-btn').tap();
    await page.waitForSelector('#app.settings');
    const setOk = await page.locator('#app.settings button, #app.settings a').evaluateAll(els => els.every(e => e.getBoundingClientRect().height >= 48));
    check('settings targets ≥ 48px', setOk);
    await page.locator('.settings [role=switch]').nth(1).tap();
    await page.waitForFunction(() => __ptd.store.load().settings.leftHand === true);
    await page.locator('.settings .row', { hasText: '튜토리얼' }).tap();
    check('tutorial replay resets the step', await page.evaluate(() => __ptd.store.load().progress.tutorial === 1));
    await page.locator('.settings .seg', { hasText: '120%' }).tap();
    await page.waitForFunction(() => __ptd.store.load().settings.textSize === 120);
    check('text size 120% scales the root font', await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--fs').trim() === '1.2'));
    check('settings fit at 320px with 120% text', ...await fitsAt120(page));
    await page.screenshot({ path: `${OUT}/settings-${DATE}.png` });
    // let Chromium flush localStorage before the next document reads it (cross-document race)
    await page.waitForTimeout(1500);
    await page.goto(BASE + '&map=dike-village&tutorial=0&kit=all');
    await page.waitForFunction(() => globalThis.__ptd?.play);
    const xs = await page.locator('.bar .sk').evaluateAll(els => els.map(e => e.getBoundingClientRect().left));
    check('left-hand mode mirrors the skill bar', xs[0] > xs[xs.length - 1], JSON.stringify(xs) + ' ' + JSON.stringify(await page.evaluate(() => __ptd.store.load().settings)));
    check('play screen fits at 320px with 120% text (saved setting)', ...await fitsAt120(page));
    await page.screenshot({ path: `${OUT}/text-120-play-${DATE}.png` });
    for (const [name, q, sel] of [['world', '', '#app.world'], ['codex', '&screen=codex&tab=memories', '.philosophy'], ['maps', '&screen=maps', '.map-card']]) {
      await page.goto(BASE + q);
      await page.waitForSelector(sel);
      check(`${name} fits at 320px with 120% text`, ...await fitsAt120(page));
    }
    const legacy = await ctx.newPage();
    await legacy.goto(pathToFileURL(resolve('dist/legacy/index.html')).href);
    check('v1 still runs under /legacy', (await legacy.locator('canvas#game').count()) === 1);
    await ctx.close();
  }

  // glacier map board
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 664 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await page.goto(BASE + '&map=glacier-lake-valley&tutorial=0');
    await page.waitForFunction(() => globalThis.__ptd?.play);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/story-004-glacier-lake-valley-${DATE}.png` });
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
    await page.waitForFunction(() => globalThis.__ptd?.play);
    check(`${step}: skill bar shows ${label}`, (await page.locator(sel).getAttribute('aria-label')) === label);
    await page.screenshot({ path: `${OUT}/story-003-${step}-${DATE}.png` });
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
