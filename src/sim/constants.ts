/**
 * Every tunable number of the water/ice simulation lives here.
 * Source of values: docs/GAME_DESIGN_V2.md section 3.0 (v2.2 scale table) and
 * docs/DETAILED_DESIGN_V2.md section 4. Logic modules must not hardcode numbers.
 */

// --- grid and time ---------------------------------------------------------
export const GRID_W = 64;
export const GRID_H = 96;
export const CELLS = GRID_W * GRID_H;
/** Cells per authoring tile edge (8x8 cells per tile). */
export const TILE_SIZE = 8;
export const TILES_X = 8;
export const TILES_Y = 12;
export const TICKS_PER_SEC = 30;

// --- flow ------------------------------------------------------------------
/** Virtual-pipe conductance. K * 4 <= 1 keeps the scheme oscillation free. */
export const FLOW_K = 0.2;

// --- terrain (basin) -------------------------------------------------------
export const BASE_LEVEL = 0.6;
export const SLOPE = 0.8;
/** Peak-to-peak height noise (+-0.02). */
export const NOISE_AMP = 0.04;
/** Inlet / outlet strip: cells from the edge tile start, and its length. */
export const PORT_OFFSET = 2;
export const PORT_LENGTH = 4;

/** Zone codes stored in `SimGrid.zone` (0 = none). */
export const ZONE = {
  none: 0,
  plain: 1,
  forest: 2,
  hill: 3,
  field: 4,
  wetland: 5,
  reservoir: 6,
  base: 7,
  inlet: 8,
  outlet: 9,
} as const;

/** Tile letter -> zone code and height offset relative to the basin surface. */
export const TILE_TYPES: Readonly<Record<string, { zone: number; offset: number }>> = {
  P: { zone: ZONE.plain, offset: 0 },
  F: { zone: ZONE.forest, offset: 0.05 },
  H: { zone: ZONE.hill, offset: 0.4 },
  D: { zone: ZONE.field, offset: -0.08 },
  W: { zone: ZONE.wetland, offset: -0.12 },
  R: { zone: ZONE.reservoir, offset: -0.2 },
  B: { zone: ZONE.base, offset: 0 },
  I: { zone: ZONE.inlet, offset: 0 },
  O: { zone: ZONE.outlet, offset: -0.1 },
};

/** Cell flag bits in `SimGrid.flags`. */
export const FLAG_OUTLET = 1;
export const FLAG_INLET = 2;
export const FLAG_BASE_CORE = 4;
/** Glacier-lake dam ice cell (warned before it collapses). */
export const FLAG_LAKE_DAM = 8;
/** Skill-built ice dam cell: own melt rate (`SimGrid.iceMelt`), exempt from the glacier-lake collapse. */
export const FLAG_SKILL_ICE = 16;
/** `SimGrid.zoneId` value for cells outside every authored zone. */
export const NO_ZONE = 255;

// --- structures ------------------------------------------------------------
/** Levee heights for Rank 1/2/3. */
export const LEVEE_HEIGHTS = [0.3, 0.4, 0.5] as const;
export const SANDBAG_HEIGHT = 0.25;
export const LEVEE_START_DURABILITY = 1.0;
/** Durability lost per second per unit of pressure. */
export const LEVEE_WEAR_PER_SEC = 0.012;

// --- ice -------------------------------------------------------------------
export const ICE_MELT_PER_TICK = 0.0008;
/**
 * Glacier-lake dam failure: an ice cell collapses (ice -> 0, all at once) when its
 * thickness drops below this ratio times the water surface height it holds back
 * (neighbour surface - own ground). A ratio above 1 makes the dam fail BEFORE it
 * is overtopped, which turns a slow leak into a burst.
 */
export const ICE_COLLAPSE_RATIO = 1.25;
/** A glacier-lake collapse is announced this many seconds before it happens. */
export const ICE_WARN_SEC = 3;

// --- sinks -----------------------------------------------------------------
export const PUMP_RADIUS = 3;
export const PUMP_CELL_RATE = 0.015;
/** Per-pump tick budget = this * (W3 mean inflow per tick). */
export const PUMP_BUDGET_FRACTION = 0.25;
export const OUTLET_RATE = 0.05;
export const WETLAND_ABSORB = 0.004;
export const FOREST_ABSORB_FACTOR = 0.5;
export const EVAPORATION = 0.00002;

// --- inflow ----------------------------------------------------------------
/** Wave-volume growth table (1.35^n as constants, no Math.pow drift). */
export const GROWTH = [1, 1.35, 1.8225, 2.4604, 3.3215] as const;
export const WAVE_SEC_START = 40;
export const WAVE_SEC_STEP = 7.5;
export const DEFAULT_RAIN = 0.2;
export const DEFAULT_PULSE_EVERY = 45;
/** Inlet cells never hold more than this much water from a pulse. */
export const INLET_CELL_CAP = 2.0;
/** Wave whose mean inflow rate the pump budget is derived from. */
export const PUMP_REFERENCE_WAVE = 3;

// --- base damage and metrics -----------------------------------------------
export const BASE_FLOOD_THRESHOLD = 1.2;
export const BASE_DAMAGE_RATE = 2;
export const START_HP = 100;
export const BLOCKED_COEF = 0.01;
export const FOREST_FLOOD_DEPTH = 0.1;
/** 10 seconds of flooding before a forest starts to die. */
export const FOREST_FLOOD_TICKS = 300;
export const FOREST_DECAY_PER_SEC = 0.1;
export const ECOLOGY_MAX = 150;
