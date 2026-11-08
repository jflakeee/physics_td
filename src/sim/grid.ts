import type { SimGrid } from '../core/types.ts';

/** Default sim grid size (§1): 64 × 96 cells, 8×8-cell tiles. */
export const GRID_W = 64;
export const GRID_H = 96;
export const TILE = 8;

/** Allocate an empty grid. */
export function createGrid(width = GRID_W, height = GRID_H): SimGrid {
  const n = width * height;
  return {
    width, height,
    w: new Float64Array(n), ice: new Float64Array(n), h: new Float32Array(n),
    wall: new Float32Array(n), gate: new Float32Array(n), tmp: new Float32Array(n),
    tmpTtl: new Uint16Array(n), dur: new Float32Array(n), flags: new Uint8Array(n),
  };
}

/** Deep copy (all typed arrays duplicated). */
export function cloneGrid(g: SimGrid): SimGrid {
  return {
    width: g.width, height: g.height,
    w: g.w.slice(), ice: g.ice.slice(), h: g.h.slice(), wall: g.wall.slice(), gate: g.gate.slice(),
    tmp: g.tmp.slice(), tmpTtl: g.tmpTtl.slice(), dur: g.dur.slice(), flags: g.flags.slice(),
  };
}

/** Cell index of (x, y). */
export function idx(g: SimGrid, x: number, y: number): number { return y * g.width + x; }

/** True if (x, y) is inside the grid. */
export function inBounds(g: SimGrid, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < g.width && y < g.height;
}

/** Total water (+ ice if `withIce`), summed in float64. */
export function totalWater(g: SimGrid, withIce = true): number {
  let s = 0;
  for (let i = 0; i < g.w.length; i++) s += g.w[i];
  if (withIce) for (let i = 0; i < g.ice.length; i++) s += g.ice[i];
  return s;
}
