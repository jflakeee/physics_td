import type { LoadedMap } from '../../game/map.ts';
import { advance, createPlay, send } from '../../game/play.ts';
import type { Play, PlayEvent, PlayOptions, SkillHandler } from '../../game/play.ts';
import { createBoard, drawBoard, refreshTerrain } from '../../render/board.ts';
import { cooldownTicks } from '../../rules/skills.ts';
import { REFUSAL_TOAST } from '../../rules/types.ts';
import type { Refusal } from '../../rules/types.ts';
import { skillViews } from '../skillViews.ts';
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
import * as tut from '../../game/tutorial.ts';
import { createLevelUp } from './levelUp.ts';
import type { CharacterDef } from '../../rules/types.ts';
import type { Tutorial } from '../../game/tutorial.ts';

/**
 * Play screen (DETAILED_DESIGN_V2 §15.3, GD §9.3): HUD / board / skill bar on one screen,
 * zone-tap control, pause, 1×/2×, auto-pause when hidden. DOM-only glue; the logic lives in
 * game/, input/ and render/.
 */

export interface PlayScreenOptions {
  root: HTMLElement;
  map: LoadedMap;
  t: T;
  /** Buttons when no rules are given (otherwise derived from the rules state). */
  common?: SkillView[];
  active?: SkillView[];
  skill?: SkillHandler;
  rules?: PlayOptions['rules'];
  /** Characters (card colours / home weighting) and fusions for the draft. */
  chars?: readonly CharacterDef[];
  fusions?: PlayOptions['fusions'];
  seed?: number;
  /** A fusion fired (codex). */
  onFusion?: (id: string) => void;
  /** First-play tutorial (둑마을); progress is reported through `onTutorial`. */
  tutorial?: Tutorial;
  onTutorial?: (step: number) => void;
  /** Leave the screen: back to map select, or restart the same map from scratch. */
  onExit?: (to: 'mapSelect' | 'restart') => void;
  /** All waves cleared. */
  onClear?: () => void;
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
  const play = createPlay(o.map, { skill: o.skill, rules: o.rules, chars: o.chars, fusions: o.fusions, seed: o.seed });
  const world = play.world;
  const [common, active] = play.rules ? skillViews(play.rules) : [o.common ?? [], o.active ?? []];
  const skills = [...common, ...active];
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
  const lvBadge = h('span', { class: 'lvbadge', 'aria-live': 'polite' });
  lvBadge.hidden = true;
  gaugeRow.append(lvS, lvBadge, h('span', { 'aria-hidden': 'true' }, '🏠'), gauge, gaugeText);

  // --- board
  const boardWrap = h('div', { class: 'board-wrap' });
  const canvas = h('canvas', { class: 'board', role: 'img', 'aria-label': t('board.label') });
  const toastBox = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
  const startBtn = h('button', { class: 'start', 'aria-label': t('bar.start') }, '▶');
  const bubble = h('div', { class: 'bubble', role: 'dialog', 'aria-live': 'polite' });
  const bubbleText = h('p');
  const bubbleNext = h('button', { class: 'bnext' }, t('tutorial.next'));
  const bubbleSkip = h('button', { class: 'bskip' }, t('tutorial.skip'));
  bubble.append(bubbleText, bubbleNext, bubbleSkip);
  bubble.hidden = true;
  const overlay = h('div', { class: 'overlay', role: 'dialog' });
  overlay.hidden = true;
  const levelUp = play.rules && play.draft ? createLevelUp(play, t, o.chars ?? []) : null;
  boardWrap.append(canvas, toastBox, startBtn, bubble, overlay);
  if (levelUp) boardWrap.append(levelUp.el);

  // --- skill bar
  const bar = h('nav', { class: 'bar', 'aria-label': t('bar.label') });
  const skillBtns = new Map<string, HTMLButtonElement>();
  for (const s of skills) {
    const b = h('button', { class: s.slot === 'common' ? 'sk common' : 'sk', 'aria-label': t(s.i18n + '.name'), 'data-skill': s.id });
    b.append(h('span', { class: 'ico', 'aria-hidden': 'true' }, s.icon));
    if (s.slot === 'ultimate') b.classList.add('ult');
    skillBtns.set(s.id, b); bar.append(b);
  }
  for (let k = active.length; k < 4; k++) bar.append(h('button', { class: 'sk empty', disabled: '', 'aria-label': '—' }, ''));

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

  // --- defeat / result overlay
  const showOverlay = (kind: 'defeat' | 'result') => {
    overlay.textContent = '';
    overlay.append(h('h2', {}, t(kind + '.title')));
    const btn = (label: string, fn: () => void, cls = '') => { const b = h('button', { class: cls }, label); b.addEventListener('click', fn); overlay.append(b); };
    if (kind === 'defeat') {
      btn(t('defeat.retry'), () => send(play, { t: 'retry' }), 'primary');
      btn(t('defeat.restart'), () => o.onExit?.('restart'));
    } else btn(t('result.again'), () => o.onExit?.('restart'), 'primary');
    btn(t('common.mapSelect'), () => o.onExit?.('mapSelect'));
    overlay.hidden = false;
  };

  // --- tutorial
  const T0 = o.tutorial ?? null;
  let lastTut = '';
  const syncTutorial = () => {
    if (!T0) return;
    const show = T0.step <= tut.TUTORIAL_STEPS && tut.visible(T0, play);
    const key = show ? T0.step + ':' + play.phase : '';
    if (key !== lastTut) {
      lastTut = key;
      bubble.hidden = !show;
      if (show) { bubbleText.textContent = t('tutorial.' + T0.step); bubbleNext.hidden = !tut.tapToContinue(T0, play); }
      root.dataset.tutorial = show ? String(T0.step) : '';
      o.onTutorial?.(T0.step);
    }
    if (tut.speedLocked(T0) && play.speed !== 1) { send(play, { t: 'speed', x: 1 }); speedBtn.textContent = '1×'; }
    speedBtn.disabled = tut.speedLocked(T0);
  };
  bubbleNext.addEventListener('click', () => { if (T0) { tut.onTap(T0, play); syncTutorial(); } });
  bubbleSkip.addEventListener('click', () => { if (T0) { tut.skip(T0); syncTutorial(); } });

  // --- events from the game
  const onEvent = (e: PlayEvent) => {
    switch (e.t) {
      case 'refused': {
        const key = e.reason === 'maxOn' ? 'toast.maxOn' : e.reason === 'noCash' ? 'toast.noCash'
          : e.reason === 'cashEmptyPumps' ? 'toast.cashEmptyPumps' : REFUSAL_TOAST[e.reason as Refusal] ?? null;
        if (key) toast(t(key));
        haptic([30, 30, 30]); break;
      }
      case 'income': toast(t('toast.income', { amount: e.amount })); break;
      case 'zoneChanged': refreshTerrain(board, make); break;
      case 'toggled': toast(t(e.kind === 'pump' ? (e.on ? 'toast.pumpOn' : 'toast.pumpOff') : (e.on ? 'toast.gateOpen' : 'toast.gateClosed'))); haptic(10); break;
      case 'skill': toast(t('toast.skillUsed', { skill: skillName(e.id) })); break;
      case 'waveStart': toast(t('toast.waveStart', { wave: e.wave })); target = IDLE; syncButtons(); break;
      case 'waveEnd': toast(t('toast.waveEnd', { wave: e.wave })); target = IDLE; syncButtons(); break;
      case 'damageStart': toast(t('toast.damage')); haptic(100); break;
      case 'collapse': toast(t('toast.collapse')); haptic(60); break;
      case 'lakeWarning': toast(t('toast.lakeWarning')); haptic([30, 30, 30]); break;
      case 'lakeBurst': toast(t('toast.lakeBurst')); haptic(100); break;
      case 'retried': toast(t('toast.retried', { wave: e.wave })); overlay.hidden = true; break;
      case 'levelUp': toast(t('toast.levelUp', { lv: e.level })); haptic(20); break;
      case 'fusion': toast(t('fusion.toast', { name: t('fusion.' + e.id.replace(/-(\w)/g, (_, c: string) => c.toUpperCase()) + '.name') })); haptic([20, 40]); o.onFusion?.(e.id); break;
      case 'defeat': showOverlay('defeat'); break;
      case 'result': showOverlay('result'); o.onClear?.(); break;
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

  // --- cooldown ring / gauge (written only on change, 1% steps)
  const lastVis: Record<string, string> = {};
  const syncSkillState = () => {
    const rs = play.rules!;
    for (const [id, b] of skillBtns) {
      const def = rs.defs.get(id)!;
      let v: string;
      if (def.slot === 'ultimate') v = 'g' + Math.floor(rs.gauge);
      else { const total = def.cooldown * world.cfg.tps; v = 'c' + (total ? Math.ceil(cooldownTicks(rs, id) / total * 100) : 0); }
      if (lastVis[id] === v) continue;
      lastVis[id] = v;
      const pct = +v.slice(1);
      if (v[0] === 'g') { b.style.setProperty('--g', pct + '%'); b.classList.toggle('ready', pct >= 100); }
      else { b.style.setProperty('--cd', pct + '%'); b.classList.toggle('cooling', pct > 0); }
    }
  };

  const tutorialBright = (): Set<number> | null => {
    if (!T0 || T0.step !== 2 || !play.rules) return null;
    const blink = Math.floor(performance.now() / 500) % 2 === 0;
    if (!blink) return null;
    const v = skills.find(k => k.id === 'build-levee');
    return v ? new Set(o.map.zones.zones.filter(z => v.canTarget?.(z.id)).map(z => z.id)) : null;
  };

  // --- level-up waiting badge (§6.3): count during waves; last wave → "converted to score"
  let lastBadge = '';
  const syncBadge = () => {
    const ss = play.score;
    if (!ss) return;
    const v = ss.lateLevels > 0 ? 'L' + ss.lateLevels : play.phase === 'wave' && ss.pending > 0 ? 'P' + ss.pending : '';
    if (v === lastBadge) return;
    lastBadge = v;
    lvBadge.hidden = !v;
    lvBadge.textContent = v[0] === 'L' ? '⬆ ' + t('levelUp.badgeLast') : v ? '⬆' + '●'.repeat(Math.min(5, ss.pending)) : '';
    lvBadge.setAttribute('aria-label', v[0] === 'L' ? t('levelUp.badgeLast') : t('levelUp.badge', { n: ss.pending }));
  };

  // --- loop
  const writeHud = createHud({ hp: hpV, cash: cashV, wave: waveV, level: lvV, gauge: gaugeFill, gaugeText });
  let raf = 0, last = performance.now(), lastPhase = '';
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const ticked = advance(play, Math.min(250, now - last)); last = now;
    if (T0) for (let k = 0; k < ticked; k++) tut.onTick(T0, play);
    for (const e of play.events) { onEvent(e); if (T0) tut.onEvent(T0, e); }
    play.events.length = 0;
    syncTutorial();
    const r0 = performance.now();
    drawBoard(board, {
      highlight: target.mode === 'idle' ? target.highlight : 0,
      bright: brightZones(target, skills, o.map.zones.zones) ?? tutorialBright(),
      arrows: play.phase === 'prepare', time: reduced ? 0 : now,
    });
    const renderMs = performance.now() - r0;
    writeHud({ hp: world.hp, cash: world.cash, wave: play.phase === 'prepare' ? world.wave + 1 : world.wave, waves: play.waves, level: play.level, flood: baseFlood(world), threshold: world.cfg.floodThreshold });
    if (play.phase !== lastPhase) { lastPhase = play.phase; root.dataset.phase = play.phase; startBtn.hidden = play.phase !== 'prepare'; }
    if (play.phase === 'levelup' && target.mode === 'selecting') { target = IDLE; syncButtons(); }
    if (play.rules) syncSkillState();
    levelUp?.sync();
    syncBadge();
    if (expireToasts(toasts, now)) renderToasts();
    o.onFrame?.(renderMs);
  };
  raf = requestAnimationFrame(frame);

  return {
    play,
    target: () => target,
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect(); root.textContent = '';
      document.removeEventListener('visibilitychange', onVis); window.removeEventListener('keydown', onKey);
    },
  };
}
