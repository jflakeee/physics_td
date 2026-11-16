/**
 * First-play tutorial on 둑마을 (docs/GAME_DESIGN_V2.md 18): 6 steps in order, skippable,
 * kept across a wave retry (the tutorial is not part of the checkpoint).
 * Step 5 ("pick a card") advances when a level-up card is actually picked.
 */
import { TICKS_PER_SEC } from '../sim/constants.ts';
import type { Run } from './machine.ts';

/** Tutorial input events. `waveTick` is sent every wave tick. */
export type TutorialEvent = 'tap' | 'levee' | 'waveTick' | 'pumpOn' | 'cardPick' | 'skip';

/** Seconds step 3 watches the levee at 1x. */
export const WATCH_SEC = 15;
export const TUTORIAL_STEPS = 6;

/** Current step 1..6; 7 = finished. */
export interface Tutorial { step: number }

/**
 * Fresh tutorial at step 1.
 * @example const tut = createTutorial();
 */
export function createTutorial(): Tutorial {
  return { step: 1 };
}

/**
 * Whether the current step is shown now: steps 1-2 in any prep (from the first), 3-4 during
 * a wave, 5-6 in a later prep.
 * @example if (tutorialShown(tut, run)) bubble.show(t(`tutorial.step${tut.step}`));
 */
export function tutorialShown(tut: Tutorial, run: Run): boolean {
  if (tut.step > TUTORIAL_STEPS) return false;
  if (tut.step <= 2) return run.phase === 'prep';
  if (tut.step <= 4) return run.phase === 'wave';
  return run.phase === 'prep' && run.wave >= 1;
}

/**
 * Feed an event; advances when it is the shown step's condition (or `skip`).
 * @returns true when the step changed.
 * @example if (tutorialEvent(tut, run, 'levee')) refreshBubble();
 */
export function tutorialEvent(tut: Tutorial, run: Run, ev: TutorialEvent): boolean {
  if (ev === 'skip') {
    const was = tut.step;
    tut.step = TUTORIAL_STEPS + 1;
    return was !== tut.step;
  }
  if (!tutorialShown(tut, run)) return false;
  const need: Record<number, TutorialEvent> = { 1: 'tap', 2: 'levee', 3: 'waveTick', 4: 'pumpOn', 5: 'cardPick', 6: 'tap' };
  if (need[tut.step] !== ev) return false;
  if (ev === 'waveTick' && run.state.waveTick < WATCH_SEC * TICKS_PER_SEC) return false;
  tut.step++;
  return true;
}
