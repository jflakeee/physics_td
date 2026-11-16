import type { SimState } from '../core/types.ts';
import {
  BASE_DAMAGE_RATE, BASE_FLOOD_THRESHOLD, BLOCKED_COEF, CELLS, ECOLOGY_MAX, FOREST_DECAY_PER_SEC,
  FOREST_FLOOD_DEPTH, FOREST_FLOOD_TICKS, GRID_H, GRID_W, TICKS_PER_SEC, ZONE,
} from './constants.ts';

/**
 * Tick 7: forest health. A forest cell flooded to >= 0.1 for 10 s loses 0.1 health
 * per second (wetlands are unaffected). Updates `metrics.ecology` (percent, max 150).
 * @example updateEcology(state);
 */
export function updateEcology(state: SimState): void {
  const { w, zone, floodTicks, health } = state.grid;
  let sum = 0;
  for (let i = 0; i < CELLS; i++) {
    const z = zone[i];
    if (z === ZONE.forest) {
      if (w[i] >= FOREST_FLOOD_DEPTH) {
        if (floodTicks[i] < 65535) floodTicks[i]++;
      } else {
        floodTicks[i] = 0;
      }
      if (floodTicks[i] >= FOREST_FLOOD_TICKS) {
        health[i] = Math.max(0, health[i] - FOREST_DECAY_PER_SEC / TICKS_PER_SEC);
      }
      sum += health[i];
    } else if (z === ZONE.wetland) {
      sum += health[i];
    }
  }
  state.metrics.ecology = state.ecologyCells > 0 ? Math.min(ECOLOGY_MAX, (sum / state.ecologyCells) * 100) : 0;
}

/**
 * Tick 8: base damage. `flood` = water sum over the 3x3 core; per tick
 * `max(0, flood - 1.2) * 2 / 30` accumulates and only whole points reduce the
 * integer HP (the fraction stays in `hpAcc`).
 * @example applyBaseDamage(state); if (state.hp <= 0) { }
 */
export function applyBaseDamage(state: SimState): void {
  let flood = 0;
  for (const c of state.base) flood += state.grid.w[c];
  state.hpAcc += (Math.max(0, flood - BASE_FLOOD_THRESHOLD) * BASE_DAMAGE_RATE) / TICKS_PER_SEC;
  const whole = Math.floor(state.hpAcc);
  if (whole > 0) {
    state.hpAcc -= whole;
    state.hp = Math.max(0, state.hp - whole);
    state.metrics.damageThisWave += whole;
  }
}

/**
 * Tick 9: `blocked` += sum over levee cells of min(deepest neighbouring water, wall) x 0.01.
 * @example accumulateBlocked(state);
 */
export function accumulateBlocked(state: SimState): void {
  const { w, wall } = state.grid;
  let blocked = 0;
  for (let i = 0; i < CELLS; i++) {
    const wi = wall[i];
    if (wi <= 0) continue;
    const x = i % GRID_W;
    const y = (i / GRID_W) | 0;
    let m = 0;
    if (x > 0) m = Math.max(m, w[i - 1]);
    if (x < GRID_W - 1) m = Math.max(m, w[i + 1]);
    if (y > 0) m = Math.max(m, w[i - GRID_W]);
    if (y < GRID_H - 1) m = Math.max(m, w[i + GRID_W]);
    blocked += Math.min(m, wi) * BLOCKED_COEF;
  }
  state.metrics.blocked += blocked;
}
