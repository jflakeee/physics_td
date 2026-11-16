/**
 * Wave schedule of a run (docs/GAME_DESIGN_V2.md 17, docs/DETAILED_DESIGN_V2.md 4.5):
 * 5 waves, 40 s growing by 7.5 s to 70 s, inflow x1.35 per wave, rain share and pulse
 * period from the map. The numeric table lives in `constants.ts`; per-map values
 * (`I1`, rain, pulse period, inlet weights) come from the map data.
 */
import type { WaveInflow } from '../core/types.ts';
import { GROWTH, TICKS_PER_SEC } from './constants.ts';
import { planWave, waveLength } from './inflow.ts';

/** Number of waves in a run. */
export const WAVE_COUNT = GROWTH.length;

/** Per-map inflow parameters (the wave-relevant part of the map data). */
export interface WaveParams {
  /** Wave 1 total inflow volume. */
  i1: number;
  /** Fraction of the wave volume that falls as rain on every cell. */
  rain: number;
  /** Ticks between inflow pulses. */
  pulseEvery: number;
  /** One weight per inlet, in `SimState.inlets` order. */
  weights: readonly number[];
}

/**
 * Wave length in seconds (40 for wave 1 up to 70 for wave 5).
 * @example waveSeconds(5) === 70
 */
export function waveSeconds(wave: number): number {
  return waveLength(wave) / TICKS_PER_SEC;
}

/**
 * Inflow plan of wave `wave` (1-based) on a map.
 * @example startWave(state, planMapWave(map.waves, 1));
 */
export function planMapWave(p: WaveParams, wave: number): WaveInflow {
  return planWave(p.i1, wave, { inletCount: p.weights.length, rain: p.rain, pulseEvery: p.pulseEvery, weights: [...p.weights] });
}
