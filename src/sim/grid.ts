import type { SimGrid } from '../core/types.ts';
import { CELLS, ICE_MELT_PER_TICK, NO_ZONE } from './constants.ts';

/**
 * Allocate an empty grid (all zero). Every per-tick scratch array is allocated here,
 * so stepping never allocates.
 * @example const g = createGrid(); g.w[100] = 0.5;
 */
export function createGrid(): SimGrid {
  return {
    zoneId: new Uint8Array(CELLS).fill(NO_ZONE),
    gate: new Float32Array(CELLS),
    w: new Float64Array(CELLS),
    ice: new Float32Array(CELLS),
    iceMelt: new Float32Array(CELLS).fill(ICE_MELT_PER_TICK),
    h: new Float32Array(CELLS),
    wall: new Float32Array(CELLS),
    tmp: new Float32Array(CELLS),
    tmpTtl: new Uint16Array(CELLS),
    dur: new Float32Array(CELLS),
    zone: new Uint8Array(CELLS),
    health: new Float32Array(CELLS),
    flags: new Uint8Array(CELLS),
    floodTicks: new Uint16Array(CELLS),
    head: new Float64Array(CELLS),
    flowOut: new Float64Array(CELLS * 4),
    flowScale: new Float64Array(CELLS),
  };
}

/**
 * Total water volume (double precision sum).
 * @example const before = totalWater(g);
 */
export function totalWater(g: SimGrid): number {
  let s = 0;
  for (let i = 0; i < CELLS; i++) s += g.w[i];
  return s;
}
