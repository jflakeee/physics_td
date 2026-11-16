import type { SimState } from '../core/types.ts';
import {
  CELLS, EVAPORATION, FLAG_OUTLET, FOREST_ABSORB_FACTOR, GRID_H, GRID_W, OUTLET_RATE,
  PUMP_CELL_RATE, PUMP_RADIUS, WETLAND_ABSORB, ZONE,
} from './constants.ts';

/** Pump footprint (dx, dy pairs) in fixed scan order: rows top to bottom, then columns. */
const PUMP_OFFSETS: Int8Array = (() => {
  const o: number[] = [];
  for (let dy = -PUMP_RADIUS; dy <= PUMP_RADIUS; dy++) {
    for (let dx = -PUMP_RADIUS; dx <= PUMP_RADIUS; dx++) {
      if (dx * dx + dy * dy <= PUMP_RADIUS * PUMP_RADIUS) o.push(dx, dy);
    }
  }
  return Int8Array.from(o);
})();

/**
 * Tick 5: pumps (cap), outlets, wetland/forest absorb, proportional evaporation.
 * Only the first `state.maxPumpsOn` pumps that are `on` run. Each pump removes at most
 * `PUMP_CELL_RATE` per cell and `state.pumpBudget` in total per tick. Everything
 * except evaporation counts into `metrics.drained`.
 * @example state.pumps.push({ id: 1, cell: 47 * 64 + 31, on: true }); applySinks(state);
 */
export function applySinks(state: SimState): void {
  const { grid: g, metrics, mods } = state;
  const { w, flags, zone } = g;
  let drained = 0;

  let running = 0;
  for (const p of state.pumps) {
    if (!p.on || running >= state.maxPumpsOn) continue;
    running++;
    const px = p.cell % GRID_W;
    const py = (p.cell / GRID_W) | 0;
    let budget = state.pumpBudget;
    for (let k = 0; k < PUMP_OFFSETS.length && budget > 0; k += 2) {
      const x = px + PUMP_OFFSETS[k];
      const y = py + PUMP_OFFSETS[k + 1];
      if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) continue;
      const i = y * GRID_W + x;
      const d = Math.min(w[i], PUMP_CELL_RATE, budget);
      w[i] -= d;
      budget -= d;
      drained += d;
    }
  }

  for (let i = 0; i < CELLS; i++) {
    if (flags[i] & FLAG_OUTLET) {
      const d = Math.min(w[i], OUTLET_RATE);
      w[i] -= d;
      drained += d;
    }
    const z = zone[i];
    if (z === ZONE.wetland) {
      const d = Math.min(w[i], WETLAND_ABSORB * mods.absorbMul);
      w[i] -= d;
      drained += d;
    } else if (z === ZONE.forest) {
      const d = Math.min(w[i], WETLAND_ABSORB * mods.absorbMul * FOREST_ABSORB_FACTOR);
      w[i] -= d;
      drained += d;
    }
    w[i] -= w[i] * EVAPORATION;
  }
  metrics.drained += drained;
}
