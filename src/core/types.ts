/**
 * Shared simulation types. Spec: docs/DETAILED_DESIGN_V2.md §3 (subset needed by the sim core).
 * Zones, skills, run state and the rest of §3 arrive with stories 002–004.
 */

/** Cell flag bits (`SimGrid.flags`). */
export const FLAG = { outlet: 1, inlet: 2, baseCore: 4, gateCell: 8, glacier: 16 } as const;

/** Cell terrain-type codes (`SimGrid.ztype`), mirrors zone types. */
export const ZT = { none: 0, plain: 1, forest: 2, hill: 3, field: 4, wetland: 5, reservoir: 6, base: 7 } as const;

/** Per-cell simulation arrays. Index `i = y * width + x`, y grows southward. */
export interface SimGrid {
  width: number;
  height: number;
  /**
   * Water depth. Float64 (spec §3 says Float32): with float32, a large cell sending a
   * sub-ulp amount to a thin cell rounds the loss away but keeps the gain, which drifts
   * mass by ~4e-6 per tick and fails SIM-01. 6144 cells × 8 bytes is negligible.
   */
  w: Float64Array;
  /** Ice thickness (blocks flow, melts into water). Float64 for the same reason. */
  ice: Float64Array;
  /** Ground height. */
  h: Float32Array;
  /** Permanent levee height. */
  wall: Float32Array;
  /** Closed-gate wall height (0 when open). */
  gate: Float32Array;
  /** Temporary wall (sandbag) height. */
  tmp: Float32Array;
  /** Remaining ticks of the temporary wall. */
  tmpTtl: Uint16Array;
  /** Levee durability 0..1.6. */
  dur: Float32Array;
  /** Bit flags, see `FLAG`. */
  flags: Uint8Array;
  /** Zone type code per cell (`ZT`), drives absorption and ecology. */
  ztype: Uint8Array;
  /** Forest / wetland health 0..1 (GD §16). */
  health: Float32Array;
  /** Consecutive ticks with depth ≥ forestFloodDepth (forest damage). */
  floodTicks: Uint16Array;
}

/** A pump site. `cell` is the centre cell index. */
export interface Pump { id: number; cell: number; on: boolean; }

/** A gate: closed gate cells get `SimConfig.gateClosedHeight` in `SimGrid.gate`. */
export interface Gate { id: number; cells: Uint32Array; open: boolean; }

/** An inlet: cells receiving inflow pulses, plus per-wave direction weights. */
export interface Inlet { id: number; cells: Uint32Array; weights: number[]; }

/**
 * Tunable simulation constants. Defaults in `src/sim/config.ts`, sourced from
 * docs/GAME_DESIGN_V2.md §3.0 (scale table) and docs/DETAILED_DESIGN_V2.md §4.
 */
export interface SimConfig {
  /** Virtual pipe conductance (§4.2). Must satisfy `4K ≤ 1`. */
  K: number;
  /** Ice melt per tick. */
  iceMelt: number;
  /** Melt per tick of map glacier ice (`FLAG.glacier` cells). */
  glacierMelt: number;
  /** Ice at or below this thickness snaps to water (avoids float dust). */
  iceEpsilon: number;
  /** Head difference across an overtopped ice cell that shatters it (빙하호 붕괴). 0 = off. */
  iceFractureHead: number;
  /** Proportional evaporation per tick. */
  evap: number;
  /** Outlet removal per tick per cell. */
  outletRate: number;
  /** Pump removal per cell per tick. */
  pumpRate: number;
  /** Pump radius (cells, Euclidean). */
  pumpRadius: number;
  /** Pump budget per tick = pumpCapFrac × (I_3 / waveLen_3). */
  pumpCapFrac: number;
  /** Max pumps on at once. */
  pumpMaxOn: number;
  /** Cash cost per pump per tick (1 per second). */
  pumpCashPerTick: number;
  /** Levee durability loss per tick per unit pressure (0.02 per second). */
  leveeWear: number;
  /** Durability of a fresh levee. */
  leveeDur: number;
  /** Wall height of a closed gate cell. */
  gateClosedHeight: number;
  /** Base damage threshold on the 3×3 water sum. */
  floodThreshold: number;
  /** HP lost per tick per unit of flood over threshold (2 per second). */
  damagePerTick: number;
  /** Wave inflow growth table (1.35^n as constants, §1). */
  growth: number[];
  /** Fraction of wave inflow that falls as rain. */
  rain: number;
  /** Pulse period in ticks. */
  pulseEvery: number;
  /** Per-cell water cap applied at inlets. */
  inletCellCap: number;
  /** Ticks per second. */
  tps: number;
  /** Wetland absorption per tick at absorbMul 1 (forest gets `forestAbsorbFrac` of it). */
  absorbRate: number;
  forestAbsorbFrac: number;
  /** Forest damage: depth and duration (ticks) before health starts falling, and loss per tick. */
  forestFloodDepth: number;
  forestFloodTicks: number;
  forestDamagePerTick: number;
  /** Ecology index cap (%). */
  ecologyMax: number;
}

/** Wave status returned by the step function. */
export type StepResult = 'running' | 'waveEnd' | 'defeat';

/** Per-run accumulated sim metrics (§4.7 subset; ecology arrives with skills). */
export interface SimMetrics {
  /** Water removed by pumps, outlets and absorption (excludes evaporation). */
  drained: number;
  /** Σ_levee cells min(max adjacent depth, wall) × 0.01. */
  blocked: number;
  evaporated: number;
  /** Total water added (inlets + rain), whole run. */
  inflow: number;
  /** Water added this wave. */
  waveInflow: number;
  /** Inlet water that could not be placed because of the per-cell cap. */
  inflowClipped: number;
  /** Integer HP lost this wave. */
  waveDamage: number;
  /** Highest base-core water sum seen this wave. */
  waveMaxFlood: number;
  /** Levee cells collapsed (whole run). */
  collapses: number;
  /** Ecology index now (%), GD §16. */
  ecology: number;
  /** Highest ecology index reached this run (%). */
  ecologyBest: number;
}

/** Per-wave inflow modifiers supplied by the rules layer (events, contracts). */
export interface WaveParams {
  /** Multiplier on I_w (peak × contract). */
  mul: number;
  /** Rain fraction for this wave. */
  rain: number;
}

/** Map-level inputs to the sim. */
export interface MapSimParams {
  /** W1 total inflow. */
  I1: number;
  rain?: number;
  pulseEvery?: number;
}

/** Things that happened this tick (cleared at the start of every tick). */
export interface TickEvents {
  /** Cells whose levee collapsed. */
  collapsed: number[];
  /** Ice cells that shattered (outburst). */
  iceBroken: number[];
  /** Pumps were switched off because cash ran out. */
  cashEmpty: boolean;
}

/** Complete mutable sim state. Plain data; no DOM (§1). */
export interface SimWorld {
  cfg: SimConfig;
  map: Required<MapSimParams>;
  grid: SimGrid;
  baseCore: Uint32Array;
  inlets: Inlet[];
  pumps: Pump[];
  gates: Gate[];
  /** Fixed-order cell offsets of each pump's disc (precomputed). */
  pumpCells: Uint32Array[];
  /** Per-pump tick budget (§4.4). */
  pumpBudget: number;
  /** Modifiers from passives / fusions (`wallDurabilityMul`, `absorbMul`). */
  mods: { wallDurabilityMul: number; absorbMul: number };
  wave: number;
  waveTick: number;
  waveLen: number;
  waveParams: WaveParams;
  hp: number;
  /** Fractional HP damage not yet applied. */
  hpAcc: number;
  /** Integer cash, or `null` when the caller does not track cash. */
  cash: number | null;
  cashAcc: number;
  tick: number;
  /** Forest + wetland cell count at map start (ecology denominator). */
  ecoBase: number;
  metrics: SimMetrics;
  events: TickEvents;
  scratch: { head: Float64Array; out: Float64Array; s: Float64Array };
}
