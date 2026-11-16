import type { SimState, WaveInflow } from '../core/types.ts';
import {
  CELLS, DEFAULT_PULSE_EVERY, DEFAULT_RAIN, GROWTH, INLET_CELL_CAP, PUMP_BUDGET_FRACTION,
  PUMP_REFERENCE_WAVE, TICKS_PER_SEC, WAVE_SEC_START, WAVE_SEC_STEP,
} from './constants.ts';

/**
 * Wave length in ticks: 40 s (W1) growing 7.5 s per wave.
 * @example waveLength(1) === 1200
 */
export function waveLength(wave: number): number {
  return (WAVE_SEC_START + WAVE_SEC_STEP * (wave - 1)) * TICKS_PER_SEC;
}

/**
 * Per-pump water budget per tick for a map: 0.25 x the mean inflow rate of wave 3.
 * @example state.pumpBudget = pumpBudgetPerTick(120);
 */
export function pumpBudgetPerTick(i1: number): number {
  return (PUMP_BUDGET_FRACTION * i1 * GROWTH[PUMP_REFERENCE_WAVE - 1]) / waveLength(PUMP_REFERENCE_WAVE);
}

/**
 * Plan one wave: total volume = i1 x GROWTH[wave-1] x volumeMul.
 * @param weights Optional per-inlet weights (default equal).
 * @example const plan = planWave(120, 1, { inletCount: 4 });
 */
export function planWave(
  i1: number,
  wave: number,
  opts: { inletCount: number; rain?: number; pulseEvery?: number; weights?: number[]; volumeMul?: number },
): WaveInflow {
  const pulseEvery = opts.pulseEvery ?? DEFAULT_PULSE_EVERY;
  const len = waveLength(wave);
  return {
    total: i1 * GROWTH[wave - 1] * (opts.volumeMul ?? 1),
    rain: opts.rain ?? DEFAULT_RAIN,
    pulseEvery,
    pulseCount: Math.floor(len / pulseEvery),
    len,
    weights: opts.weights ?? new Array<number>(opts.inletCount).fill(1),
  };
}

/**
 * Begin a wave: install its plan and reset the wave tick counter and wave damage.
 * @example startWave(state, planWave(120, 1, { inletCount: 4 }));
 */
export function startWave(state: SimState, plan: WaveInflow): void {
  state.inflow = plan;
  state.waveTick = 0;
  state.metrics.damageThisWave = 0;
}

/**
 * Tick 2: on pulse ticks, add the inlet share (split by weight, evenly over each
 * strip, capped per cell) and the rain share (evenly over all cells).
 * @example applyInflow(state);
 */
export function applyInflow(state: SimState): void {
  const plan = state.inflow;
  if (plan === null || state.waveTick % plan.pulseEvery !== 0) return;
  if (state.waveTick / plan.pulseEvery >= plan.pulseCount) return;
  const w = state.grid.w;

  let weightSum = 0;
  for (const k of plan.weights) weightSum += k;
  const river = (plan.total * (1 - plan.rain)) / plan.pulseCount;
  for (let s = 0; s < state.inlets.length; s++) {
    const cells = state.inlets[s];
    const share = (river * plan.weights[s]) / weightSum / cells.length;
    for (const c of cells) w[c] += Math.min(share, Math.max(0, INLET_CELL_CAP - w[c]));
  }

  const rain = (plan.total * plan.rain) / plan.pulseCount / CELLS;
  for (let i = 0; i < CELLS; i++) w[i] += rain;
}
