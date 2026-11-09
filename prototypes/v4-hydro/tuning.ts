/** V4 hydro prototype numbers (docs/REDESIGN_V4_HYDRO.md). Prototype: one place to tune. */
export const T = {
  tps: 30,
  K: 0.2,
  /** Water entering at the top per tick at weather ×1. */
  baseInflow: 0.07,
  /** Power per tick = powerScale · η · Q · H · (1 − drown). */
  powerScale: 6,
  eta: 0.8,
  /** River depth where a turbine starts to drown, and where it is fully under. */
  drownFrom: 0.5, drownTo: 0.8,
  /** Plant health lost per tick while drowning (fully under = 1). 0 → broken. */
  plantWear: 1 / (30 * 25),
  repairCost: 30,
  /** Village demand in power per second (+demandGrow each second: the village grows); coins per second while met. */
  demand: 2.4, demandGrow: 0.025, coinPerSec: 2,
  /** Seconds of blackout before a heart is lost. */
  blackoutSeconds: 8,
  /** Water in the village cells that costs a heart (then it is pumped out). */
  villageFloodLimit: 6,
  hearts: 3,
  startCoins: 80,
  cost: { wheel: 60, reservoir: 70, wall: 40 },
  /** XP needed for level L → L+1: xpBase · xpGrowth^(L−1). */
  xpBase: 120, xpGrowth: 1.3,
  /** Seconds before a weather change that the forecast shows it. */
  forecastSeconds: 12,
  /** Bottom edge drains whatever reaches it. */
  outletRate: 0.6,
  /** Auto skills (Lv 1..5). */
  sand: { every: [14, 12, 10, 8, 6], cells: [8, 10, 12, 14, 16], height: 0.45, seconds: 22 },
  ice: { every: [16, 14, 12, 10, 8], frac: [0.35, 0.42, 0.5, 0.58, 0.66], cells: [30, 40, 50, 60, 70], droughtMelt: 0.004 },
  iceMelt: 0.0008,
  /** Look-ahead used by the spirits and the recommended build spot. */
  horizon: 90,
} as const;

/** Weather by season: from second `t`, inflow is multiplied by `mul` (linear ramp over `ramp` s). */
export interface Weather { t: number; mul: number; kind: 'clear' | 'rain' | 'drought' | 'thaw' | 'storm'; ramp?: number; boss?: boolean }
export const SEASONS: { name: string; seconds: number; weather: Weather[] }[] = [
  { name: '봄', seconds: 120, weather: [
    { t: 0, mul: 1, kind: 'clear' },
    { t: 28, mul: 1.8, kind: 'thaw', ramp: 10 },
    { t: 55, mul: 1, kind: 'clear', ramp: 6 },
    { t: 72, mul: 0.3, kind: 'drought', ramp: 4 },
    { t: 98, mul: 2.6, kind: 'thaw', ramp: 6, boss: true },
  ] },
  { name: '여름', seconds: 120, weather: [
    { t: 0, mul: 1, kind: 'clear', ramp: 6 },
    { t: 18, mul: 2.3, kind: 'rain', ramp: 4 },
    { t: 42, mul: 0.25, kind: 'drought', ramp: 4 },
    { t: 70, mul: 1, kind: 'clear', ramp: 4 },
    { t: 88, mul: 3.2, kind: 'storm', ramp: 4, boss: true },
  ] },
];
