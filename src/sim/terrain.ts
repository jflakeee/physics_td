import type { Gate, SimGrid, ZoneLayer } from '../core/types.ts';
import {
  BASE_LEVEL, FLAG_BASE_CORE, FLAG_INLET, FLAG_LAKE_DAM, FLAG_OUTLET, GRID_H, GRID_W, NOISE_AMP, PORT_LENGTH,
  PORT_OFFSET, SLOPE, TILE_SIZE, TILE_TYPES, TILES_X, TILES_Y, ZONE,
} from './constants.ts';
import { createGrid } from './grid.ts';
import { setGate } from './structures.ts';
import { buildZoneLayer } from './zones.ts';

/** Gate authoring data: a wall line through the middle of a tile. */
export interface GateSpec {
  tile: readonly [number, number];
  /** `h`: the line runs along x (blocks flow in y); `v`: along y. */
  axis: 'h' | 'v';
  /** Wall height while closed. */
  height: number;
  open: boolean;
}

/** Glacier-lake authoring data: reservoir tiles held back by a one-cell ice ring. */
export interface LakeSpec {
  tiles: readonly (readonly [number, number])[];
  /** Water surface height above the dam ground (the head the dam holds back). */
  depth: number;
  /** Initial ice thickness of the dam ring; thicker = collapses later. */
  damIce: number;
}

/** Optional map layers consumed by `buildTerrain`. */
export interface TerrainOptions {
  /** 12 x 8 zone layer; omitted = every tile its own zone. */
  zones?: readonly string[];
  gates?: readonly GateSpec[];
  lake?: LakeSpec;
}

/** Result of converting a tile map into simulation terrain. */
export interface Terrain {
  grid: SimGrid;
  /** Cell indices of each inlet strip, in tile scan order. */
  inlets: number[][];
  /** 3x3 base core cell indices. */
  base: number[];
  /** Base centre cell. */
  center: [number, number];
  zones: ZoneLayer;
  gates: Gate[];
  /** Ice ring cells of the glacier lake (empty without a lake). */
  lakeDam: number[];
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
 * Also builds the zone layer, gates (closed ones raise `grid.gate`) and the glacier lake.
 * @param noiseSalt Per-map salt for the height noise.
 * @example const t = buildTerrain(['PPPIPPPO', ...], 11); t.grid.h[0];
 */
export function buildTerrain(tiles: readonly string[], noiseSalt = 0, opts: TerrainOptions = {}): Terrain {
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

  const zones = buildZoneLayer(grid, opts.zones, [(bx + 0.5) / TILE_SIZE, (by + 0.5) / TILE_SIZE]);
  const gates = (opts.gates ?? []).map((spec, id): Gate => {
    const [tx, ty] = spec.tile;
    const cells: number[] = [];
    for (let k = 0; k < TILE_SIZE; k++) {
      cells.push(spec.axis === 'h' ? (ty * TILE_SIZE + TILE_SIZE / 2) * GRID_W + tx * TILE_SIZE + k : (ty * TILE_SIZE + k) * GRID_W + tx * TILE_SIZE + TILE_SIZE / 2);
    }
    const gate: Gate = { id, cells, height: spec.height, open: true };
    setGate(grid, gate, spec.open);
    return gate;
  });
  const lakeDam = opts.lake ? buildLake(grid, opts.lake) : [];
  return { grid, inlets, base, center: [cx, cy], zones, gates, lakeDam };
}

/** Fill the lake tiles to a flat surface and ring them with ice; returns the ring cells. */
function buildLake(grid: SimGrid, lake: LakeSpec): number[] {
  const inLake = new Uint8Array(grid.h.length);
  for (const [tx, ty] of lake.tiles) {
    for (let y = ty * TILE_SIZE; y < (ty + 1) * TILE_SIZE; y++) {
      for (let x = tx * TILE_SIZE; x < (tx + 1) * TILE_SIZE; x++) inLake[y * GRID_W + x] = 1;
    }
  }
  const ring: number[] = [];
  for (let i = 0; i < inLake.length; i++) {
    if (inLake[i]) continue;
    const x = i % GRID_W;
    const y = (i / GRID_W) | 0;
    if ((x > 0 && inLake[i - 1]) || (x < GRID_W - 1 && inLake[i + 1]) || (y > 0 && inLake[i - GRID_W]) || (y < GRID_H - 1 && inLake[i + GRID_W])) ring.push(i);
  }
  let ground = 0;
  for (const i of ring) ground += grid.h[i];
  const surface = ground / ring.length + lake.depth;
  for (let i = 0; i < inLake.length; i++) if (inLake[i]) grid.w[i] = Math.max(0, surface - grid.h[i]);
  for (const i of ring) {
    grid.ice[i] = lake.damIce;
    grid.flags[i] |= FLAG_LAKE_DAM;
  }
  return ring;
}
