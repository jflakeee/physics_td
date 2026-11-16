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
import { advanceSkills, barSkills, canUse, onWaveEnd, pumpUpkeep, resolveSkill, togglePump, useSkill, FAIL_TOAST } from '../../rules/skills.ts';
import type { SkillDef, SkillRuntime, UseContext } from '../../rules/skills.ts';
import { PUMP_LIMIT_TOAST } from '../../rules/skills.ts';
import { el } from '../dom.ts';
import { createHaptics } from '../haptics.ts';
import type { Translate } from '../i18n.ts';
import { createHud } from '../widgets/hud.ts';
import type { HudView } from '../widgets/hud.ts';
import { createSkillBar } from '../widgets/skillBar.ts';
import type { SkillButtonSpec } from '../widgets/skillBar.ts';
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
  /** Skill runtime (Story 003): the bar shows its common + active skills. */
  rt: SkillRuntime;
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
  readonly cash: number;
  readonly rt: SkillRuntime;
}

/**
 * Mount the play screen (spec 15.3) into `root` and start the fixed 30 tick/s loop.
 * Phases: wave (inflow running) -> prep (after the wave length, start button) -> wave ...;
 * over when hp hits 0.
 * @example const dbg = mountPlay(document.getElementById('app')!, { state, t, ... });
 */
export function mountPlay(root: HTMLElement, o: PlayOptions): PlayDebug {
  const { state, t, rt } = o;
  /** Bar entry: skill data plus the fields skill bar and targeting need. */
  interface BarSkill extends TargetSkill, SkillButtonSpec { def: SkillDef }
  const skills: BarSkill[] = barSkills(rt).map((def) => ({
    id: def.id, i18n: def.i18n, icon: def.icon, size: def.slot === 'common' ? 48 : 56, ultimate: def.slot === 'ultimate',
    target: def.target === 'zone' || def.target === 'swipe' ? 'zone' : 'global', def,
  }));
  const bySkillId = (sk: TargetSkill): BarSkill => skills.find((s) => s.id === sk.id) as BarSkill;
  let cash = o.cash;
  const useCtx = (): UseContext => ({ cash, paused });
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

  const view: HudView = { hp: state.hp, cash, wave: 0, waveMax: o.waveMax, level: o.level, flood: 0, paused, speed };
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

  // Swipe skills never take a zone tap: the board tap cancels them, the swipe gesture runs them.
  const canTarget = (sk: TargetSkill, z: number): boolean =>
    bySkillId(sk).def.target !== 'swipe' && canUse(rt, state, sk.id, useCtx(), { zone: z }).ok;
  const refreshDisabled = (): void => {
    for (const sk of skills) bar.setDisabled(sk.id, canUse(rt, state, sk.id, { cash: Infinity, paused: false }).ok === false);
  };
  const skillName = (sk: TargetSkill): string => t(`${bySkillId(sk).i18n}.name`);

  /** Run a skill through the rules layer; on failure show its toast and clear targeting. */
  function runSkill(sk: TargetSkill, target: { zone?: number; cells?: number[] }): void {
    const r = useSkill(rt, state, sk.id, useCtx(), target);
    if (!r.ok) return reject(r.toast ?? 'toast.badTarget');
    cash -= r.spent;
    bar.setArmed(null);
    refreshDisabled();
    haptic(HAPTIC_USE);
    toast(t('toast.used', { skill: skillName(sk) }));
  }

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
      case 'arm': {
        const r = canUse(rt, state, ev.skill.id, useCtx());
        if (!r.ok) return reject(r.toast ?? 'toast.badTarget');
        bar.setArmed(ev.skill.id);
        toast(t(bySkillId(ev.skill).def.target === 'swipe' ? 'toast.swipeTarget' : 'toast.selectTarget', { skill: skillName(ev.skill) }));
        break;
      }
      case 'cancel':
        bar.setArmed(null);
        toast(t('toast.cancelled'));
        break;
      case 'run':
        runSkill(ev.skill, ev.zone >= 0 ? { zone: ev.zone } : {});
        break;
      case 'toggle': {
        const r = togglePump(rt, state, ev.pump, useCtx());
        if (!r.ok) return reject(r.toast ?? PUMP_LIMIT_TOAST);
        haptic(HAPTIC_USE);
        toast(t(state.pumps[ev.pump].on ? 'toast.pumpOn' : 'toast.pumpOff'));
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
    onWaveEnd(rt, state);
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
  attachGestures(canvas, {
    onSwipe: (path) => {
      const sk = tg.skill;
      if (!sk || bySkillId(sk).def.target !== 'swipe') return;
      const rect = canvas.getBoundingClientRect();
      const cells: number[] = [];
      for (let k = 0; k + 1 < path.length; k += 2) {
        const c = cellAt(rect, path[k], path[k + 1]);
        if (c >= 0) cells.push(c);
      }
      tg.skill = null;
      runSkill(sk, { cells });
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
        cash = pumpUpkeep(rt, state, cash);
        advanceSkills(rt, state, phase);
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
    view.cash = Math.floor(cash);
    view.wave = wave;
    view.flood = flood / BASE_FLOOD_THRESHOLD;
    view.paused = paused;
    view.speed = speed;
    hud.update(view);
    if (tg.skill) {
      const swipe = bySkillId(tg.skill).def.target === 'swipe';
      for (let z = 0; z < ZONE_COUNT; z++) valid[z] = swipe || canTarget(tg.skill, z) ? 1 : 0;
    }
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
    get cash() {
      return cash;
    },
    rt,
  };
}
