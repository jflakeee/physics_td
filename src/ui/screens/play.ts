import type { LoadedMap } from '../../game/map.ts';
import { advance, createPlay, send } from '../../game/play.ts';
import type { Play, PlayEvent, SkillHandler } from '../../game/play.ts';
import { createBoard, drawBoard } from '../../render/board.ts';
import type { Board } from '../../render/board.ts';
import { fitBoard, sizeCanvas } from '../../render/canvas.ts';
import { createGestureTracker } from '../../input/gestures.ts';
import type { Gesture } from '../../input/gestures.ts';
import { hitTest, toCell } from '../../input/hit.ts';
import { IDLE, brightZones, onBoardSwipe, onBoardTap, onSkillButton } from '../../input/targeting.ts';
import type { SkillView, TargetAction, TargetState } from '../../input/targeting.ts';
import { baseFlood } from '../../sim/metrics.ts';
import { createHud } from '../widgets/hud.ts';
import { expireToasts, pushToast } from '../widgets/toast.ts';
import type { ToastQueue } from '../widgets/toast.ts';
import type { T } from '../i18n.ts';

/**
 * Play screen (DETAILED_DESIGN_V2 §15.3, GD §9.3): HUD / board / skill bar on one screen,
 * zone-tap control, pause, 1×/2×, auto-pause when hidden. DOM-only glue; the logic lives in
 * game/, input/ and render/.
 */

export interface PlayScreenOptions {
  root: HTMLElement;
  map: LoadedMap;
  t: T;
  common: SkillView[];
  active: SkillView[];
  skill?: SkillHandler;
  /** Called every frame with the ms spent rendering (dev overlay, e2e). */
  onFrame?: (renderMs: number) => void;
}

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text) e.textContent = text;
  return e;
};

/** Build the play screen into `root` and start its loop. Returns a disposer. */
export function mountPlay(o: PlayScreenOptions): { play: Play; target(): TargetState; dispose(): void } {
  const { t, root } = o;
  const play = createPlay(o.map, o.skill);
  const world = play.world;
  const skills = [...o.common, ...o.active];
  root.textContent = '';
  root.className = 'play';

  // --- HUD
  const hud = h('header', { class: 'hud' });
  const stat = (icon: string, label: string) => {
    const s = h('span', { class: 'stat', 'aria-label': label });
    s.append(h('span', { 'aria-hidden': 'true' }, icon));
    const v = h('b'); s.append(v); return [s, v] as const;
  };
  const [hpS, hpV] = stat('❤', t('hud.hp')), [cashS, cashV] = stat('💰', t('hud.cash'));
  const [waveS, waveV] = stat('🌊', t('hud.wave')), [lvS, lvV] = stat('Lv', t('hud.level'));
  const pumpsBtn = h('button', { class: 'hb', 'aria-label': t('hud.pumpsOff') }, '💧');
  const pauseBtn = h('button', { class: 'hb', 'aria-label': t('hud.pause'), 'aria-pressed': 'false' }, '⏸');
  const speedBtn = h('button', { class: 'hb', 'aria-label': t('hud.speed', { x: 1 }) }, '1×');
  const stats = h('div', { class: 'stats' }); stats.append(hpS, cashS, waveS);
  lvS.classList.add('lv');
  const btns = h('div', { class: 'hbtns' }); btns.append(pumpsBtn, pauseBtn, speedBtn);
  hud.append(stats, btns);
  const gaugeRow = h('div', { class: 'gauge-row' });
  const gauge = h('div', { class: 'gauge', role: 'meter', 'aria-label': t('hud.flood'), 'aria-valuemin': '0', 'aria-valuemax': '100' });
  const gaugeFill = h('div', { class: 'fill' }); gauge.append(gaugeFill);
  const gaugeText = h('span', { class: 'gauge-text' });
  gaugeRow.append(lvS, h('span', { 'aria-hidden': 'true' }, '🏠'), gauge, gaugeText);

  // --- board
  const boardWrap = h('div', { class: 'board-wrap' });
  const canvas = h('canvas', { class: 'board', role: 'img', 'aria-label': t('board.label') });
  const toastBox = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
  const startBtn = h('button', { class: 'start', 'aria-label': t('bar.start') }, '▶');
  boardWrap.append(canvas, toastBox, startBtn);

  // --- skill bar
  const bar = h('nav', { class: 'bar', 'aria-label': t('bar.label') });
  const skillBtns = new Map<string, HTMLButtonElement>();
  for (const s of skills) {
    const b = h('button', { class: s.slot === 'common' ? 'sk common' : 'sk', 'aria-label': t(s.i18n + '.name'), 'data-skill': s.id }, s.icon);
    if (s.slot === 'ultimate') b.classList.add('ult');
    skillBtns.set(s.id, b); bar.append(b);
  }
  for (let k = o.active.length; k < 4; k++) bar.append(h('button', { class: 'sk empty', disabled: '', 'aria-label': '—' }, ''));

  const panel = h('div', { class: 'panel' });
  panel.append(hud, gaugeRow, bar);
  root.append(boardWrap, panel);

  // --- render setup
  const make = (w: number, hh: number) => { const c = document.createElement('canvas'); c.width = w; c.height = hh; return c; };
  const board: Board = createBoard(canvas, world, o.map.zones, make);
  const fit = () => {
    const r = boardWrap.getBoundingClientRect();
    const { cssW, cssH } = fitBoard(r.width, r.height, world.grid.height / world.grid.width);
    sizeCanvas(canvas, cssW, cssH, devicePixelRatio || 1);
  };
  const ro = new ResizeObserver(fit); ro.observe(boardWrap); fit();

  // --- state
  let target: TargetState = IDLE;
  const toasts: ToastQueue = { items: [] };
  const toast = (s: string) => { pushToast(toasts, s, performance.now()); renderToasts(); };
  const renderToasts = () => {
    toastBox.textContent = '';
    for (const it of toasts.items) toastBox.append(h('div', { class: 'toast' }, it.text));
  };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const haptic = (pattern: number | number[]) => {
    if (typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
    else if (!reduced) { boardWrap.classList.remove('shake'); void boardWrap.offsetWidth; boardWrap.classList.add('shake'); } // iOS: 2px shake
  };
  const skillName = (id: string) => { const s = skills.find(k => k.id === id); return s ? t(s.i18n + '.name') : id; };

  const act = (a: TargetAction | null) => {
    if (!a) return;
    switch (a.t) {
      case 'use': send(play, { t: 'skill', id: a.skill, zone: a.zone, path: a.path }); haptic(10); break;
      case 'toggle': send(play, { t: 'toggle', kind: a.kind, id: a.id }); break;
      case 'info': toast(t('toast.zoneInfo', { type: t('zone.' + o.map.zones.zones[a.zone - 1].type) })); break;
      case 'cancel': toast(t('toast.cancel')); break;
      case 'needLongPress': toast(t('toast.longPress', { skill: skillName(a.skill) })); break;
    }
    syncButtons();
  };
  const syncButtons = () => {
    for (const [id, b] of skillBtns) b.classList.toggle('selected', target.mode === 'selecting' && target.skill === id);
  };

  // --- events from the game
  const onEvent = (e: PlayEvent) => {
    switch (e.t) {
      case 'refused':
        toast(t(e.reason === 'maxOn' ? 'toast.maxOn' : e.reason === 'noCash' ? 'toast.noCash' : e.reason === 'PAUSED' ? 'toast.paused'
          : e.reason === 'cashEmptyPumps' ? 'toast.cashEmptyPumps' : 'toast.notImplemented'));
        haptic([30, 30, 30]); break;
      case 'toggled': toast(t(e.kind === 'pump' ? (e.on ? 'toast.pumpOn' : 'toast.pumpOff') : (e.on ? 'toast.gateOpen' : 'toast.gateClosed'))); haptic(10); break;
      case 'skill': toast(t('toast.skillUsed', { skill: skillName(e.id) })); break;
      case 'waveStart': toast(t('toast.waveStart', { wave: e.wave })); target = IDLE; syncButtons(); break;
      case 'waveEnd': toast(t('toast.waveEnd', { wave: e.wave })); target = IDLE; syncButtons(); break;
      case 'damageStart': toast(t('toast.damage')); haptic(100); break;
      case 'collapse': toast(t('toast.collapse')); haptic(60); break;
      case 'defeat': toast(t('toast.defeat')); break;
      case 'result': toast(t('toast.result')); break;
      default: break;
    }
  };

  // --- input: board gestures
  const gt = createGestureTracker();
  const cellOf = (x: number, y: number) => toCell(canvas.getBoundingClientRect(), world.grid.width, world.grid.height, x, y);
  const handle = (g: Gesture | null) => {
    if (!g) return;
    if (g.t === 'swipe') {
      const cells: [number, number][] = [];
      for (const [x, y] of g.path) { const c = cellOf(x, y); if (c) cells.push(c); }
      let a: TargetAction | null; [target, a] = onBoardSwipe(target, cells, skills); act(a); return;
    }
    const c = cellOf(g.x, g.y);
    const hit = c ? hitTest(world, o.map.zones, c[0], c[1]) : { t: 'none' as const };
    if (g.t === 'tap') { let a: TargetAction | null; [target, a] = onBoardTap(target, hit, skills, o.map.zones.zones); act(a); }
  };
  canvas.addEventListener('pointerdown', e => { if (gt.down(e.pointerId, e.clientX, e.clientY, e.timeStamp)) canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => gt.move(e.pointerId, e.clientX, e.clientY, e.timeStamp));
  canvas.addEventListener('pointerup', e => handle(gt.up(e.pointerId, e.clientX, e.clientY, e.timeStamp)));
  canvas.addEventListener('pointercancel', () => gt.cancel());

  // --- input: skill buttons (tap / long press)
  for (const [id, b] of skillBtns) {
    const s = skills.find(k => k.id === id) as SkillView;
    let downAt = -1, longTimer = 0;
    b.addEventListener('pointerdown', e => {
      downAt = e.timeStamp;
      if (s.slot === 'ultimate') longTimer = window.setTimeout(() => { downAt = -1; let a: TargetAction | null; [target, a] = onSkillButton(target, s, true); act(a); }, 450);
    });
    const end = (e: PointerEvent, fire: boolean) => {
      clearTimeout(longTimer);
      if (downAt < 0) return;
      const held = e.timeStamp - downAt; downAt = -1;
      if (!fire || held >= 450) return;
      let a: TargetAction | null; [target, a] = onSkillButton(target, s, false);
      if (target.mode === 'selecting') toast(t('toast.pickTarget', { skill: skillName(s.id) }));
      act(a);
    };
    b.addEventListener('pointerup', e => end(e, true));
    b.addEventListener('pointerleave', e => end(e, false));
    b.addEventListener('contextmenu', e => e.preventDefault());
  }
  pumpsBtn.addEventListener('click', () => { send(play, { t: 'pumpsOff' }); toast(t('toast.allPumpsOff')); });
  const setPaused = (on: boolean) => {
    send(play, { t: 'pause', on });
    pauseBtn.textContent = on ? '▶' : '⏸';
    pauseBtn.setAttribute('aria-pressed', String(on));
    pauseBtn.setAttribute('aria-label', t(on ? 'hud.resume' : 'hud.pause'));
  };
  pauseBtn.addEventListener('click', () => setPaused(!play.paused));
  speedBtn.addEventListener('click', () => {
    const x = play.speed === 1 ? 2 : 1;
    send(play, { t: 'speed', x }); speedBtn.textContent = x + '×'; speedBtn.setAttribute('aria-label', t('hud.speed', { x }));
  });
  startBtn.addEventListener('click', () => send(play, { t: 'startWave' }));
  const onVis = () => { if (document.hidden && play.phase === 'wave' && !play.paused) { setPaused(true); toast(t('toast.autoPaused')); } };
  document.addEventListener('visibilitychange', onVis);
  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'Space') { e.preventDefault(); setPaused(!play.paused); }
    else if (e.key === 'Escape' && target.mode === 'selecting') { target = IDLE; act({ t: 'cancel' }); }
    else if (/^[1-6]$/.test(e.key)) { const s = skills[+e.key - 1]; if (s) { let a: TargetAction | null; [target, a] = onSkillButton(target, s, s.slot === 'ultimate'); act(a); } }
  };
  window.addEventListener('keydown', onKey);

  // --- loop
  const writeHud = createHud({ hp: hpV, cash: cashV, wave: waveV, level: lvV, gauge: gaugeFill, gaugeText });
  let raf = 0, last = performance.now(), lastPhase = '';
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    advance(play, Math.min(250, now - last)); last = now;
    for (const e of play.events) onEvent(e);
    play.events.length = 0;
    const r0 = performance.now();
    drawBoard(board, {
      highlight: target.mode === 'idle' ? target.highlight : 0,
      bright: brightZones(target, skills, o.map.zones.zones),
      arrows: play.phase === 'prepare', time: reduced ? 0 : now,
    });
    const renderMs = performance.now() - r0;
    writeHud({ hp: world.hp, cash: world.cash, wave: play.phase === 'prepare' ? world.wave + 1 : world.wave, waves: play.waves, level: play.level, flood: baseFlood(world), threshold: world.cfg.floodThreshold });
    if (play.phase !== lastPhase) { lastPhase = play.phase; root.dataset.phase = play.phase; startBtn.hidden = play.phase !== 'prepare'; }
    if (expireToasts(toasts, now)) renderToasts();
    o.onFrame?.(renderMs);
  };
  raf = requestAnimationFrame(frame);

  return {
    play,
    target: () => target,
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect();
      document.removeEventListener('visibilitychange', onVis); window.removeEventListener('keydown', onKey);
    },
  };
}
