import type { SimWorld } from '../core/types.ts';
import type { EconomyDef } from './types.ts';

/**
 * Play score = XP (GD §6.1–6.3, DETAILED §4.7, §7.1). No DOM.
 *   drained ×0.3 · blocked ×0.35 · ecology best +8 per 1% · no-damage wave +60 · wave clear +100
 * Score accumulates as a float; each whole point gained is 1 XP. Level-ups during the last
 * wave cannot be drafted and become "late levels" (+50 result score each).
 */

export interface ScoreState {
  scoreF: number;
  xp: number;
  level: number;
  /** Level-ups waiting for a draft. */
  pending: number;
  lateLevels: number;
  last: { drained: number; blocked: number; ecoBest: number };
}

export function createScore(world: SimWorld): ScoreState {
  const m = world.metrics;
  return { scoreF: 0, xp: 0, level: 1, pending: 0, lateLevels: 0, last: { drained: m.drained, blocked: m.blocked, ecoBest: m.ecologyBest } };
}

/** XP needed to go from `lv` to `lv + 1`: round(100 × 1.35^(lv−1)). */
export function xpToNext(lv: number, eco: EconomyDef): number { return Math.round(eco.xp.base * eco.xp.growth ** (lv - 1)); }

/** Add score points; whole points become XP; returns level-ups gained. */
export function addScore(ss: ScoreState, pts: number, eco: EconomyDef, late: boolean): number {
  const before = Math.floor(ss.scoreF);
  ss.scoreF += pts;
  ss.xp += Math.floor(ss.scoreF) - before;
  let ups = 0;
  while (ss.xp >= xpToNext(ss.level, eco)) {
    ss.xp -= xpToNext(ss.level, eco); ss.level++; ups++;
    if (late) ss.lateLevels++; else ss.pending++;
  }
  return ups;
}

/** Per wave tick: metric deltas → score. `late` = this is the last wave. */
export function scoreTick(ss: ScoreState, world: SimWorld, eco: EconomyDef, late: boolean): number {
  const m = world.metrics, s = eco.score;
  const pts = (m.drained - ss.last.drained) * s.drainedPer + (m.blocked - ss.last.blocked) * s.blockedPer
    + Math.max(0, m.ecologyBest - ss.last.ecoBest) * s.ecologyPer;
  ss.last.drained = m.drained; ss.last.blocked = m.blocked; ss.last.ecoBest = Math.max(ss.last.ecoBest, m.ecologyBest);
  return pts > 0 ? addScore(ss, pts, eco, late) : 0;
}

/** Wave end: clear bonus and no-damage bonus. */
export function scoreWaveEnd(ss: ScoreState, world: SimWorld, eco: EconomyDef, late: boolean): number {
  const pts = eco.score.waveClear + (world.metrics.waveDamage === 0 ? eco.score.noDamageWave : 0);
  return addScore(ss, pts, eco, late);
}
