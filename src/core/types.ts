/** Shared simulation types (docs/DETAILED_DESIGN_V2.md section 3, sim subset). */

/** Per-cell simulation arrays. Index `i = y * GRID_W + x`. */
export interface SimGrid {
  /**
   * Water depth. Float64 (not Float32 as in spec 3): with Float32 storage rounding
   * loses/gains ~1e-3 total over 10k ticks, above the 1e-4 mass conservation bound.
   */
  w: Float64Array;
  /** Ice thickness (adds to the water head, so ice acts as a wall). */
  ice: Float32Array;
  /** Ground height. */
  h: Float32Array;
  /** Permanent levee height. */
  wall: Float32Array;
  /** Temporary wall (sandbag) height. */
  tmp: Float32Array;
  /** Remaining ticks of the temporary wall. */
  tmpTtl: Uint16Array;
  /** Levee durability, 0 = collapsed. */
  dur: Float32Array;
  /** Zone code per cell (see `ZONE` in constants). */
  zone: Uint8Array;
  /** Forest / wetland health 0..1. */
  health: Float32Array;
  /** Bit flags: 1 outlet, 2 inlet, 4 base core. */
  flags: Uint8Array;
  /** Consecutive ticks with depth >= forest flood depth. */
  floodTicks: Uint16Array;
  /** Scratch: water head per cell (double precision). */
  head: Float64Array;
  /** Last tick's outflow per cell and direction (+x, -x, +y, -y), before scaling. */
  flowOut: Float64Array;
  /** Last tick's send scale per cell (<= 1 when a cell cannot afford its outflow). */
  flowScale: Float64Array;
}

export interface Pump {
  id: number;
  /** Cell index of the pump centre. */
  cell: number;
  on: boolean;
}

/** Modifiers from passives/cards. Defaults: no absorb, normal durability. */
export interface SimMods {
  /** Divides levee wear; 1.3 / 1.45 / 1.6 for the dike-keeper passive. */
  wallDurabilityMul: number;
  /** Wetland/forest absorb multiplier; 0 = no passive owned. */
  absorbMul: number;
}

/** One wave's inflow plan, see `planWave`. */
export interface WaveInflow {
  /** Total water volume of the wave. */
  total: number;
  /** Fraction falling as rain on all cells. */
  rain: number;
  pulseEvery: number;
  pulseCount: number;
  /** Wave length in ticks. */
  len: number;
  /** One weight per inlet strip (same order as `SimState.inlets`). */
  weights: number[];
}

export interface SimMetrics {
  /** Water removed by sinks (not evaporation). */
  drained: number;
  /** Sum of levee blocking, see spec 4.7. */
  blocked: number;
  /** Integer HP lost since the last `startWave`. */
  damageThisWave: number;
  /** Ecology index in percent (0..150). */
  ecology: number;
}

/** Cells that collapsed during the most recent tick (cleared every tick). */
export interface SimFx {
  leveeCollapsed: number[];
  iceCollapsed: number[];
}

export interface SimState {
  grid: SimGrid;
  /** Cell indices of each inlet strip. */
  inlets: number[][];
  /** 3x3 base core cell indices. */
  base: number[];
  pumps: Pump[];
  /** Per-pump water budget per tick. */
  pumpBudget: number;
  mods: SimMods;
  /** Integer hit points; 0 = defeat. */
  hp: number;
  /** Fractional damage carried between ticks. */
  hpAcc: number;
  tick: number;
  waveTick: number;
  inflow: WaveInflow | null;
  metrics: SimMetrics;
  fx: SimFx;
  /** Forest + wetland cell count at map start (ecology denominator). */
  ecologyCells: number;
}
