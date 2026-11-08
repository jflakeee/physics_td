import type { SimConfig } from '../core/types.ts';

/**
 * Default sim constants. Every value traces to docs/GAME_DESIGN_V2.md §3.0 scale table
 * or docs/DETAILED_DESIGN_V2.md §4; calibration in §25 / `prototypes/v2-calibrate.mjs`.
 * Maps override per-map values (I1, rain, pulseEvery) via `MapSimParams`.
 */
export const DEFAULT_SIM_CONFIG: Readonly<SimConfig> = Object.freeze({
  K: 0.2,
  iceMelt: 0.0008,
  // story-001 decision: map glaciers melt at 1/4 rate so a dam can last into late waves
  // without its own ice being most of the flood (see story notes)
  glacierMelt: 0.0002,
  iceEpsilon: 1e-6,
  // story-001 decision: ice-dam outburst rule, see ice.ts fractureIce
  iceFractureHead: 0.1,
  evap: 0.00002,
  outletRate: 0.05,
  pumpRate: 0.015,
  pumpRadius: 3,
  pumpCapFrac: 0.25,
  pumpMaxOn: 2,
  pumpCashPerTick: 1 / 30,
  leveeWear: 0.02 / 30,
  leveeDur: 1.0,
  gateClosedHeight: 0.8,
  floodThreshold: 1.2,
  damagePerTick: 2 / 30,
  growth: [1, 1.35, 1.8225, 2.460375, 3.32150625],
  rain: 0.2,
  pulseEvery: 45,
  inletCellCap: 2.0,
  tps: 30,
  absorbRate: 0.004,
  forestAbsorbFrac: 0.5,
  forestFloodDepth: 0.1,
  forestFloodTicks: 300,
  forestDamagePerTick: 0.1 / 30,
  ecologyMax: 150,
});

/** Wave length in ticks: 30 × (40 + 7.5 × (w − 1)). W1 1200 … W5 2100 (§4.5). */
export function waveLen(wave: number, tps = 30): number {
  return Math.round(tps * (40 + 7.5 * (wave - 1)));
}

/** Merge overrides onto the defaults. */
export function makeConfig(over: Partial<SimConfig> = {}): SimConfig {
  return { ...DEFAULT_SIM_CONFIG, growth: [...DEFAULT_SIM_CONFIG.growth], ...over };
}
