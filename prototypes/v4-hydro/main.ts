import { waterColor } from '../../src/render/waterLayer.ts';
import {
  BANK, bed, canBuild, chooseCard, cost, createHydro, demand, H, placeBuilding, recommend, repair, seconds, SITES, start,
  tick, totalSeconds, VILLAGE, W, weatherAt, xpNeed, type BuildKind, type CardId, type HydroWorld,
} from './core.ts';
import { SEASONS, T } from './tuning.ts';

/** V4 hydro prototype screen (docs/REDESIGN_V4_HYDRO.md §3): one build button, auto spirits, level-up cards. */

const STR = {
  title: '강가 발전소', lead: '강물로 전기를 만들어 마을을 밝혀요',
  start: '시작', ready: '물레방아가 강물로 전기를 만들어요', build: '짓기', cancel: '취소',
  pickSite: '반짝이는 곳에 지어요', noCoins: '코인이 모자라요', built: '지었어요!', repaired: '고쳤어요!',
  repairAsk: '고장! 코인으로 고쳐요',
  levelUp: '레벨 업!', won: '두 계절을 버텼어요!', lost: '마을이 버티지 못했어요',
  lostBlackout: '정전! 발전소를 더 지어요', lostFlood: '마을이 잠겼어요! 둑을 쌓아요',
  again: '다시', resume: '계속', speed: '빠르게', home: '처음으로', paused: '잠깐 멈춤',
  village: '마을',
};
const B: Record<BuildKind, { icon: string; name: string; desc: string }> = {
  wheel: { icon: '⚙️', name: '물레방아', desc: '강 위에 · 전기를 만들어요' },
  reservoir: { icon: '🕳️', name: '저수지', desc: '강가에 · 물을 모아 두어요' },
  wall: { icon: '🧱', name: '둑', desc: '강가에 · 넘치는 물을 막아요' },
};
const CARD: Record<CardId, { icon: string; name: string; desc: string }> = {
  sand: { icon: '🏖️', name: '모래 정령', desc: '넘치는 곳에 모래를 쌓아요' },
  ice: { icon: '❄️', name: '얼음 정령', desc: '큰물을 얼려 두었다가 가뭄에 녹여요' },
  eta: { icon: '⚙️', name: '좋은 터빈', desc: '전기가 더 많이 나와요' },
  tough: { icon: '🛡️', name: '튼튼한 발전소', desc: '물에 잠겨도 덜 상해요' },
  coins: { icon: '🪙', name: '코인 주머니', desc: '코인 60개' },
  cheap: { icon: '🔨', name: '솜씨 좋은 일꾼', desc: '짓는 값이 싸져요' },
};
const WX: Record<string, { icon: string; name: string }> = {
  clear: { icon: '☀️', name: '맑음' }, rain: { icon: '🌧️', name: '장마' }, drought: { icon: '🏜️', name: '가뭄' },
  thaw: { icon: '🧊', name: '눈 녹음' }, storm: { icon: '🌀', name: '태풍' },
};

const q = new URLSearchParams(location.search);
const app = document.getElementById('app') as HTMLElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const buzz = (ms: number) => { try { navigator.vibrate?.(ms); } catch { /* unsupported */ } };
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
  const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e;
};
let stop: (() => void) | null = null;

function showTitle(): void {
  stop?.(); stop = null;
  app.className = 'title'; app.textContent = '';
  const go = el('button', 'big', '▶ ' + STR.start);
  go.addEventListener('click', showPlay);
  app.append(el('div', 'logo', '⚙️🌊⚡'), el('h1', '', STR.title), el('p', 'lead', STR.lead), go);
}

function showPlay(): void {
  stop?.();
  const w = createHydro(Number(q.get('seed') ?? 1));
  if (q.has('dev')) (globalThis as Record<string, unknown>).__v4 = { w, tick, start, chooseCard, placeBuilding };
  app.className = 'play'; app.textContent = '';

  // ---- top: level/xp · coins · hearts / weather · village · pause
  const top = el('header', 'top');
  const lv = el('span', 'lv'), xp = el('div', 'meter xp'), xpFill = el('i'); xp.append(xpFill);
  const coins = el('span', 'coins'), hearts = el('span', 'hearts');
  const row1 = el('div', 'row'); row1.append(lv, xp, coins, hearts);
  const wx = el('div', 'wx'), wxNow = el('span', 'now'), wxNext = el('span', 'next'), wxBar = el('div', 'meter soon'), wxFill = el('i');
  wxBar.append(wxFill); wx.append(wxNow, wxNext, wxBar);
  const town = el('div', 'town'), townBar = el('div', 'meter power'), townFill = el('i');
  townBar.append(townFill); town.append(el('span', '', '🏠'), townBar);
  const pause = el('button', 'pause', '⏸'); pause.setAttribute('aria-label', STR.paused);
  const row2 = el('div', 'row'); row2.append(wx, town, pause);
  top.append(row1, row2);

  const wrap = el('div', 'board'), cv = el('canvas'), toast = el('div', 'toast'), center = el('div', 'center');
  toast.setAttribute('role', 'status');
  wrap.append(cv, toast, center);
  const bar = el('nav', 'bar'), buildBtn = el('button', 'build');
  buildBtn.append(el('span', 'ic', '🔨'), el('span', 'lb', STR.build));
  const tray = el('div', 'tray');
  bar.append(tray, buildBtn);
  app.append(top, wrap, bar);

  let mode: BuildKind | null = null, rec: number | null = null, trayOpen = false;
  let speed = 1, paused = false, terrainDirty = true;
  const flashes: { cells: number[]; icon: string; until: number }[] = [];

  const say = (t: string, ms = 1800) => {
    toast.textContent = t; toast.classList.add('on');
    clearTimeout((toast as unknown as { t: number }).t);
    (toast as unknown as { t: number }).t = window.setTimeout(() => toast.classList.remove('on'), ms);
  };
  const closeTray = () => { trayOpen = false; tray.classList.remove('open'); tray.textContent = ''; };
  const setMode = (k: BuildKind | null) => {
    mode = k; rec = k ? recommend(w, k) : null;
    buildBtn.classList.toggle('armed', !!k);
    (buildBtn.querySelector('.lb') as HTMLElement).textContent = k ? STR.cancel : STR.build;
    if (k) say(STR.pickSite);
  };
  const openTray = () => {
    trayOpen = true; tray.textContent = ''; tray.classList.add('open');
    for (const k of ['wheel', 'reservoir', 'wall'] as BuildKind[]) {
      const c = el('button', 'bcard');
      c.append(el('span', 'ic', B[k].icon), el('b', '', B[k].name), el('span', 'desc', B[k].desc), el('span', 'cost', `🪙 ${cost(w, k)}`));
      c.disabled = w.coins < cost(w, k);
      c.addEventListener('click', () => { if (w.coins < cost(w, k)) { say(STR.noCoins); buzz(30); return; } closeTray(); setMode(k); buzz(10); });
      tray.append(c);
    }
  };
  buildBtn.addEventListener('click', () => {
    if (mode) { setMode(null); return; }
    if (trayOpen) closeTray(); else openTray();
  });
  pause.addEventListener('click', () => { paused = true; showPause(); });

  // ---- canvas
  const ctx = cv.getContext('2d') as CanvasRenderingContext2D;
  const off = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const terr = off(), tctx = terr.getContext('2d') as CanvasRenderingContext2D, timg = tctx.createImageData(W, H);
  const wat = off(), wctx = wat.getContext('2d') as CanvasRenderingContext2D, wimg = wctx.createImageData(W, H);
  let cssW = 0, cssH = 0, dpr = 1;
  const fit = () => {
    const r = wrap.getBoundingClientRect();
    cssH = Math.floor(Math.min(r.height, r.width * 1.5)); cssW = Math.floor(cssH / 1.5);
    dpr = Math.min(2, devicePixelRatio || 1);
    cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px';
    cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
  };
  const ro = new ResizeObserver(fit); ro.observe(wrap); fit();

  const paintTerrain = () => {
    const d = timg.data, g = w.g;
    for (let i = 0; i < W * H; i++) {
      const y = (i / W) | 0;
      let r: number, gg: number, b: number;
      if (w.village[i]) { r = 214; gg = 196; b = 150; }
      else if (w.channel[i]) { r = 120; gg = 104; b = 80; }
      else {
        const rel = g.h[i] - bed(y);
        if (rel < BANK - 0.2) { r = 132; gg = 110; b = 76; } // dug earth (reservoir)
        else { const t = Math.min(1, (rel - BANK + 0.1) * 2); r = 96 + 30 * t; gg = 156 + 30 * t; b = 82 + 10 * t; }
      }
      if (g.wall[i] > 0) { r = 150; gg = 104; b = 60; }
      if (g.tmp[i] > 0) { r = 226; gg = 200; b = 130; }
      const o = i * 4; d[o] = r; d[o + 1] = gg; d[o + 2] = b; d[o + 3] = 255;
    }
    tctx.putImageData(timg, 0, 0);
  };
  const tmp = [0, 0, 0, 0];
  const paintWater = (phase: number) => {
    const d = wimg.data, g = w.g;
    for (let i = 0; i < W * H; i++) {
      waterColor(g.w[i], g.ice[i], (((i % W) + ((i / W) | 0) + phase) & 1) === 0, tmp);
      const o = i * 4; d[o] = tmp[0]; d[o + 1] = tmp[1]; d[o + 2] = tmp[2]; d[o + 3] = tmp[3];
    }
    wctx.putImageData(wimg, 0, 0);
  };

  const draw = (frame: number) => {
    if (terrainDirty || frame % 10 === 0) { paintTerrain(); terrainDirty = false; }
    paintWater(reduced ? 0 : (frame >> 3) & 1);
    const s = (cssW / W) * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
    ctx.drawImage(terr, 0, 0, cv.width, cv.height);
    ctx.drawImage(wat, 0, 0, cv.width, cv.height);
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // village: lit when the demand was met last second
    const lit = w.lastSecPower >= demand(w) || w.tick < T.tps;
    if (lit) { ctx.fillStyle = 'rgba(255,220,120,0.25)'; ctx.fillRect(VILLAGE.x0, VILLAGE.y0, VILLAGE.x1 - VILLAGE.x0 + 1, VILLAGE.y1 - VILLAGE.y0 + 1); }
    ctx.font = '5px system-ui';
    for (let y = VILLAGE.y0 + 3; y <= VILLAGE.y1; y += 6) for (let x = VILLAGE.x0 + 3; x <= VILLAGE.x1; x += 6) {
      ctx.globalAlpha = lit ? 1 : 0.45; ctx.fillText('🏠', x, y); ctx.globalAlpha = 1;
    }
    if (!lit) { ctx.font = '4px system-ui'; ctx.fillText('🌑', VILLAGE.x1 - 1, VILLAGE.y0 + 1); }
    // sites
    for (const st of SITES) {
      const k = w.built[st.id];
      if (k === 'wheel') {
        const p = w.plants.find(pp => pp.site === st.id)!;
        const r = 3.2, a = reduced ? 0 : p.spin;
        ctx.fillStyle = p.hp > 0 ? '#f4efe2' : '#8a8a8a'; ctx.strokeStyle = '#5b3a1e'; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.arc(st.x, st.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        for (let k2 = 0; k2 < 6; k2++) { const t = a + k2 * Math.PI / 3; ctx.beginPath(); ctx.moveTo(st.x, st.y); ctx.lineTo(st.x + r * Math.cos(t), st.y + r * Math.sin(t)); ctx.stroke(); }
        // health strip
        ctx.fillStyle = '#0008'; ctx.fillRect(st.x - 3, st.y + 3.8, 6, 0.9);
        ctx.fillStyle = p.hp > 0.5 ? '#6cc070' : p.hp > 0.2 ? '#ffd166' : '#ff5b4a'; ctx.fillRect(st.x - 3, st.y + 3.8, 6 * p.hp, 0.9);
        ctx.font = '3.5px system-ui';
        const badge = w.phase === 'ready' ? '' : p.hp <= 0 ? '🔧' : p.drown > 0.2 ? '🫧' : p.power * T.tps < 0.5 ? '💤' : '⚡';
        ctx.fillText(badge, st.x + 3.4, st.y - 3.2);
      } else if (k === 'reservoir') { ctx.font = '4px system-ui'; ctx.fillText('🚰', st.x, st.y); }
      else if (k === 'wall') { ctx.font = '4px system-ui'; ctx.fillText('🧱', st.x, st.y); }
      else {
        const ok = mode && canBuild(w, st.id, mode);
        const isRec = ok && rec === st.id;
        ctx.strokeStyle = ok ? (isRec ? '#ffd166' : '#ffffff') : 'rgba(255,255,255,0.45)';
        ctx.lineWidth = isRec ? 0.8 : 0.45;
        ctx.setLineDash(ok ? [] : [0.8, 0.8]);
        const pulse = isRec && !reduced ? 0.6 * Math.sin(frame / 6) : 0;
        ctx.beginPath(); ctx.arc(st.x, st.y, 2.6 + pulse, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        if (!mode || ok) { ctx.fillStyle = ok ? '#fff' : 'rgba(255,255,255,0.6)'; ctx.font = '3px system-ui'; ctx.fillText(isRec ? '★' : '+', st.x, st.y + 0.2); }
      }
    }
    // spirit flashes
    for (let k = flashes.length - 1; k >= 0; k--) {
      const f = flashes[k];
      if (frame > f.until) { flashes.splice(k, 1); continue; }
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      for (const i of f.cells) ctx.fillRect(i % W, (i / W) | 0, 1, 1);
      const c = f.cells[f.cells.length >> 1];
      if (c !== undefined) { ctx.font = '5px system-ui'; ctx.fillText(f.icon, (c % W) + 4, ((c / W) | 0) - 2); }
    }
  };

  // ---- input: tap a site
  cv.addEventListener('click', e => {
    const r = cv.getBoundingClientRect();
    const gx = ((e.clientX - r.left) / r.width) * W, gy = ((e.clientY - r.top) / r.height) * H;
    let best = -1, bd = 25;
    for (const st of SITES) { const d = (st.x - gx) ** 2 + (st.y - gy) ** 2; if (d < bd) { bd = d; best = st.id; } }
    if (best < 0) { if (mode) say(STR.pickSite); return; }
    if (mode) {
      if (placeBuilding(w, best, mode)) { say(STR.built); buzz(15); terrainDirty = true; setMode(null); }
      else say(w.coins < cost(w, mode) ? STR.noCoins : STR.pickSite);
      return;
    }
    const p = w.plants.find(pp => pp.site === best);
    if (p && p.hp <= 0) { if (repair(w, best)) { say(STR.repaired); buzz(15); } else say(STR.noCoins); }
  });

  // ---- overlays
  const overlay = (cls: string, ...kids: HTMLElement[]) => { center.textContent = ''; center.className = 'center on ' + cls; center.append(...kids); };
  const clearOverlay = () => { center.textContent = ''; center.className = 'center'; };
  // before the first wave the board stays clear so every build spot can be used: 시작 sits in the bottom bar
  const startBtn = el('button', 'go', '▶ ' + STR.start);
  startBtn.addEventListener('click', () => { start(w); startBtn.remove(); buzz(15); });
  const showReady = () => { clearOverlay(); bar.prepend(startBtn); say(STR.ready, 3000); };
  const showLevel = () => {
    const kids: HTMLElement[] = [el('h2', '', STR.levelUp)];
    for (const c of w.cards) {
      const b = el('button', 'card');
      const lvNow = c === 'coins' ? 0 : w.skill[c];
      b.append(el('span', 'ic', CARD[c].icon), el('b', '', CARD[c].name + (c === 'coins' ? '' : ' ' + '★'.repeat(lvNow + 1))), el('span', 'desc', CARD[c].desc));
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
    if (won) kids.push(el('p', 'starline', '★'.repeat(w.hearts) + '☆'.repeat(T.hearts - w.hearts)));
    kids.push(el('p', '', `Lv ${w.level} · ⚙️ ${w.plants.length}`), again, home);
    overlay(won ? 'won' : 'lost', ...kids);
  };
  const showPause = () => {
    const resume = el('button', 'big', '▶ ' + STR.resume); resume.addEventListener('click', () => { paused = false; clearOverlay(); lastOverlay = ''; });
    const fast = el('button', 'big alt', `${STR.speed} ${speed === 1 ? '2×' : '1×'}`);
    fast.addEventListener('click', () => { speed = speed === 1 ? 2 : 1; fast.textContent = `${STR.speed} ${speed === 1 ? '2×' : '1×'}`; });
    const home = el('button', 'big alt', STR.home); home.addEventListener('click', showTitle);
    overlay('pause', el('h2', '', STR.paused), resume, fast, home);
  };

  // ---- HUD
  let lastForecast: unknown = null;
  const hud = () => {
    lv.textContent = `Lv ${w.level}`;
    xpFill.style.width = `${Math.min(100, (100 * w.xp) / xpNeed(w.level))}%`;
    coins.textContent = `🪙 ${w.coins}`;
    hearts.textContent = '❤️'.repeat(Math.max(0, w.hearts)) + '🤍'.repeat(T.hearts - Math.max(0, w.hearts));
    const sec = seconds(w), f = weatherAt(Math.min(sec, totalSeconds - 1e-6));
    const season = SEASONS[Math.min(SEASONS.length - 1, sec < SEASONS[0].seconds ? 0 : 1)].name;
    wxNow.textContent = `${season} ${WX[f.now.kind].icon}`;
    const soon = f.next && f.nextIn <= T.forecastSeconds;
    wxNext.textContent = soon && f.next ? `→ ${WX[f.next.kind].icon}${f.next.boss ? '!' : ''}` : '';
    wxBar.hidden = !soon;
    if (soon) wxFill.style.width = `${100 * (1 - f.nextIn / T.forecastSeconds)}%`;
    if (soon && f.next && lastForecast !== f.next) { lastForecast = f.next; say(`${WX[f.next.kind].icon} ${WX[f.next.kind].name}${f.next.boss ? '!!' : ''} 곧 와요`); }
    const ratio = w.tick < T.tps ? 1 : w.lastSecPower / demand(w);
    townFill.style.width = `${Math.min(100, ratio * 100)}%`;
    town.classList.toggle('short', ratio < 1);
    town.setAttribute('aria-label', STR.village);
    if (trayOpen) for (const b of tray.querySelectorAll<HTMLButtonElement>('.bcard')) {
      const k = (['wheel', 'reservoir', 'wall'] as BuildKind[])[[...tray.children].indexOf(b)];
      b.disabled = w.coins < cost(w, k);
    }
  };

  // ---- loop
  let raf = 0, acc = 0, last = performance.now(), frame = 0, lastOverlay = '';
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!paused && w.phase === 'run') {
      acc += dt * T.tps * speed;
      let n = 0;
      while (acc >= 1 && n++ < 8 && w.phase === 'run') {
        tick(w); acc -= 1;
        if (w.events.spirit) { flashes.push({ cells: w.events.spirit.cells, icon: w.events.spirit.kind === 'sand' ? '🏖️' : '❄️', until: frame + 40 }); terrainDirty = true; }
        if (w.events.lostHeart) { say(w.events.lostHeart === 'blackout' ? STR.lostBlackout : STR.lostFlood, 2600); buzz(80); }
      }
      if (n >= 8) acc = 0;
    } else acc = 0;
    const want = paused ? 'pause' : w.phase === 'ready' ? 'ready' : w.phase === 'levelup' ? 'level' : w.phase === 'won' || w.phase === 'lost' ? 'end' : '';
    if (want !== lastOverlay) {
      lastOverlay = want;
      if (want === 'ready') showReady(); else if (want === 'level') showLevel(); else if (want === 'end') showEnd();
      else if (want === '') clearOverlay();
    }
    hud(); draw(frame++);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  stop = () => { cancelAnimationFrame(raf); ro.disconnect(); };
}

if (q.has('play')) showPlay(); else showTitle();
