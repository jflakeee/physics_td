import type { SimState } from '../core/types.ts';
import { CELLS, START_HP, ZONE } from './constants.ts';
import { fluidStep } from './fluid.ts';
import { updateIce } from './ice.ts';
import { applyInflow, pumpBudgetPerTick } from './inflow.ts';
import { accumulateBlocked, applyBaseDamage, updateEcology } from './metrics.ts';
import { applySinks } from './sinks.ts';
import { updateStructures } from './structures.ts';
import { buildTerrain } from './terrain.ts';

/**
 * Create a fresh simulation state from 12 tile strings.
 * @param i1 Map base inflow volume (wave 1), also scales the pump budget.
 * @param noiseSalt Height noise salt.
 * @example const state = createSim(tiles, 120);
 */
export function createSim(tiles: readonly string[], i1: number, noiseSalt = 0): SimState {
  const t = buildTerrain(tiles, noiseSalt);
  let ecologyCells = 0;
  for (let i = 0; i < CELLS; i++) {
    if (t.grid.zone[i] === ZONE.forest || t.grid.zone[i] === ZONE.wetland) ecologyCells++;
  }
  return {
    grid: t.grid,
    inlets: t.inlets,
    base: t.base,
    pumps: [],
    pumpBudget: pumpBudgetPerTick(i1),
    mods: { wallDurabilityMul: 1, absorbMul: 0 },
    hp: START_HP,
    hpAcc: 0,
    tick: 0,
    waveTick: 0,
    inflow: null,
    metrics: { drained: 0, blocked: 0, damageThisWave: 0, ecology: 100 },
    fx: { leveeCollapsed: [], iceCollapsed: [] },
    ecologyCells,
  };
}

/**
 * Advance one tick in the fixed pipeline order (spec 4.1 steps 2-9): inflow, flow,
 * ice, sinks, structures, ecology, base damage, blocked metric. Events (1) and
 * wave end / defeat handling (10) belong to the caller: check `state.hp <= 0`.
 * @example for (let t = 0; t < plan.len && state.hp > 0; t++) step(state);
 */
export function step(state: SimState): void {
  state.fx.leveeCollapsed.length = 0;
  state.fx.iceCollapsed.length = 0;
  applyInflow(state);
  fluidStep(state.grid);
  updateIce(state);
  applySinks(state);
  updateStructures(state);
  updateEcology(state);
  applyBaseDamage(state);
  accumulateBlocked(state);
  state.tick++;
  state.waveTick++;
}
