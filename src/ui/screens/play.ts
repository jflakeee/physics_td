import type { LoadedMap } from '../../game/map.ts';
import { advance, createPlay, send } from '../../game/play.ts';
import type { Play, PlayEvent, PlayOptions, SkillHandler, Speed } from '../../game/play.ts';
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
import { damageShares } from '../../sim/trace.ts';
import { createHud } from '../widgets/hud.ts';
import { expireToasts, pushToast } from '../widgets/toast.ts';
import type { ToastQueue } from '../widgets/toast.ts';
import type { T } from '../i18n.ts';
import * as tut from '../../game/tutorial.ts';
import { createLevelUp } from './levelUp.ts';
import { renderDefeat } from './defeat.ts';
import { renderResult } from './result.ts';
import type { RunResult } from '../../game/result.ts';
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
  /** Leave the screen: map select, the same map again, the other character, or the next map. */
  onExit?: (to: 'mapSelect' | 'restart' | 'otherChar' | 'nextMap') => void;
  /** All waves cleared: compute + record the result; returns what the result screen shows. */
  onResult?: (play: Play) => { result: RunResult; codex: { n: number; max: number }; hasNext: boolean; extras?: string[] };
  /** Story line shown when a wave starts (i18n text, or null). */
  waveLine?: (wave: number) => string | null;
  /** Persist a snapshot (prepare entry, after a draft pick, background). */
  onSave?: (play: Play) => void;
  /** Player settings: haptics off, reduced motion forced on/off, left-hand skill bar. */
  settings?: { haptics: boolean; reducedMotion: 'auto' | 'on' | 'off'; leftHand: boolean };
  /** Runs after the play is created and before rendering starts (resume). */
  beforeMount?: (play: Play) => void;
  /** Notices to show once on entry (save problems). */
  notices?: string[];
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
  o.beforeMount?.(play); // e.g. restore a saved run before the board is drawn
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
  const routeBtn = h('button', { class: 'hb', 'aria-label': '펌프 배출 위치 설정', 'aria-pressed': 'false', title: '펌프 선택 → 배출 위치 선택' }, '🚰');
  const pauseBtn = h('button', { class: 'hb', 'aria-label': t('hud.pause'), 'aria-pressed': 'false' }, '⏸');
  const speedBtn = h('button', { class: 'hb', 'aria-label': t('hud.speed', { x: 1 }) }, '1×');
  const stats = h('div', { class: 'stats' }); stats.append(hpS, cashS, waveS);
  lvS.classList.add('lv');
  const btns = h('div', { class: 'hbtns' }); btns.append(pumpsBtn, routeBtn, pauseBtn, speedBtn);
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
  let routePump: number | null = null;
  let routing = false;
  const resetRoute = () => { routing = false; routePump = null; routeBtn.setAttribute('aria-pressed', 'false'); };
  const toasts: ToastQueue = { items: [] };
  const toast = (s: string) => { pushToast(toasts, s, performance.now()); renderToasts(); };
  const renderToasts = () => {
    toastBox.textContent = '';
    for (const it of toasts.items) toastBox.append(h('div', { class: 'toast' }, it.text));
  };
  const rm = o.settings?.reducedMotion ?? 'auto';
  const reduced = rm === 'on' || (rm === 'auto' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  root.classList.toggle('reduced-motion', reduced);
  root.classList.toggle('left-hand', !!o.settings?.leftHand);
  const haptic = (pattern: number | number[]) => {
    if (o.settings && !o.settings.haptics) return;
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

  // --- flood cause for the defeat screen (source tracer, §15.5)
  const floodCauses = (): { label: string; share: number; kind: 'inlet' | 'rain' | 'ice' }[] => {
    const tr = world.trace;
    if (!tr) return [];
    const sh = damageShares(tr), W = world.grid.width, H = world.grid.height;
    return sh.map((share, k) => {
      if (k === tr.rain) return { label: t('cause.rain'), share, kind: 'rain' as const };
      if (k === tr.ice) return { label: t('cause.ice'), share, kind: 'ice' as const };
      const c = world.inlets[k].cells[0], x = c % W, y = (c / W) | 0;
      const dir = y === 0 ? 'N' : y === H - 1 ? 'S' : x === 0 ? 'W' : 'E';
      return { label: t('cause.inlet', { dir: t('dir.' + dir) }), share, kind: 'inlet' as const };
    });
  };

  // --- defeat / result screens
  const showOverlay = (kind: 'defeat' | 'result') => {
    if (kind === 'defeat') {
      renderDefeat(overlay, t, { retry: () => send(play, { t: 'retry' }), restart: () => o.onExit?.('restart'), mapSelect: () => o.onExit?.('mapSelect') }, floodCauses());
      return;
    }
    const r = o.onResult?.(play);
    if (!r) { overlay.hidden = false; return; }
    renderResult(overlay, r.result, t, r.codex, {
      again: () => o.onExit?.('restart'), otherChar: () => o.onExit?.('otherChar'),
      nextMap: () => o.onExit?.('nextMap'), mapSelect: () => o.onExit?.('mapSelect'),
    }, r.hasNext, r.extras);
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
      case 'pumpDischargeSet': toast(e.cell === null ? '펌프 외부 배출로 변경' : '펌프 배출 위치 설정 완료'); break;
      case 'income': toast(t('toast.income', { amount: e.amount })); break;
      case 'zoneChanged': refreshTerrain(board, make); break;
      case 'toggled': toast(t(e.kind === 'pump' ? (e.on ? 'toast.pumpOn' : 'toast.pumpOff') : (e.on ? 'toast.gateOpen' : 'toast.gateClosed'))); haptic(10); break;
      case 'skill': toast(t('toast.skillUsed', { skill: skillName(e.id) })); break;
      case 'waveStart': {
        toast(t('toast.waveStart', { wave: e.wave }));
        const line = o.waveLine?.(e.wave);
        if (line) toast(line);
        target = IDLE; syncButtons(); o.onSave?.(play); break;
      }
      case 'waveEnd': toast(t('toast.waveEnd', { wave: e.wave })); target = IDLE; syncButtons(); break;
      case 'damageStart': toast(t('toast.damage')); haptic(100); break;
      case 'collapse': toast(t('toast.collapse')); haptic(60); break;
      case 'lakeWarning': toast(t('toast.lakeWarning')); haptic([30, 30, 30]); break;
      case 'lakeBurst': toast(t('toast.lakeBurst')); haptic(100); break;
      case 'retried': toast(t('toast.retried', { wave: e.wave })); overlay.hidden = true; overlay.className = 'overlay'; break;
      case 'levelUp': toast(t('toast.levelUp', { lv: e.level })); haptic(20); break;
      case 'fusion': toast(t('fusion.toast', { name: t('fusion.' + e.id.replace(/-(\w)/g, (_, c: string) => c.toUpperCase()) + '.name') })); haptic([20, 40]); o.onFusion?.(e.id); break;
      case 'defeat': showOverlay('defeat'); break;
      case 'result': showOverlay('result'); break;
      case 'cardPicked': o.onSave?.(play); break;
      default: break;
    }
  };

  // --- input: board gestures
  const gt = createGestureTracker();
  const cellOf = (x: number, y: number) => toCell(canvas.getBoundingClientRect(), world.grid.width, world.grid.height, x, y);
  const handle = (g: Gesture | null) => {
    if (!g) return;
    if (routing && g.t === 'swipe') return;
    if (g.t === 'swipe') {
      const cells: [number, number][] = [];
      for (const [x, y] of g.path) { const c = cellOf(x, y); if (c) cells.push(c); }
      let a: TargetAction | null; [target, a] = onBoardSwipe(target, cells, skills); act(a); return;
    }
    const c = cellOf(g.x, g.y);
    const hit = c ? hitTest(world, o.map.zones, c[0], c[1]) : { t: 'none' as const };
    if (g.t === 'tap') {
      if (routing) {
        if (routePump === null) {
          if (hit.t !== 'pump') { toast('배출할 펌프를 먼저 선택하세요'); return; }
          routePump = hit.id; toast('배출 위치를 지도에서 선택하세요'); return;
        }
        if (!c) { toast('지도 안의 위치를 선택하세요'); return; }
        send(play, { t: 'pumpDischarge', id: routePump, cell: c[1] * world.grid.width + c[0] });
        resetRoute(); return;
      }
      let a: TargetAction | null; [target, a] = onBoardTap(target, hit, skills, o.map.zones.zones); act(a);
    }
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
  routeBtn.addEventListener('click', () => {
    if (routing) { resetRoute(); toast('배출 위치 설정 취소'); return; }
    routing = true; routePump = null; target = IDLE; syncButtons();
    routeBtn.setAttribute('aria-pressed', 'true'); toast('펌프를 터치한 다음 배출 위치를 선택하세요');
  });
  const setPaused = (on: boolean) => {
    send(play, { t: 'pause', on });
    pauseBtn.textContent = on ? '▶' : '⏸';
    pauseBtn.setAttribute('aria-pressed', String(on));
    pauseBtn.setAttribute('aria-label', t(on ? 'hud.resume' : 'hud.pause'));
  };
  pauseBtn.addEventListener('click', () => setPaused(!play.paused));
  speedBtn.addEventListener('click', () => {
    const x: Speed = play.speed === 1 ? 2 : play.speed === 2 ? 0.5 : 1; // 1× → 2× → 0.5× → 1×
    send(play, { t: 'speed', x }); speedBtn.textContent = x + '×'; speedBtn.setAttribute('aria-label', t('hud.speed', { x }));
  });
  startBtn.addEventListener('click', () => send(play, { t: 'startWave' }));
  const onVis = () => {
    if (!document.hidden) return;
    if (play.phase === 'wave' && !play.paused) { setPaused(true); toast(t('toast.autoPaused')); }
    o.onSave?.(play); // background: the host saves the latest prepare-time snapshot
  };
  document.addEventListener('visibilitychange', onVis);
  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'Space') { e.preventDefault(); setPaused(!play.paused); }
    else if (e.key === 'Escape' && routing) { resetRoute(); toast('배출 위치 설정 취소'); }
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

  for (const n of o.notices ?? []) toast(n);

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
      flood: play.phase === 'wave' || play.phase === 'defeat' ? baseFlood(world) / world.cfg.floodThreshold : 0,
      calm: play.phase === 'prepare' && world.wave > 0,
    });
    // Discharge markers: outlined cyan circles distinguish destinations from pump sites.
    for (const pump of world.pumps) {
      const dest = pump.dischargeCell;
      if (dest === undefined || dest < 0 || dest >= world.grid.w.length) continue;
      const x = dest % world.grid.width, y = (dest / world.grid.width) | 0;
      const cx = (x + 0.5) * canvas.width / world.grid.width;
      const cy = (y + 0.5) * canvas.height / world.grid.height;
      const radius = Math.max(4, canvas.width / world.grid.width * 1.8);
      board.ctx.save(); board.ctx.strokeStyle = '#58f0ff'; board.ctx.lineWidth = Math.max(2, radius / 3);
      board.ctx.beginPath(); board.ctx.arc(cx, cy, radius, 0, Math.PI * 2); board.ctx.stroke(); board.ctx.restore();
    }
    const renderMs = performance.now() - r0;
    writeHud({ hp: world.hp, cash: world.cash, wave: play.phase === 'prepare' ? world.wave + 1 : world.wave, waves: play.waves, level: play.level, flood: baseFlood(world), threshold: world.cfg.floodThreshold });
    if (play.phase !== lastPhase) {
      if (play.phase === 'prepare' && lastPhase !== '') o.onSave?.(play); // prepare entry
      lastPhase = play.phase; root.dataset.phase = play.phase; startBtn.hidden = play.phase !== 'prepare';
    }
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
