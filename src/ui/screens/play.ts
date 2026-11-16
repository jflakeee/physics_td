import type { SimState } from '../../core/types.ts';
import { BASE_FLOOD_THRESHOLD, TICKS_PER_SEC, ZONE } from '../../sim/constants.ts';
import { planWave, startWave } from '../../sim/inflow.ts';
import { step } from '../../sim/step.ts';
import { attachGestures } from '../../input/gestures.ts';
import { NO_HIT, ZONE_COUNT, cellAt, hitTest, zoneType } from '../../input/hit.ts';
import { boardTap, cancelTargeting, createTargeting, skillLongPress, skillTap } from '../../input/targeting.ts';
import type { TargetEvent, TargetSkill } from '../../input/targeting.ts';
import { fitBoard } from '../../render/canvas.ts';
import { createBoard } from '../../render/board.ts';
import type { DemoSkill } from '../demoSkills.ts';
import { el } from '../dom.ts';
import { createHaptics } from '../haptics.ts';
import type { Translate } from '../i18n.ts';
import { createHud } from '../widgets/hud.ts';
import type { HudView } from '../widgets/hud.ts';
import { createSkillBar } from '../widgets/skillBar.ts';
import { createToaster } from '../widgets/toast.ts';

const TICK_MS = 1000 / TICKS_PER_SEC;
/** Accumulated time cap per frame (spec 18). */
const MAX_FRAME_MS = 100;
/** Max sim steps per frame: 2 at 1x, 4 at 2x (spec 18). */
const MAX_STEPS_PER_SPEED = 2;
/** Landscape: width kept for the right panel when sizing the board. */
const PANEL_MIN_W = 240;
/** Landscape height below which the HUD collapses to hp / cash / wave (spec 13.1). */
const SHORT_LANDSCAPE_H = 340;
const FRAME_SAMPLES = 240;

/** Haptic patterns (spec 17). */
const HAPTIC_USE = 10;
const HAPTIC_FAIL = [30, 30];

/** Inputs to the play screen. */
export interface PlayOptions {
  state: SimState;
  t: Translate;
  /** Map base inflow (wave volume scale). */
  i1: number;
  waveMax: number;
  skills: readonly DemoSkill[];
  /** Run values with no owning system yet (economy / leveling arrive in later stories). */
  cash: number;
  level: number;
}

/** Render frame time summary in ms. */
export interface FrameStats {
  count: number;
  avg: number;
  p95: number;
  max: number;
}

/** Debug surface exposed as `window.__v2`. */
export interface PlayDebug {
  state: SimState;
  frameStats(): FrameStats;
  resetFrameStats(): void;
  readonly paused: boolean;
  readonly speed: 1 | 2;
  readonly phase: 'wave' | 'prep' | 'over';
  readonly selectedZone: number;
  readonly armedSkill: string | null;
}

/**
 * Mount the play screen (spec 15.3) into `root` and start the fixed 30 tick/s loop.
 * Phases: wave (inflow running) -> prep (after the wave length, start button) -> wave ...;
 * over when hp hits 0.
 * @example const dbg = mountPlay(document.getElementById('app')!, { state, t, ... });
 */
export function mountPlay(root: HTMLElement, o: PlayOptions): PlayDebug {
  const { state, t, skills } = o;
  const zoneNames: string[] = [];
  for (const [k, v] of Object.entries(ZONE)) zoneNames[v] = k;

  root.textContent = '';
  const hudEl = el('header', 'hud');
  const wrap = el('main', 'board-wrap');
  const canvas = el('canvas');
  canvas.id = 'board';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', t('board.label'));
  const startBtn = el('button', 'start');
  startBtn.hidden = true;
  const nav = el('nav', 'skills');
  nav.setAttribute('aria-label', t('skill.bar'));
  wrap.append(canvas, startBtn);
  root.append(hudEl, wrap, nav);

  const toast = createToaster(wrap);
  const haptic = createHaptics(wrap);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const board = createBoard(canvas, state);
  const tg = createTargeting();
  const valid = new Uint8Array(ZONE_COUNT);

  let paused = false;
  let speed: 1 | 2 = 1;
  let phase: 'wave' | 'prep' | 'over' = 'prep';
  let wave = 0;
  let acc = 0;
  let last = -1;

  const view: HudView = { hp: state.hp, cash: o.cash, wave: 0, waveMax: o.waveMax, level: o.level, flood: 0, paused, speed };
  const hud = createHud(hudEl, t, {
    onPause: () => setPaused(!paused),
    onSpeed: () => {
      speed = speed === 1 ? 2 : 1;
    },
  });
  const bar = createSkillBar(nav, skills, t, {
    onTap: (sk) => handle(skillTap(tg, sk)),
    onLongPress: (sk) => handle(skillLongPress(tg, sk)),
  });

  const canTarget = (sk: TargetSkill, z: number): boolean => (sk as DemoSkill).canTarget(state, z);
  const refreshDisabled = (): void => {
    for (const sk of skills) {
      if (sk.target !== 'zone') continue;
      let any = false;
      for (let z = 0; z < ZONE_COUNT && !any; z++) any = sk.canTarget(state, z);
      bar.setDisabled(sk.id, !any);
    }
  };
  const skillName = (sk: TargetSkill): string => t(`${(sk as DemoSkill).i18n}.name`);

  function setPaused(on: boolean): void {
    paused = on;
    acc = 0;
  }

  function reject(key: string): void {
    cancelTargeting(tg);
    bar.setArmed(null);
    toast(t(key));
    haptic(HAPTIC_FAIL);
  }

  /** Turn a targeting event into effects. Commands are applied between ticks. */
  function handle(ev: TargetEvent): void {
    const acts = ev.t === 'arm' || ev.t === 'run' || ev.t === 'toggle';
    if (acts && phase === 'over') return reject('toast.gameOver');
    if (acts && paused) return reject('toast.paused');
    switch (ev.t) {
      case 'select':
        toast(t('toast.zoneInfo', { type: t(`zone.type.${zoneNames[zoneType(state.grid, ev.zone)]}`) }));
        break;
      case 'deselect':
        break;
      case 'arm':
        bar.setArmed(ev.skill.id);
        toast(t('toast.selectTarget', { skill: skillName(ev.skill) }));
        break;
      case 'cancel':
        bar.setArmed(null);
        toast(t('toast.cancelled'));
        break;
      case 'run':
        bar.setArmed(null);
        (ev.skill as DemoSkill).apply(state, ev.zone);
        refreshDisabled();
        haptic(HAPTIC_USE);
        toast(t('toast.used', { skill: skillName(ev.skill) }));
        break;
      case 'toggle': {
        const p = state.pumps[ev.pump];
        p.on = !p.on;
        haptic(HAPTIC_USE);
        toast(t(p.on ? 'toast.pumpOn' : 'toast.pumpOff'));
        break;
      }
      case 'needLongPress':
        toast(t('toast.longPress'));
        break;
    }
  }

  function beginWave(): void {
    wave++;
    startWave(state, planWave(o.i1, wave, { inletCount: state.inlets.length }));
    phase = 'wave';
    startBtn.hidden = true;
    toast(t('toast.waveStart', { n: wave }));
  }

  function endWave(): void {
    phase = 'prep';
    if (tg.skill) handle(cancelTargeting(tg));
    toast(t('toast.waveEnd', { n: wave }));
    if (wave < o.waveMax) {
      startBtn.textContent = t('play.startWave', { n: wave + 1 });
      startBtn.hidden = false;
    }
  }

  startBtn.addEventListener('click', beginWave);
  attachGestures(canvas, {
    onTap: (x, y) => {
      const cell = cellAt(canvas.getBoundingClientRect(), x, y);
      handle(boardTap(tg, cell < 0 ? NO_HIT : hitTest(state, cell), canTarget));
    },
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === ' ') {
      e.preventDefault();
      setPaused(!paused);
    } else if (e.key === 'Escape') {
      if (tg.skill) handle(cancelTargeting(tg));
    } else if (e.key >= '1' && e.key <= '9') {
      const sk = skills[Number(e.key) - 1];
      if (sk) handle(skillTap(tg, sk));
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !paused) {
      setPaused(true);
      toast(t('toast.autoPaused'));
    }
  });

  function fit(): void {
    const land = window.innerWidth > window.innerHeight;
    root.classList.toggle('land', land);
    root.classList.toggle('short', land && window.innerHeight < SHORT_LANDSCAPE_H);
    const size = land
      ? fitBoard(canvas, window.innerWidth - PANEL_MIN_W, root.clientHeight)
      : fitBoard(canvas, wrap.clientWidth, wrap.clientHeight);
    wrap.style.width = land ? `${size.cssW}px` : '';
    board.resize(size);
  }
  window.addEventListener('resize', fit);
  fit();

  const samples = new Float64Array(FRAME_SAMPLES);
  let sampleCount = 0;

  function frame(now: number): void {
    const dt = last < 0 ? 0 : Math.min(now - last, MAX_FRAME_MS);
    last = now;
    if (!paused && phase !== 'over') {
      acc += dt * speed;
      const maxSteps = MAX_STEPS_PER_SPEED * speed;
      let n = 0;
      while (acc >= TICK_MS && n < maxSteps) {
        step(state);
        acc -= TICK_MS;
        n++;
        if (state.hp <= 0) {
          phase = 'over';
          if (tg.skill) handle(cancelTargeting(tg));
          toast(t('toast.defeat'));
          break;
        }
        if (phase === 'wave' && state.inflow && state.waveTick >= state.inflow.len) endWave();
      }
      if (acc > TICK_MS) acc = TICK_MS;
    }

    const t0 = performance.now();
    let flood = 0;
    for (const c of state.base) flood += state.grid.w[c];
    view.hp = state.hp;
    view.wave = wave;
    view.flood = flood / BASE_FLOOD_THRESHOLD;
    view.paused = paused;
    view.speed = speed;
    hud.update(view);
    if (tg.skill) for (let z = 0; z < ZONE_COUNT; z++) valid[z] = canTarget(tg.skill, z) ? 1 : 0;
    board.render(state, tg.zone, tg.skill ? valid : null, reducedMotion.matches ? 0 : now);
    samples[sampleCount++ % FRAME_SAMPLES] = performance.now() - t0;
    requestAnimationFrame(frame);
  }

  refreshDisabled();
  beginWave();
  requestAnimationFrame(frame);

  return {
    state,
    frameStats(): FrameStats {
      const n = Math.min(sampleCount, FRAME_SAMPLES);
      const xs = Array.from(samples.subarray(0, n)).sort((a, b) => a - b);
      const sum = xs.reduce((s, x) => s + x, 0);
      return { count: n, avg: n ? sum / n : 0, p95: n ? xs[Math.min(n - 1, Math.floor(n * 0.95))] : 0, max: n ? xs[n - 1] : 0 };
    },
    resetFrameStats(): void {
      sampleCount = 0;
    },
    get paused() {
      return paused;
    },
    get speed() {
      return speed;
    },
    get phase() {
      return phase;
    },
    get selectedZone() {
      return tg.zone;
    },
    get armedSkill() {
      return tg.skill ? tg.skill.id : null;
    },
  };
}
