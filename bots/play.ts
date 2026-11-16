/** Plays one bot game through the run machine (shared by bots/run.ts and calibration). */
import { beginWave, tickRun } from '../src/game/machine.ts';
import type { Run } from '../src/game/machine.ts';
import type { Strategy } from './strategies.ts';

/** Bots act every this many wave ticks (spec 21). */
export const ACT_EVERY = 10;

/** Result of one bot game. */
export interface BotResult { cleared: boolean; wave: number; hp: number; cash: number }

/**
 * Play one run to the end with a strategy.
 * @example const r = playBot(createRun(map, data, 'dike-keeper', 7), STRATEGIES[0]);
 */
export function playBot(run: Run, s: Strategy): BotResult {
  for (;;) {
    s.act(run);
    beginWave(run);
    for (let ev = tickRun(run); ; ev = tickRun(run)) {
      if (ev === 'defeat') return { cleared: false, wave: run.wave, hp: 0, cash: Math.floor(run.cash) };
      if (ev === 'result') return { cleared: true, wave: run.wave, hp: run.state.hp, cash: Math.floor(run.cash) };
      if (ev === 'waveEnd') break;
      if (run.state.waveTick % ACT_EVERY === 0) s.act(run);
    }
  }
}

