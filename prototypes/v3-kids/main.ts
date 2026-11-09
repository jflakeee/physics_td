import { waterColor } from '../../src/render/waterLayer.ts';
import {
  blocked, CHARS, createKidsWorld, discCells, fenceHealth, KIND, lineCells, pickUpgrade, SKILL_INPUT,
  startWave, tick, upgradeChoices, useSkill, useUlt, type CharId, type KidsWorld, type SkillId,
} from './core.ts';
import { SKILL_LEVELS, TUNING } from './tuning.ts';

/**
 * V3 kids prototype screen (docs/REDESIGN_V3_KIDS.md §3.3, §7): hearts + wave dots + pause on top,
 * the board, three big buttons at the bottom. Short words, no numbers during play.
 */

const STR = {
  title: '물막이 마을',
  pickChar: '누구랑 마을을 지킬까?',
  keeper: '둑지기', keeperDesc: '벽을 세워 막아요',
  mole: '두더지 로봇', moleDesc: '물길을 파서 돌려요',
  start: '시작', ready: '물이 오기 전에 미리 준비해요',
  hintLine: '버튼을 누르고 선을 그어 봐', hintTap: '버튼을 누르고 땅을 눌러 봐',
  hintUlt: '필살기가 준비됐어요!', hintCanal: '대운하를 팔 줄을 눌러요',
  notHere: '여기는 안 돼요', wait: '조금만 기다려요', pressFirst: '버튼을 먼저 눌러요',
  warn: '물이 와요!', pick: '더 세게!', won: '마을을 지켰어요!', lost: '물이 여기로 넘어왔어요',
  again: '다시', other: '다른 친구', resume: '계속', speed: '빠르게', home: '처음으로', paused: '잠깐 멈춤',
  skill: { wall: '벽', sand: '모래', dig: '물길', basin: '저수지' } as Record<SkillId, string>,
  up: { wall: '더 길고 높게', sand: '더 넓게', dig: '더 길고 깊게', basin: '더 크게' } as Record<SkillId, string>,
  ult: { fenceUlt: '큰 울타리', canalUlt: '대운하' },
};
const ICON: Record<SkillId | 'fenceUlt' | 'canalUlt', string> = { wall: '🧱', sand: '🏖️', dig: '⛏️', basin: '🕳️', fenceUlt: '🛡️', canalUlt: '🚇' };
const CHAR_ICON: Record<CharId, string> = { keeper: '🛡️', mole: '🤖' };

const q = new URLSearchParams(location.search);
const app = document.getElementById('app') as HTMLElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const buzz = (ms: number) => { try { navigator.vibrate?.(ms); } catch { /* not supported */ } };
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
  const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e;
};

let stop: (() => void) | null = null;

function showTitle(): void {
  stop?.(); stop = null;
  app.className = 'title';
  app.textContent = '';
  app.append(el('h1', '', STR.title), el('p', 'lead', STR.pickChar));
  const row = el('div', 'chars');
  for (const id of ['keeper', 'mole'] as CharId[]) {
    const b = el('button', 'char');
    b.append(el('span', 'face', CHAR_ICON[id]), el('b', '', STR[id]), el('span', 'desc', STR[id === 'keeper' ? 'keeperDesc' : 'moleDesc']));
    b.addEventListener('click', () => showPlay(id));
    row.append(b);
  }
  app.append(row);
}

function showPlay(char: CharId): void {
  stop?.();
  const w = createKidsWorld(char);
  if (q.has('dev')) (globalThis as Record<string, unknown>).__v3 = { w, useSkill, useUlt, startWave, tick };
  app.className = 'play';
  app.textContent = '';

  // top bar
  const top = el('header', 'top');
  const hearts = el('div', 'hearts'); hearts.setAttribute('aria-label', '울타리');
  const dots = el('div', 'dots'); dots.setAttribute('aria-label', '물결');
  const pause = el('button', 'pause', '⏸'); pause.setAttribute('aria-label', STR.paused);
  top.append(hearts, dots, pause);

  // board
  const wrap = el('div', 'board');
  const cv = el('canvas');
  const toast = el('div', 'toast'); toast.setAttribute('role', 'status');
  const center = el('div', 'center');
  wrap.append(cv, toast, center);

  // bottom buttons: skill 1, skill 2, ultimate
  const bar = el('nav', 'bar');
  const mkBtn = (key: SkillId | 'ult') => {
    const b = el('button', 'sk');
    const icon = key === 'ult' ? ICON[w.char.ult] : ICON[key];
    const label = key === 'ult' ? STR.ult[w.char.ult] : STR.skill[key];
    b.append(el('span', 'ic', icon), el('span', 'lb', label), el('span', 'stars'));
    b.setAttribute('aria-label', label);
    bar.append(b);
    return b;
  };
  const [s1, s2] = w.char.skills;
  const btn = { [s1]: mkBtn(s1), [s2]: mkBtn(s2), ult: mkBtn('ult') } as Record<string, HTMLButtonElement>;
  btn.ult.classList.add('ult');
  app.append(top, wrap, bar);

  // ---- state for aiming ----
  let armed: SkillId | 'canal' | null = null;
  let path: [number, number][] = [];
  let preview: number[] = [];
  let speed = 1, paused = false, terrainDirty = true;

  const say = (t: string, ms = 1600) => {
    toast.textContent = t; toast.classList.add('on');
    clearTimeout((toast as unknown as { t: number }).t);
    (toast as unknown as { t: number }).t = window.setTimeout(() => toast.classList.remove('on'), ms);
  };
  const arm = (k: typeof armed) => {
    armed = armed === k ? null : k;
    for (const [id, b] of Object.entries(btn)) b.classList.toggle('armed', armed === id || (armed === 'canal' && id === 'ult'));
    path = []; preview = [];
    if (armed === 'canal') say(STR.hintCanal);
    else if (armed) say(SKILL_INPUT[armed] === 'line' ? STR.hintLine : STR.hintTap);
  };
  for (const s of [s1, s2]) btn[s].addEventListener('click', () => {
    if (blocked(w, s) === 'cooldown') { say(STR.wait); buzz(30); return; }
    buzz(10); arm(s);
  });
  btn.ult.addEventListener('click', () => {
    if (w.ult < 1 || (w.phase !== 'wave' && w.phase !== 'warn')) { say(STR.wait); buzz(30); return; }
    if (w.char.ult === 'fenceUlt') { useUlt(w); buzz(40); terrainDirty = true; }
    else arm('canal');
  });
  pause.addEventListener('click', () => { paused = true; showPause(); });

  // ---- canvas sizing & images ----
  const ctx = cv.getContext('2d') as CanvasRenderingContext2D;
  const W = w.g.width, H = w.g.height;
  const off = (n: number, m: number) => { const c = document.createElement('canvas'); c.width = n; c.height = m; return c; };
  const terr = off(W, H), terrCtx = terr.getContext('2d') as CanvasRenderingContext2D, terrImg = terrCtx.createImageData(W, H);
  const water = off(W, H), waterCtx = water.getContext('2d') as CanvasRenderingContext2D, waterImg = waterCtx.createImageData(W, H);
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
    const d = terrImg.data, g = w.g;
    for (let i = 0; i < W * H; i++) {
      const y = (i / W) | 0, k = w.kind[i];
      let r = 0, gg = 0, b = 0;
      if (k === KIND.village) { r = 214; gg = 196; b = 150; }
      else if (k === KIND.outlet) { r = 52; gg = 120; b = 200; }
      else {
        // greener when higher; dug ground shows brown earth
        const t = Math.max(0, Math.min(1, g.h[i] / 3.5));
        r = 92 + 40 * t; gg = 150 + 40 * t; b = 70 + 20 * t;
        const natural = 3 * (1 - y / (H - 1));
        if (g.h[i] < natural - 0.3) { r = 128; gg = 96; b = 64; }
        if (w.sandCap[i] > 0) { const f = w.sandHeld[i] / w.sandCap[i]; r = 236 - 70 * f; gg = 212 - 70 * f; b = 140 - 40 * f; }
      }
      if (g.wall[i] > 0) {
        if (k === KIND.fence) { const f = Math.max(0, g.dur[i]); r = 220 - 40 * f; gg = 70 + 90 * f; b = 50 + 30 * f; }
        else { r = 140; gg = 100; b = 60; }
      }
      const o = i * 4; d[o] = r; d[o + 1] = gg; d[o + 2] = b; d[o + 3] = 255;
    }
    terrCtx.putImageData(terrImg, 0, 0);
  };
  const tmp = [0, 0, 0, 0];
  const paintWater = (phase: number) => {
    const d = waterImg.data, g = w.g;
    for (let i = 0; i < W * H; i++) {
      waterColor(g.w[i], g.ice[i], (((i % W) + ((i / W) | 0) + phase) & 1) === 0, tmp);
      const o = i * 4; d[o] = tmp[0]; d[o + 1] = tmp[1]; d[o + 2] = tmp[2]; d[o + 3] = tmp[3];
    }
    waterCtx.putImageData(waterImg, 0, 0);
  };

  const draw = (frame: number) => {
    if (terrainDirty || frame % 15 === 0) { paintTerrain(); terrainDirty = false; }
    paintWater(reduced ? 0 : (frame >> 3) & 1);
    const s = (cssW / W) * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(terr, 0, 0, cv.width, cv.height);
    ctx.drawImage(water, 0, 0, cv.width, cv.height);
    ctx.setTransform(s, 0, 0, s, 0, 0);
    // the fence: planks coloured by health (green → red), gaps where it broke, posts every 4 cells
    const fr = TUNING.fenceRow;
    for (let x = 0; x < W; x++) {
      const i = fr * W + x;
      if (w.g.wall[i] <= 0) continue;
      const f = Math.max(0, Math.min(1, w.g.dur[i]));
      ctx.fillStyle = `rgb(${Math.round(230 - 120 * f)},${Math.round(80 + 110 * f)},${Math.round(60 + 20 * f)})`;
      ctx.fillRect(x, fr - 0.7, 1, 1.4);
      if (x % 4 === 0) { ctx.fillStyle = '#5b3a1e'; ctx.fillRect(x + 0.3, fr - 1.4, 0.5, 2.6); }
    }
    // houses below the fence
    ctx.font = '5px system-ui';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const x of [8, 20, 32, 44, 56]) ctx.fillText('🏠', x, TUNING.fenceRow + 7);
    // clouds where water comes from; they flash during the warning
    const flash = w.phase === 'warn' && !reduced ? (frame >> 3) & 1 : 0;
    ctx.globalAlpha = flash ? 1 : 0.85;
    ctx.font = '7px system-ui';
    ctx.fillText(w.phase === 'warn' ? '⛈️' : '☁️', 32, 3);
    ctx.globalAlpha = 1;
    if (w.phase === 'warn' || w.phase === 'ready') {
      ctx.fillStyle = 'rgba(120,200,255,0.9)';
      for (let k = 0; k < 3; k++) { const y = 8 + k * 4 + (reduced ? 0 : (frame >> 2) % 4); ctx.beginPath(); ctx.moveTo(30, y); ctx.lineTo(34, y); ctx.lineTo(32, y + 2.5); ctx.fill(); }
    }
    // side rivers: arrows show where water leaves the board
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = '3px system-ui';
    for (const y of [36, 50, 64]) { ctx.fillText('◀', 1.5, y); ctx.fillText('▶', W - 1.5, y); }
    // aiming
    if (armed) {
      ctx.fillStyle = 'rgba(8,14,24,0.35)';
      ctx.fillRect(0, 0, W, TUNING.aimRows[0]); ctx.fillRect(0, TUNING.aimRows[1] + 1, W, H);
      ctx.fillStyle = armed === 'dig' || armed === 'basin' || armed === 'canal' ? 'rgba(255,170,60,0.75)' : 'rgba(255,255,255,0.75)';
      for (const i of preview) ctx.fillRect(i % W, (i / W) | 0, 1, 1);
    }
    // where the fence broke (defeat explanation, §7)
    if (w.breaches.length && (w.phase === 'lost' || frame % 30 < 20)) {
      ctx.fillStyle = '#ff4b3e'; ctx.font = '6px system-ui';
      const seen = new Set<number>();
      for (const i of w.breaches) { const x = i % W; const bx = Math.round(x / 6); if (seen.has(bx)) continue; seen.add(bx); ctx.fillText('⬇', x + 0.5, TUNING.fenceRow - 4); }
    }
  };

  // ---- input ----
  const toGrid = (e: PointerEvent): [number, number] => {
    const r = cv.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  };
  const updatePreview = () => {
    if (!armed || path.length === 0) { preview = []; return; }
    if (armed === 'canal') { const y = Math.round(path[0][1]); preview = []; for (let x = 1; x < W - 1; x++) preview.push(y * W + x, (y + 1) * W + x); return; }
    const lv = w.level[armed] - 1;
    if (armed === 'wall') preview = lineCells(w, path, SKILL_LEVELS.wall.cells[lv]);
    else if (armed === 'dig') preview = lineCells(w, path, SKILL_LEVELS.dig.cells[lv]);
    else if (armed === 'sand') preview = discCells(w, Math.round(path[0][0]), Math.round(path[0][1]), SKILL_LEVELS.sand.radius[lv]);
    else preview = discCells(w, Math.round(path[0][0]), Math.round(path[0][1]), SKILL_LEVELS.basin.radius[lv]);
  };
  cv.addEventListener('pointerdown', e => {
    if (!armed) { say(STR.pressFirst); return; }
    cv.setPointerCapture(e.pointerId);
    path = [toGrid(e)]; updatePreview();
  });
  cv.addEventListener('pointermove', e => {
    if (!armed || path.length === 0) return;
    if (armed === 'canal' || SKILL_INPUT[armed] === 'tap') path = [toGrid(e)];
    else path.push(toGrid(e));
    updatePreview();
  });
  cv.addEventListener('pointerup', () => {
    if (!armed || path.length === 0) return;
    let ok: boolean;
    if (armed === 'canal') ok = useUlt(w, path[0][1]);
    else ok = useSkill(w, armed, path) > 0;
    if (ok) { buzz(15); terrainDirty = true; arm(armed); }
    else { say(STR.notHere); buzz(30); path = []; preview = []; }
  });
  cv.addEventListener('pointercancel', () => { path = []; preview = []; });

  // ---- overlays ----
  const overlay = (cls: string, ...kids: HTMLElement[]) => { center.textContent = ''; center.className = 'center on ' + cls; center.append(...kids); };
  const clearOverlay = () => { center.textContent = ''; center.className = 'center'; };
  const showReady = () => {
    const b = el('button', 'big', '▶ ' + STR.start);
    b.addEventListener('click', () => { startWave(w); clearOverlay(); say(STR.warn); buzz(20); });
    overlay('ready', el('p', '', STR.ready), b);
  };
  const showPick = () => {
    const kids: HTMLElement[] = [el('h2', '', STR.pick)];
    const choices = upgradeChoices(w);
    for (const s of choices) {
      const c = el('button', 'card');
      c.append(el('span', 'ic', ICON[s]), el('b', '', `${STR.skill[s]} ${'★'.repeat(w.level[s] + 1)}`), el('span', 'desc', STR.up[s]));
      c.addEventListener('click', () => { pickUpgrade(w, s); clearOverlay(); say(STR.warn); });
      kids.push(c);
    }
    if (!choices.length) { const c = el('button', 'big', '▶'); c.addEventListener('click', () => { pickUpgrade(w, null); clearOverlay(); }); kids.push(c); }
    overlay('pick', ...kids);
  };
  const showEnd = () => {
    const won = w.phase === 'won';
    const again = el('button', 'big', '↻ ' + STR.again); again.addEventListener('click', () => showPlay(char));
    const other = el('button', 'big alt', STR.other); other.addEventListener('click', showTitle);
    const kids: HTMLElement[] = [el('h2', '', won ? STR.won : STR.lost)];
    if (won) kids.push(el('p', 'starline', '★'.repeat(w.stars) + '☆'.repeat(3 - w.stars)));
    kids.push(again, other);
    overlay(won ? 'won' : 'lost', ...kids);
    buzz(won ? 20 : 100);
  };
  const showPause = () => {
    const resume = el('button', 'big', '▶ ' + STR.resume); resume.addEventListener('click', () => { paused = false; clearOverlay(); lastOverlay = ''; });
    const fast = el('button', 'big alt', `${STR.speed} ${speed === 1 ? '2×' : '1×'}`);
    fast.addEventListener('click', () => { speed = speed === 1 ? 2 : 1; fast.textContent = `${STR.speed} ${speed === 1 ? '2×' : '1×'}`; });
    const home = el('button', 'big alt', STR.home); home.addEventListener('click', showTitle);
    overlay('pause', el('h2', '', STR.paused), resume, fast, home);
  };

  // ---- HUD refresh ----
  const hud = () => {
    const hp = fenceHealth(w), full = Math.ceil(hp * 5 - 1e-9);
    hearts.textContent = '❤️'.repeat(full) + '🤍'.repeat(5 - full);
    dots.textContent = Array.from({ length: TUNING.waves.length }, (_, k) => k < w.wave ? '🌊' : '◯').join(' ');
    for (const s of [s1, s2]) {
      const total = SKILL_LEVELS[s].cd * TUNING.tps;
      btn[s].style.setProperty('--p', String(1 - w.cd[s] / total));
      btn[s].classList.toggle('cool', w.cd[s] > 0);
      (btn[s].querySelector('.stars') as HTMLElement).textContent = '★'.repeat(w.level[s]);
    }
    btn.ult.style.setProperty('--p', String(w.ult));
    const wasReady = btn.ult.classList.contains('ready');
    btn.ult.classList.toggle('ready', w.ult >= 1);
    btn.ult.classList.toggle('cool', w.ult < 1);
    if (!wasReady && w.ult >= 1 && (w.phase === 'wave' || w.phase === 'warn')) say(STR.hintUlt);
  };

  // ---- loop ----
  let raf = 0, acc = 0, last = performance.now(), frame = 0, lastOverlay = '';
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!paused) {
      acc += dt * TUNING.tps * speed;
      let n = 0;
      while (acc >= 1 && n++ < 8) { tick(w); acc -= 1; }
      if (n >= 8) acc = 0;
    }
    const want = paused ? 'pause' : w.phase === 'ready' ? 'ready' : w.phase === 'pick' ? 'pick' : w.phase === 'won' || w.phase === 'lost' ? 'end' : '';
    if (want !== lastOverlay) {
      lastOverlay = want;
      if (want === 'ready') showReady(); else if (want === 'pick') showPick(); else if (want === 'end') showEnd();
      else if (want === '') clearOverlay();
    }
    hud(); draw(frame++);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  stop = () => { cancelAnimationFrame(raf); ro.disconnect(); };
}

const c = q.get('char');
if (c === 'keeper' || c === 'mole') showPlay(c); else showTitle();
