import { FLAG } from '../core/types.ts';
import type { Inlet, SimGrid } from '../core/types.ts';
import { hash2 } from '../core/rng.ts';
import { createGrid, TILE } from './grid.ts';

/**
 * Tile map → sim terrain (docs/DETAILED_DESIGN_V2.md §11.2, GD §3.0 집수 분지).
 * Ground = base + slope × dist(base centre)/dmax + type offset + (hash − 0.5) × noise.
 * Zones and levee lines (§11.2 second half) are added with the map-data story (004).
 */

/** Type offsets relative to the basin surface (GD §3.0 타입 보정). */
export const TILE_OFFSET: Readonly<Record<string, number>> = Object.freeze({
  P: 0, F: 0.05, H: 0.4, D: -0.08, W: -0.12, R: -0.2, B: 0, I: 0, O: -0.1,
});

/** Basin shape parameters. */
export interface TerrainParams {
  baseLevel: number;   // 0.6
  slope: number;       // 0.8
  noise: number;       // 0.04 total span (±0.02)
  /** Cells per inlet/outlet edge opening (§11.2: 4). */
  edgeWidth: number;
  /** Offset of the opening from the tile's first cell (prototype: 2). */
  edgeOffset: number;
}

export const DEFAULT_TERRAIN: Readonly<TerrainParams> = Object.freeze({
  baseLevel: 0.6, slope: 0.8, noise: 0.04, edgeWidth: 4, edgeOffset: 2,
});

/** Result of building a map's terrain. */
export interface Terrain {
  grid: SimGrid;
  /** Base core 3×3 cells. */
  baseCore: Uint32Array;
  /** Base centre cell coordinates. */
  baseX: number; baseY: number;
  inlets: Inlet[];
  /** BFS step distance from the base core (4-neighbour, ignores height). */
  distToBase: Uint16Array;
}

/** Edge cells of a border tile (empty array for interior tiles). */
function edgeCells(tx: number, ty: number, tw: number, th: number, W: number, Hc: number, p: TerrainParams): number[] {
  const cells: number[] = [];
  const a = p.edgeOffset, b = p.edgeOffset + p.edgeWidth;
  if (ty === 0) for (let x = tx * TILE + a; x < tx * TILE + b; x++) cells.push(x);
  else if (ty === th - 1) for (let x = tx * TILE + a; x < tx * TILE + b; x++) cells.push((Hc - 1) * W + x);
  else if (tx === 0) for (let y = ty * TILE + a; y < ty * TILE + b; y++) cells.push(y * W);
  else if (tx === tw - 1) for (let y = ty * TILE + a; y < ty * TILE + b; y++) cells.push(y * W + W - 1);
  return cells;
}

/**
 * Build terrain from tile rows (one char per 8×8 tile).
 * @param tiles rows of tile chars, e.g. 12 rows × 8 chars for the 64×96 grid
 * @param inletWeights optional per-inlet wave weights (in tile scan order); default all 1
 */
export function buildTerrain(tiles: readonly string[], p: TerrainParams = DEFAULT_TERRAIN, inletWeights?: number[][]): Terrain {
  const th = tiles.length, tw = tiles[0].length;
  const W = tw * TILE, Hc = th * TILE;
  const g = createGrid(W, Hc);
  let bx = 0, by = 0, bc = 0;
  for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
    const t = tiles[ty][tx];
    if (TILE_OFFSET[t] === undefined) throw new Error(`unknown tile '${t}' at ${tx},${ty}`);
    if (t === 'B') { bx += tx * TILE + TILE / 2; by += ty * TILE + TILE / 2; bc++; }
  }
  if (bc === 0) throw new Error('map has no base tile');
  // centre between the middle cells of the B block (same rule as the calibration prototype)
  const fx = Math.round(bx / bc) - 0.5, fy = Math.round(by / bc) - 0.5;
  const dmax = Math.hypot(Math.max(fx, W - fx), Math.max(fy, Hc - fy));
  for (let y = 0; y < Hc; y++) for (let x = 0; x < W; x++) {
    const t = tiles[(y / TILE) | 0][(x / TILE) | 0];
    g.h[y * W + x] = p.baseLevel + p.slope * Math.hypot(x - fx, y - fy) / dmax + TILE_OFFSET[t] + (hash2(x, y) - 0.5) * p.noise;
  }
  const cx = Math.floor(fx), cy = Math.floor(fy);
  const core: number[] = [];
  for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) {
    const i = y * W + x; core.push(i); g.flags[i] |= FLAG.baseCore;
  }
  const inlets: Inlet[] = [];
  for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
    const t = tiles[ty][tx];
    if (t !== 'I' && t !== 'O') continue;
    const cells = edgeCells(tx, ty, tw, th, W, Hc, p);
    if (cells.length === 0) throw new Error(`${t} tile ${tx},${ty} is not on the map edge`);
    for (const c of cells) g.flags[c] |= t === 'I' ? FLAG.inlet : FLAG.outlet;
    if (t === 'I') {
      const k = inlets.length;
      inlets.push({ id: k, cells: Uint32Array.from(cells), weights: inletWeights?.[k] ?? [1, 1, 1, 1, 1] });
    }
  }
  return { grid: g, baseCore: Uint32Array.from(core), baseX: cx, baseY: cy, inlets, distToBase: bfsDistance(W, Hc, core) };
}

/** 4-neighbour BFS step distance from `sources` (0xffff = unreachable). */
export function bfsDistance(W: number, Hc: number, sources: readonly number[]): Uint16Array {
  const d = new Uint16Array(W * Hc).fill(0xffff);
  const q = new Uint32Array(W * Hc);
  let head = 0, tail = 0;
  for (const s of sources) { d[s] = 0; q[tail++] = s; }
  while (head < tail) {
    const i = q[head++], x = i % W, y = (i / W) | 0, nd = d[i] + 1;
    if (x + 1 < W && d[i + 1] > nd) { d[i + 1] = nd; q[tail++] = i + 1; }
    if (x > 0 && d[i - 1] > nd) { d[i - 1] = nd; q[tail++] = i - 1; }
    if (y + 1 < Hc && d[i + W] > nd) { d[i + W] = nd; q[tail++] = i + W; }
    if (y > 0 && d[i - W] > nd) { d[i - W] = nd; q[tail++] = i - W; }
  }
  return d;
}
