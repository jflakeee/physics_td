import {
  canBuild, chooseCard, cost, createHydro, demand, placeBuilding, recommendSteps, repair, seconds, SITES, start,
  tick, totalSeconds, W, H, waiting, weatherAt, xpNeed, type BuildKind, type CardId,
} from './core.ts';
import { AH, AW, createArt, paintSprites, paintTerrain, paintWater, seasonKey } from './art.ts';
import { rgbOf, sprite, type SpriteName } from './sprites.ts';
import { SEASONS, T } from './tuning.ts';

/**
 * V4 hydro prototype screen (docs/REDESIGN_V4_HYDRO.md §3, docs/ART_DIRECTION_V4_PIXEL.md):
 * one pixel grid (192×288 art px) scaled by a whole number; icons use the same pixel size.
 * Text uses the system font (§0-6). No emoji.
 */

const STR = {
  title: '강가 발전소', lead: '강물로 전기를 만들어 마을을 밝혀요',
  start: '시작', ready: '동그라미를 누르면 지어요 · 별은 지금 좋은 곳', noCoins: '코인이 모자라요', repaired: '고쳤어요!',
  built: { wheel: '물레방아를 지었어요!', reservoir: '저수지를 팠어요!', wall: '둑을 쌓았어요!' } as Record<BuildKind, string>,
  levelUp: '레벨 업!', won: '두 계절을 버텼어요!', lost: '마을이 버티지 못했어요',
  lostBlackout: '정전! 물레방아를 더 지어요', lostFlood: '마을이 잠겼어요! 둑을 쌓아요',
  again: '다시', resume: '계속', speed: '빠르게', home: '처음으로', paused: '잠깐 멈춤', soon: '곧 와요',
};
const B: Record<BuildKind, SpriteName> = { wheel: 'wheel0', reservoir: 'gate', wall: 'stakes' };
const CARD: Record<CardId, { icon: SpriteName; name: string; desc: string }> = {
  sand: { icon: 'sandSpirit', name: '모래 정령', desc: '넘치는 곳에 모래를 쌓아요' },
  ice: { icon: 'iceSpirit', name: '얼음 정령', desc: '큰물을 얼려 두었다가 가뭄에 녹여요' },
  eta: { icon: 'wheel0', name: '좋은 터빈', desc: '전기가 더 많이 나와요' },
  tough: { icon: 'shield', name: '튼튼한 발전소', desc: '물에 잠겨도 덜 상해요' },
  coins: { icon: 'coin', name: '코인 주머니', desc: '코인 60개' },
  cheap: { icon: 'hammer', name: '솜씨 좋은 일꾼', desc: '짓는 값이 싸져요' },
};
const WX: Record<string, { icon: SpriteName; name: string }> = {
  clear: { icon: 'sun', name: '맑음' }, rain: { icon: 'rain', name: '장마' }, drought: { icon: 'drought', name: '가뭄' },
  thaw: { icon: 'thaw', name: '눈 녹음' }, storm: { icon: 'storm', name: '태풍' },
};

const q = new URLSearchParams(location.search);
const app = document.getElementById('app') as HTMLElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const buzz = (ms: number) => { try { navigator.vibrate?.(ms); } catch { /* unsupported */ } };
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
  const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e;
};

// ---- pixel size shared by the board and every icon (CSS px per art px) ----
const root = document.documentElement;
const setPixel = (cssPerArt: number) => root.style.setProperty('--px', `${cssPerArt}px`);
setPixel(2 / Math.min(2, devicePixelRatio || 1));

/** A sprite as a tiny canvas; CSS scales it by the shared pixel size (`--px`), nearest neighbour. */
function icon(name: SpriteName, cls = ''): HTMLCanvasElement {
  const s = sprite(name), c = el('canvas', 'pi ' + cls);
  c.width = s.w; c.height = s.h;
  c.style.setProperty('--w', String(s.w)); c.style.setProperty('--h', String(s.h));
  const ctx = c.getContext('2d') as CanvasRenderingContext2D, img = ctx.createImageData(s.w, s.h);
  for (let i = 0; i < s.px.length; i++) { const v = s.px[i]; if (!v) continue; const [r, g, b] = rgbOf(v); img.data.set([r, g, b, 255], i * 4); }
  ctx.putImageData(img, 0, 0);
  c.setAttribute('aria-hidden', 'true');
  return c;
}

let stop: (() => void) | null = null;

function showTitle(): void {
  stop?.(); stop = null;
  app.className = 'title'; app.textContent = '';
  const go = el('button', 'big'); go.append(icon('play', 'x2'), el('span', '', STR.start));
  go.addEventListener('click', showPlay);
  const logo = el('div', 'logo');
  logo.append(icon('wheel0', 'x4'), icon('rain', 'x4'), icon('house', 'x4'));
  app.append(logo, el('h1', '', STR.title), el('p', 'lead', STR.lead), go);
}

function showPlay(): void {
  stop?.();
  const w = createHydro(Number(q.get('seed') ?? 1));
  if (q.has('dev')) (globalThis as Record<string, unknown>).__v4 = { w, tick, start, chooseCard, placeBuilding };
  app.className = 'play'; app.textContent = '';

  // ---- top: level/xp · coins · hearts / weather · village power · pause
  const top = el('header', 'top');
  const lv = el('span', 'lv'), xp = el('div', 'meter xp'), xpFill = el('i'); xp.append(xpFill);
  const coins = el('span', 'coins'), coinNum = el('b');
  coins.append(icon('coin'), coinNum);
  const hearts = el('span', 'hearts');
  const row1 = el('div', 'row'); row1.append(lv, xp, coins, hearts);
  const wx = el('div', 'wx'), wxSeason = el('span', 'season'), wxNow = el('span', 'now'), wxNext = el('span', 'next'), wxBar = el('div', 'meter soon'), wxFill = el('i');
  wxBar.append(wxFill); wx.append(wxSeason, wxNow, wxNext, wxBar);
  const town = el('div', 'town'), townBar = el('div', 'meter power'), townFill = el('i');
  townBar.append(townFill); town.append(icon('house'), townBar);
  town.setAttribute('aria-label', '마을 전기');
  const pause = el('button', 'pause', 'Ⅱ'); pause.setAttribute('aria-label', STR.paused);
  const row2 = el('div', 'row'); row2.append(wx, town, pause);
  top.append(row1, row2);

  const wrap = el('div', 'board'), cv = el('canvas', 'art'), toast = el('div', 'toast'), center = el('div', 'center');
  toast.setAttribute('role', 'status');
  wrap.append(cv, toast, center);
  // no build menu: the map's circles are the buttons. The bottom bar only holds 시작, then goes.
  const bar = el('nav', 'bar');
  app.append(top, wrap, bar);

  let rec: number | null = null;
  let speed = 1, paused = false, terrainDirty = true;
  const flashes: { cells: number[]; kind: 'sand' | 'ice'; until: number }[] = [];

  const say = (t: string, ic: SpriteName | null = null, ms = 1800) => {
    toast.textContent = '';
    if (ic) toast.append(icon(ic));
    toast.append(el('span', '', t));
    toast.classList.add('on');
    clearTimeout((toast as unknown as { t: number }).t);
    (toast as unknown as { t: number }).t = window.setTimeout(() => toast.classList.remove('on'), ms);
  };
  // the star: recomputed in the background (one look-ahead per frame) when coins or buildings change
  let recJob: Generator<void, number | null> | null = null, recKey = '', recAt = -1e9;
  const recKeyNow = () => `${w.built.join()}|${SITES.filter(st => canBuild(w, st.id)).map(st => st.id).join()}`;
  const stepRecommendation = (now: number) => {
    const key = recKeyNow();
    if (!recJob && (key !== recKey || now - recAt > 3000) && w.phase !== 'won' && w.phase !== 'lost') { recJob = recommendSteps(w); recKey = key; recAt = now; }
    if (!recJob) return;
    const t0 = performance.now();
    while (recJob && performance.now() - t0 < 6) { const r = recJob.next(); if (r.done) { rec = r.value; recJob = null; needDraw = true; } }
  };
  pause.addEventListener('click', () => { paused = true; showPause(); });

  // ---- board: one art buffer, shown at a whole-number scale of device pixels
  cv.width = AW; cv.height = AH;
  const ctx = cv.getContext('2d') as CanvasRenderingContext2D;
  const art = createArt(), frameImg = new ImageData(art.rgba as Uint8ClampedArray<ArrayBuffer>, AW, AH); // shares the art buffer: no per-frame copy
  let scale = 1, shownBags = 0, shownSeason = -1;
  /** Repaint only when something changed: a sim tick, building mode (pulsing star), spirit flashes, a resize. */
  let needDraw = true;
  const fit = () => {
    const r = wrap.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    scale = Math.max(1, Math.floor(Math.min((r.width * dpr) / AW, (r.height * dpr) / AH)));
    cv.style.width = `${(AW * scale) / dpr}px`; cv.style.height = `${(AH * scale) / dpr}px`;
    cv.dataset.scale = String(scale);
    setPixel(scale / dpr);
    needDraw = true;
  };
  const ro = new ResizeObserver(fit); ro.observe(wrap); fit();
  const dprWatch = matchMedia(`(resolution: ${devicePixelRatio || 1}dppx)`);
  dprWatch.addEventListener?.('change', fit);

  const draw = (frame: number) => {
    if (seasonKey(seconds(w)) !== shownSeason) { shownSeason = seasonKey(seconds(w)); terrainDirty = true; }
    if (!needDraw && rec === null && !flashes.length && !terrainDirty) return;
    needDraw = false;
    // repaint the ground only when it changes (building, spirits, a sandbag expiring)
    if (terrainDirty || w.sandbags.size !== shownBags) { paintTerrain(art, w); terrainDirty = false; shownBags = w.sandbags.size; }
    paintWater(art, w, reduced ? 0 : Math.floor(w.tick / 2));
    for (let k = flashes.length - 1; k >= 0; k--) if (frame > flashes[k].until) flashes.splice(k, 1);
    paintSprites(art, w, {
      rec: rec !== null && canBuild(w, rec) ? rec : null, canBuild: st => canBuild(w, st), waiting: st => waiting(w, st), frame, reduced,
      lit: w.lastSecPower >= demand(w) || w.tick < T.tps, flashes,
      floodArrow: w.floodCooldown > 0 ? w.floodFrom : -1,
    });
    ctx.putImageData(frameImg, 0, 0);
  };

  // ---- input: tap a site (sites are in cell coordinates)
  cv.addEventListener('click', e => {
    const r = cv.getBoundingClientRect();
    const gx = ((e.clientX - r.left) / r.width) * W, gy = ((e.clientY - r.top) / r.height) * H;
    let best = -1, bd = 25;
    for (const st of SITES) { const d = (st.x - gx) ** 2 + (st.y - gy) ** 2; if (d < bd) { bd = d; best = st.id; } }
    if (best < 0) return;
    const st = SITES[best];
    if (!w.built[best]) {
      if (placeBuilding(w, best)) { say(STR.built[st.build], B[st.build]); buzz(15); terrainDirty = true; needDraw = true; rec = null; }
      else if (w.phase !== 'won' && w.phase !== 'lost') { say(`${STR.noCoins} · ${cost(w, st.build)}`, 'coin'); buzz(30); }
      return;
    }
    const p = w.plants.find(pp => pp.site === best);
    if (p && p.hp <= 0) { if (repair(w, best)) { say(STR.repaired, 'wheel0'); buzz(15); } else say(STR.noCoins, 'coin'); }
  });

  // ---- overlays
  const overlay = (cls: string, ...kids: HTMLElement[]) => { center.textContent = ''; center.className = 'center on ' + cls; center.append(...kids); };
  const clearOverlay = () => { center.textContent = ''; center.className = 'center'; };
  const startBtn = el('button', 'go'); startBtn.append(icon('play', 'x2'), el('span', '', STR.start));
  startBtn.addEventListener('click', () => { start(w); bar.remove(); buzz(15); });
  const showReady = () => { clearOverlay(); bar.append(startBtn); say(STR.ready, 'star', 4000); };
  const showLevel = () => {
    const kids: HTMLElement[] = [el('h2', '', STR.levelUp)];
    for (const c of w.cards) {
      const b = el('button', 'card');
      const lvNow = c === 'coins' ? 0 : w.skill[c];
      b.append(icon(CARD[c].icon, 'x3 ic'), el('b', '', CARD[c].name + (c === 'coins' ? '' : ' ' + '★'.repeat(lvNow + 1))), el('span', 'desc', CARD[c].desc));
      b.addEventListener('click', () => { chooseCard(w, c); clearOverlay(); lastOverlay = ''; buzz(10); });
      kids.push(b);
    }
    overlay('level', ...kids);
    buzz(20);
  };
  const showEnd = () => {
    const won = w.phase === 'won';
    const again = el('button', 'big', '↻ ' + STR.again); again.addEventListener('click', showPlay);
    const home = el('button', 'big alt', STR.home); home.addEventListener('click', showTitle);
    const kids: HTMLElement[] = [el('h2', '', won ? STR.won : STR.lost)];
    const hs = el('p', 'starline');
    for (let k = 0; k < T.hearts; k++) hs.append(icon(k < w.hearts ? 'heart' : 'heartEmpty', 'x3'));
    const sum = el('p', 'sum'); sum.append(el('span', '', `Lv ${w.level}`), icon('wheel0'), el('span', '', String(w.plants.length)));
    kids.push(hs, sum, again, home);
    overlay(won ? 'won' : 'lost', ...kids);
  };
  const showPause = () => {
    const resume = el('button', 'big'); resume.append(icon('play', 'x2'), el('span', '', STR.resume)); resume.addEventListener('click', () => { paused = false; clearOverlay(); lastOverlay = ''; });
    const fast = el('button', 'big alt', `${STR.speed} ${speed === 1 ? '2×' : '1×'}`);
    fast.addEventListener('click', () => { speed = speed === 1 ? 2 : 1; fast.textContent = `${STR.speed} ${speed === 1 ? '2×' : '1×'}`; });
    const home = el('button', 'big alt', STR.home); home.addEventListener('click', showTitle);
    overlay('pause', el('h2', '', STR.paused), resume, fast, home);
  };

  // ---- HUD (icons rebuilt only when what they show changes)
  let lastForecast: unknown = null, shownHearts = -1, shownNow = '', shownNext = '';
  const hud = () => {
    lv.textContent = `Lv ${w.level}`;
    xpFill.style.width = `${Math.min(100, (100 * w.xp) / xpNeed(w.level))}%`;
    coinNum.textContent = String(w.coins);
    if (shownHearts !== w.hearts) {
      shownHearts = w.hearts; hearts.textContent = '';
      for (let k = 0; k < T.hearts; k++) hearts.append(icon(k < w.hearts ? 'heart' : 'heartEmpty'));
      hearts.setAttribute('aria-label', `하트 ${Math.max(0, w.hearts)}개`);
    }
    const sec = seconds(w), f = weatherAt(Math.min(sec, totalSeconds - 1e-6));
    wxSeason.textContent = SEASONS[sec < SEASONS[0].seconds ? 0 : 1].name;
    if (shownNow !== f.now.kind) { shownNow = f.now.kind; wxNow.textContent = ''; wxNow.append(icon(WX[f.now.kind].icon)); wxNow.setAttribute('aria-label', WX[f.now.kind].name); }
    const soon = !!f.next && f.nextIn <= T.forecastSeconds;
    const nextKey = soon && f.next ? f.next.kind + (f.next.boss ? '!' : '') : '';
    if (shownNext !== nextKey) {
      shownNext = nextKey; wxNext.textContent = '';
      if (soon && f.next) { wxNext.append(el('span', 'arrow', '→'), icon(WX[f.next.kind].icon)); if (f.next.boss) wxNext.append(el('span', 'boss', '!')); }
    }
    wxBar.hidden = !soon;
    if (soon) wxFill.style.width = `${100 * (1 - f.nextIn / T.forecastSeconds)}%`;
    if (soon && f.next && lastForecast !== f.next) { lastForecast = f.next; say(`${WX[f.next.kind].name}${f.next.boss ? '!!' : ''} ${STR.soon}`, WX[f.next.kind].icon); }
    const ratio = w.tick < T.tps ? 1 : w.lastSecPower / demand(w);
    townFill.style.width = `${Math.min(100, ratio * 100)}%`;
    town.classList.toggle('short', ratio < 1);
  };

  // ---- loop
  let raf = 0, acc = 0, last = performance.now(), frame = 0, lastOverlay = '';
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!paused && w.phase === 'run') {
      acc += dt * T.tps * speed;
      let n = 0;
      while (acc >= 1 && n++ < 8 && w.phase === 'run') {
        tick(w); acc -= 1; needDraw = true;
        if (w.events.spirit) { flashes.push({ cells: w.events.spirit.cells, kind: w.events.spirit.kind, until: frame + 40 }); terrainDirty = true; }
        if (w.events.lostHeart) { say(w.events.lostHeart === 'blackout' ? STR.lostBlackout : STR.lostFlood, w.events.lostHeart === 'blackout' ? 'houseDark' : 'drown', 2600); buzz(80); }
      }
      if (n >= 8) acc = 0;
    } else acc = 0;
    const want = paused ? 'pause' : w.phase === 'ready' ? 'ready' : w.phase === 'levelup' ? 'level' : w.phase === 'won' || w.phase === 'lost' ? 'end' : '';
    if (want !== lastOverlay) {
      lastOverlay = want;
      needDraw = true;
      if (want === 'ready') showReady(); else if (want === 'level') showLevel(); else if (want === 'end') showEnd();
      else if (want === '') clearOverlay();
    }
    if (w.phase !== 'ready' && bar.isConnected) bar.remove();
    stepRecommendation(now);
    hud(); draw(frame++);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  stop = () => { cancelAnimationFrame(raf); ro.disconnect(); dprWatch.removeEventListener?.('change', fit); };
}

if (q.has('play')) showPlay(); else showTitle();
