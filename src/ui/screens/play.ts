import type { SimState } from '../../core/types.ts';
import { BASE_FLOOD_THRESHOLD, FLAG_LAKE_DAM, TICKS_PER_SEC, ZONE } from '../../sim/constants.ts';
import { beginWave as machineBeginWave, retryWave, runSkill as machineRunSkill, runToggleGate, runTogglePump, tickRun } from '../../game/machine.ts';
import type { Run } from '../../game/machine.ts';
import { tutorialEvent, tutorialShown } from '../../game/tutorial.ts';
import type { Tutorial, TutorialEvent } from '../../game/tutorial.ts';
import { attachGestures } from '../../input/gestures.ts';
import { NO_HIT, cellAt, hitTest, zoneType } from '../../input/hit.ts';
import { boardTap, cancelTargeting, createTargeting, skillLongPress, skillTap } from '../../input/targeting.ts';
import type { TargetEvent, TargetSkill } from '../../input/targeting.ts';
import { fitBoard } from '../../render/canvas.ts';
import { createBoard } from '../../render/board.ts';
import { barSkills, canUse } from '../../rules/skills.ts';
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
import { mountLevelUp } from './levelUp.ts';

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
  /** The run (map, sim, skills, cash, level, phase) driven through `game/machine.ts`. */
  run: Run;
  t: Translate;
  /** Tutorial state when this play is the first 둑마을 play, else null. */
  tutorial: Tutorial | null;
  /** Called once when the tutorial finishes or is skipped. */
  onTutorialDone(): void;
  /** Back to the map list. */
  onExit(): void;
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
  readonly phase: Run['phase'];
  readonly run: Run;
  readonly tutorialStep: number;
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
  const { run, t } = o;
  const { state, rt } = run;
  const tut = o.tutorial;
  /** Bar entry: skill data plus the fields skill bar and targeting need. */
  interface BarSkill extends TargetSkill, SkillButtonSpec { def: SkillDef }
  const barSpecs = (): BarSkill[] => barSkills(rt).map((def) => ({
    id: def.id, i18n: def.i18n, icon: def.icon, size: def.slot === 'common' ? 48 : 56, ultimate: def.slot === 'ultimate',
    target: def.target === 'zone' || def.target === 'swipe' ? 'zone' : 'global', def,
  }));
  let skills = barSpecs();
  const bySkillId = (sk: TargetSkill): BarSkill => skills.find((s) => s.id === sk.id) as BarSkill;
  const useCtx = (): UseContext => ({ cash: run.cash, paused });
  const over = (): boolean => run.phase === 'defeat' || run.phase === 'result';
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
  const bubble = el('div', 'bubble');
  bubble.hidden = true;
  const bubbleText = el('p', 'bubble-text');
  const skipBtn = el('button', 'bubble-skip', t('tutorial.skip'));
  bubble.append(bubbleText, skipBtn);
  const endBox = el('div', 'end-box');
  endBox.hidden = true;
  wrap.append(canvas, startBtn, bubble, endBox);
  root.append(hudEl, wrap, nav);

  const toast = createToaster(wrap);
  const haptic = createHaptics(wrap);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const board = createBoard(canvas, state);
  const tg = createTargeting();
  const valid = new Uint8Array(state.zones.count);

  let paused = false;
  let speed: 1 | 2 = 1;
  let acc = 0;
  let last = -1;

  const view: HudView = { hp: state.hp, cash: run.cash, wave: run.wave, waveMax: run.waveMax, level: run.level, flood: 0, paused, speed, pending: 0, lateLevels: 0, finalWave: false };
  const hud = createHud(hudEl, t, {
    onPause: () => setPaused(!paused),
    onSpeed: () => {
      speed = speed === 1 && !lockedSpeed() ? 2 : 1;
    },
  });
  const makeBar = (): ReturnType<typeof createSkillBar> =>
    createSkillBar(nav, skills, t, {
      onTap: (sk) => handle(skillTap(tg, sk)),
      onLongPress: (sk) => handle(skillLongPress(tg, sk)),
    });
  let bar = makeBar();
  /** A card changed the owned skills: rebuild the skill bar. */
  function rebuildBar(): void {
    skills = barSpecs();
    nav.textContent = '';
    bar = makeBar();
    refreshDisabled();
  }
  const levelUp = mountLevelUp(root, {
    run, t,
    hint: () => (tut !== null && tut.step === 5 && tutorialShown(tut, run) ? t('tutorial.step5') : null),
    onPick: () => {
      rebuildBar();
      tutor('cardPick');
    },
    onDone: () => {
      if (run.phase === 'prep') showPrep();
    },
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
    const r = machineRunSkill(run, sk.id, target, paused);
    if (!r.ok) return reject(r.toast ?? 'toast.badTarget');
    if (bySkillId(sk).def.id === 'build-levee') tutor('levee');
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
    if (acts && over()) return reject('toast.gameOver');
    if (acts && paused) return reject('toast.paused');
    switch (ev.t) {
      case 'select':
        toast(t('toast.zoneInfo', { type: t(`zone.type.${zoneNames[zoneType(state, ev.zone)]}`) }));
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
        if (over()) return reject('toast.gameOver');
        const r = runTogglePump(run, ev.pump, paused);
        if (!r.ok) return reject(r.toast ?? PUMP_LIMIT_TOAST);
        haptic(HAPTIC_USE);
        toast(t(state.pumps[ev.pump].on ? 'toast.pumpOn' : 'toast.pumpOff'));
        if (state.pumps[ev.pump].on) tutor('pumpOn');
        break;
      }
      case 'gate': {
        const r = runToggleGate(run, ev.gate, paused);
        if (!r.ok) return reject(r.toast ?? 'toast.badTarget');
        haptic(HAPTIC_USE);
        toast(t(state.gates[ev.gate].open ? 'toast.gateOpen' : 'toast.gateClosed'));
        break;
      }
      case 'needLongPress':
        toast(t('toast.longPress'));
        break;
    }
  }

  const lockedSpeed = (): boolean => tut !== null && tut.step === 3 && tutorialShown(tut, run);

  /** Feed the tutorial; finishing it reports once. */
  function tutor(ev: TutorialEvent): void {
    if (!tut || !tutorialEvent(tut, run, ev)) return;
    if (tut.step > 6) o.onTutorialDone();
    refreshTutorial();
  }

  function refreshTutorial(): void {
    const shown = tut !== null && tutorialShown(tut, run);
    bubble.hidden = !shown;
    if (shown && tut) bubbleText.textContent = t(`tutorial.step${tut.step}`);
    hudEl.classList.toggle('tut-gauge', shown && tut?.step === 6);
    if (lockedSpeed()) speed = 1;
  }

  function showPrep(): void {
    startBtn.textContent = t('play.startWave', { n: run.wave + 1 });
    startBtn.hidden = false;
    refreshTutorial();
    // Wave-end settlement: consecutive card picks before the next wave (spec 6.3).
    if (run.draft !== null && run.draft.pending > 0) levelUp.open();
  }

  function beginWave(): void {
    if (!machineBeginWave(run)) return;
    startBtn.hidden = true;
    toast(t('toast.waveStart', { n: run.wave }));
    refreshTutorial();
  }

  function endWave(): void {
    if (tg.skill) handle(cancelTargeting(tg));
    toast(t('toast.waveEnd', { n: run.wave }));
    showPrep();
  }

  /** Defeat / result panel: retry from the wave-start checkpoint, or back to the map list. */
  function showEnd(kind: 'defeat' | 'result'): void {
    if (tg.skill) handle(cancelTargeting(tg));
    endBox.textContent = '';
    endBox.appendChild(el('p', '', t(kind === 'defeat' ? 'toast.defeat' : 'play.cleared', { hp: state.hp })));
    if (kind === 'defeat') {
      const retry = el('button', 'end-btn', t('play.retry', { n: run.wave }));
      retry.addEventListener('click', () => {
        if (!retryWave(run)) return;
        endBox.hidden = true;
        fit();
        showPrep();
      });
      endBox.appendChild(retry);
    }
    const back = el('button', 'end-btn', t('play.toMaps'));
    back.addEventListener('click', o.onExit);
    endBox.appendChild(back);
    endBox.hidden = false;
    refreshTutorial();
  }

  bubble.addEventListener('click', (e) => {
    if (e.target !== skipBtn) tutor('tap');
  });
  skipBtn.addEventListener('click', () => tutor('skip'));
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
    if (!paused && run.phase === 'wave') {
      acc += dt * speed;
      const maxSteps = MAX_STEPS_PER_SPEED * speed;
      let n = 0;
      while (acc >= TICK_MS && n < maxSteps && run.phase === 'wave') {
        const ev = tickRun(run);
        acc -= TICK_MS;
        n++;
        if (state.fx.iceWarning) {
          toast(t('toast.iceWarning'));
          haptic(HAPTIC_FAIL);
        }
        if (state.fx.iceCollapsed.some((c) => (state.grid.flags[c] & FLAG_LAKE_DAM) !== 0)) toast(t('toast.iceCollapse'));
        if (ev === 'none') tutor('waveTick');
        else if (ev === 'waveEnd') endWave();
        else showEnd(ev);
      }
      if (acc > TICK_MS) acc = TICK_MS;
    } else {
      acc = 0;
    }

    const t0 = performance.now();
    let flood = 0;
    for (const c of state.base) flood += state.grid.w[c];
    view.hp = state.hp;
    view.cash = Math.floor(run.cash);
    view.wave = run.wave;
    view.level = run.level;
    view.flood = flood / BASE_FLOOD_THRESHOLD;
    view.paused = paused;
    view.speed = speed;
    view.pending = run.draft?.pending ?? 0;
    view.lateLevels = run.draft?.lateLevels ?? 0;
    view.finalWave = run.draft !== null && run.phase === 'wave' && run.wave >= run.waveMax;
    hud.update(view);
    // Tutorial step 2 lights the zones the levee skill can take (plain zones blink).
    const levee = skills.find((sk) => sk.id === 'build-levee');
    const blink = !tg.skill && levee !== undefined && tut !== null && tut.step === 2 && tutorialShown(tut, run) && Math.floor(now / 500) % 2 === 0;
    const maskSkill = tg.skill ?? (blink ? levee : null);
    if (maskSkill) {
      const swipe = bySkillId(maskSkill).def.target === 'swipe';
      for (let z = 0; z < state.zones.count; z++) valid[z] = swipe || canTarget(maskSkill, z) ? 1 : 0;
    }
    board.render(state, tg.zone, maskSkill ? valid : null, reducedMotion.matches ? 0 : now);
    samples[sampleCount++ % FRAME_SAMPLES] = performance.now() - t0;
    requestAnimationFrame(frame);
  }

  refreshDisabled();
  // Runs start in prep (sim frozen) so the player builds before wave 1; see Story 004 item 8.
  showPrep();
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
      return run.phase;
    },
    run,
    get tutorialStep() {
      return tut ? tut.step : 0;
    },
    get selectedZone() {
      return tg.zone;
    },
    get armedSkill() {
      return tg.skill ? tg.skill.id : null;
    },
    get cash() {
      return run.cash;
    },
    rt,
  };
}
