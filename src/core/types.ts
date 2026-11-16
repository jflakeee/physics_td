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
  /** Ice melt per tick of each cell (`ICE_MELT_PER_TICK` except skill-built ice dams). */
  iceMelt: Float32Array;
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
  /** Terrain type code per cell (see `ZONE` in constants). */
  zone: Uint8Array;
  /** Authored zone id per cell from the map `zones` layer (`NO_ZONE` = none). */
  zoneId: Uint8Array;
  /** Closed-gate wall height (0 = open or no gate); adds to the water head. */
  gate: Float32Array;
  /** Forest / wetland health 0..1. */
  health: Float32Array;
  /** Bit flags: 1 outlet, 2 inlet, 4 base core, 8 glacier-lake dam, 16 skill-built ice. */
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

/** One levee line of a zone: the cells and the direction (unit-ish vector, +y down) it faces. */
export interface LeveeLine { facing: readonly [number, number]; cells: readonly number[] }

/** Zone layer of a map (docs/GAME_DESIGN_V2.md 26.1); static for the whole run. */
export interface ZoneLayer {
  count: number;
  /** Zone id per authoring tile (index `ty * 8 + tx`), -1 = none. */
  tileZone: Int16Array;
  /** Cell indices of each zone. */
  cells: number[][];
  /** Levee lines of each zone (docs/DETAILED_DESIGN_V2.md 11.2), longest first, at most 3. */
  lines: LeveeLine[][];
}

/** A gate (수문): a wall line that is up while closed, down while open. */
export interface Gate {
  id: number;
  /** Cells of the wall line. */
  cells: number[];
  /** Wall height while closed. */
  height: number;
  open: boolean;
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
  /** True on the one tick when a glacier-lake dam is predicted to collapse within `ICE_WARN_SEC`. */
  iceWarning: boolean;
}

export interface SimState {
  grid: SimGrid;
  /** Cell indices of each inlet strip. */
  inlets: number[][];
  /** 3x3 base core cell indices. */
  base: number[];
  zones: ZoneLayer;
  gates: Gate[];
  /** Cells of the glacier-lake dam (empty on maps without a lake). */
  lakeDam: number[];
  /** True once the glacier-lake collapse warning has been raised (one lake, one warning). */
  iceWarned: boolean;
  pumps: Pump[];
  /** Max pumps running at once (from `data/skills/pump.json`); `Infinity` when not supplied. */
  maxPumpsOn: number;
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
