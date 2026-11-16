import type { SimGrid } from '../core/types.ts';
import {
  BASE_LEVEL, FLAG_BASE_CORE, FLAG_INLET, FLAG_OUTLET, GRID_H, GRID_W, NOISE_AMP, PORT_LENGTH,
  PORT_OFFSET, SLOPE, TILE_SIZE, TILE_TYPES, TILES_X, TILES_Y, ZONE,
} from './constants.ts';
import { createGrid } from './grid.ts';

/** Result of converting a tile map into simulation terrain. */
export interface Terrain {
  grid: SimGrid;
  /** Cell indices of each inlet strip, in tile scan order. */
  inlets: number[][];
  /** 3x3 base core cell indices. */
  base: number[];
  /** Base centre cell. */
  center: [number, number];
}

/** Integer hash noise in [0, 1). No Math.sin / Math.random. */
function hash2(x: number, y: number, salt: number): number {
  let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(salt, 1442695041)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/**
 * Convert 12 tile strings of 8 chars into simulation terrain (spec 11.2): basin
 * height = 0.6 + 0.8 * normalized distance from the base + tile type offset + noise;
 * inlet/outlet strips on the map edge; 3x3 base core.
 * @param tiles 12 strings of 8 tile letters (P F H D W R B I O).
 * @param noiseSalt Per-map salt for the height noise.
 * @example const t = buildTerrain(['PPPIPPPO', ...], 11); t.grid.h[0];
 */
export function buildTerrain(tiles: readonly string[], noiseSalt = 0): Terrain {
  const grid = createGrid();

  let sx = 0;
  let sy = 0;
  let count = 0;
  for (let ty = 0; ty < TILES_Y; ty++) {
    for (let tx = 0; tx < TILES_X; tx++) {
      if (tiles[ty][tx] !== 'B') continue;
      sx += tx * TILE_SIZE + TILE_SIZE / 2;
      sy += ty * TILE_SIZE + TILE_SIZE / 2;
      count++;
    }
  }
  const bx = Math.round(sx / count) - 0.5;
  const by = Math.round(sy / count) - 0.5;
  const dmax = Math.hypot(Math.max(bx, GRID_W - bx), Math.max(by, GRID_H - by));

  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const type = TILE_TYPES[tiles[y >> 3][x >> 3]];
      const i = y * GRID_W + x;
      const dist = Math.hypot(x - bx, y - by) / dmax;
      grid.h[i] = BASE_LEVEL + SLOPE * dist + type.offset + (hash2(x, y, noiseSalt) - 0.5) * NOISE_AMP;
      grid.zone[i] = type.zone;
      if (type.zone === ZONE.forest || type.zone === ZONE.wetland) grid.health[i] = 1;
    }
  }

  const cx = Math.floor(bx);
  const cy = Math.floor(by);
  const base: number[] = [];
  for (let y = cy - 1; y <= cy + 1; y++) {
    for (let x = cx - 1; x <= cx + 1; x++) {
      base.push(y * GRID_W + x);
      grid.flags[y * GRID_W + x] |= FLAG_BASE_CORE;
    }
  }

  const inlets: number[][] = [];
  for (let ty = 0; ty < TILES_Y; ty++) {
    for (let tx = 0; tx < TILES_X; tx++) {
      const ch = tiles[ty][tx];
      if (ch !== 'I' && ch !== 'O') continue;
      const cells: number[] = [];
      for (let k = PORT_OFFSET; k < PORT_OFFSET + PORT_LENGTH; k++) {
        if (ty === 0) cells.push(tx * TILE_SIZE + k);
        else if (ty === TILES_Y - 1) cells.push((GRID_H - 1) * GRID_W + tx * TILE_SIZE + k);
        else if (tx === 0) cells.push((ty * TILE_SIZE + k) * GRID_W);
        else if (tx === TILES_X - 1) cells.push((ty * TILE_SIZE + k) * GRID_W + GRID_W - 1);
      }
      if (ch === 'I') {
        for (const c of cells) grid.flags[c] |= FLAG_INLET;
        inlets.push(cells);
      } else {
        for (const c of cells) grid.flags[c] |= FLAG_OUTLET;
      }
    }
  }

  return { grid, inlets, base, center: [cx, cy] };
}
