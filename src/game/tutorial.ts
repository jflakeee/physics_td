import type { Play, PlayEvent } from './play.ts';

/**
 * 둑마을 first-play tutorial (GD §18). Six steps in order; each shows a one-line bubble and
 * waits for its condition. Lives outside the run: a defeat/retry keeps the step.
 *   1 intro (tap) · 2 build a levee · 3 watch W1 for 15 s at 1× · 4 run a pump ·
 *   5 level-up card (done on a pick/skip; a tap if W1 gave no level-up) · 6 base gauge (tap) · done.
 */

export const TUTORIAL_STEPS = 6;
export const WATCH_TICKS = 15 * 30;

export interface Tutorial { step: number; watched: number; }

export const DONE = TUTORIAL_STEPS + 1;

export function createTutorial(step = 1): Tutorial { return { step, watched: 0 }; }

/** Is the current step's bubble visible in this phase? */
export function visible(t: Tutorial, p: Play): boolean {
  switch (t.step) {
    case 1: return true;
    case 2: return p.phase === 'prepare' || p.phase === 'wave';
    case 3: return p.phase === 'wave';
    case 4: return p.phase === 'wave' || p.phase === 'prepare';
    case 5: return (p.phase === 'levelup' || p.phase === 'prepare') && p.world.wave >= 1;
    case 6: return p.phase === 'prepare' && p.world.wave >= 1;
    default: return false;
  }
}

/** Steps that complete on a bubble tap. */
export const tapToContinue = (t: Tutorial, p?: Play) => t.step === 1 || t.step === 6 || (t.step === 5 && p?.phase === 'prepare');

/** Bubble tapped. */
export function onTap(t: Tutorial, p: Play): void {
  if (tapToContinue(t, p) && visible(t, p)) t.step++;
}

/** A game event happened. */
export function onEvent(t: Tutorial, e: PlayEvent): void {
  if (t.step === 2 && e.t === 'skill' && e.id === 'build-levee') t.step = 3;
  else if (t.step === 4 && e.t === 'toggled' && e.kind === 'pump' && e.on) t.step = 5;
  else if (t.step === 3 && e.t === 'waveEnd') t.step = 4;
  else if (t.step === 5 && e.t === 'cardPicked') t.step = 6;
}

/** Per sim tick (step 3 counts wave time). */
export function onTick(t: Tutorial, p: Play): void {
  if (t.step === 3 && p.phase === 'wave') { if (++t.watched >= WATCH_TICKS) t.step = 4; }
}

/** Speed is locked to 1× while step 3 is showing. */
export const speedLocked = (t: Tutorial) => t.step === 3;

/** Skip the whole tutorial. */
export function skip(t: Tutorial): void { t.step = DONE; }
