import type { LeveeLine, SimGrid, ZoneLayer } from '../core/types.ts';
import { GRID_W, TILE_SIZE, TILES_X, TILES_Y } from './constants.ts';

/** Facing directions in tie-break order: N, E, S, W (unit vectors, +y down). */
const DIRS: readonly (readonly [number, number])[] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
/** Longest levee lines kept per zone (docs/DETAILED_DESIGN_V2.md 11.2). */
const MAX_LINES = 3;

/**
 * Build the zone layer of a map and write `grid.zoneId`.
 * `zoneRows` is the 12 x 8 `zones` layer (same char = same zone, `.` = none); when
 * omitted every tile is its own zone (id = ty * 8 + tx). Zone ids follow first
 * appearance in scan order. Levee lines (spec 11.2): per zone, the tile sides whose
 * neighbour lies farther from the base, joined into straight lines, the longest 3,
 * each one cell thick just inside the border and facing outward.
 * @param baseTile Base centre in tile units (x, y), used for the distance ordering.
 * @example const layer = buildZoneLayer(grid, map.zones, [4, 6]);
 */
export function buildZoneLayer(grid: SimGrid, zoneRows: readonly string[] | undefined, baseTile: readonly [number, number]): ZoneLayer {
  const tileZone = new Int16Array(TILES_X * TILES_Y).fill(-1);
  const ids = new Map<string, number>();
  for (let ty = 0; ty < TILES_Y; ty++) {
    for (let tx = 0; tx < TILES_X; tx++) {
      const k = ty * TILES_X + tx;
      if (zoneRows === undefined) {
        tileZone[k] = k;
        continue;
      }
      const ch = zoneRows[ty][tx];
      if (ch === '.') continue;
      if (!ids.has(ch)) ids.set(ch, ids.size);
      tileZone[k] = ids.get(ch) as number;
    }
  }
  const count = zoneRows === undefined ? tileZone.length : ids.size;
  const cells: number[][] = Array.from({ length: count }, () => []);
  for (let k = 0; k < tileZone.length; k++) {
    const z = tileZone[k];
    if (z < 0) continue;
    const x0 = (k % TILES_X) * TILE_SIZE;
    const y0 = Math.floor(k / TILES_X) * TILE_SIZE;
    for (let y = y0; y < y0 + TILE_SIZE; y++) {
      for (let x = x0; x < x0 + TILE_SIZE; x++) {
        cells[z].push(y * GRID_W + x);
        grid.zoneId[y * GRID_W + x] = z;
      }
    }
  }
  const dist = (k: number): number => Math.hypot((k % TILES_X) + 0.5 - baseTile[0], Math.floor(k / TILES_X) + 0.5 - baseTile[1]);
  const lines = Array.from({ length: count }, (_, z) => leveeLines(tileZone, z, dist));
  return { count, tileZone, cells, lines };
}

/** Levee lines of zone `z`, see `buildZoneLayer`. */
function leveeLines(tileZone: Int16Array, z: number, dist: (tile: number) => number): LeveeLine[] {
  const out: LeveeLine[] = [];
  for (let d = 0; d < DIRS.length; d++) {
    const [dx, dy] = DIRS[d];
    // Group qualifying sides by their border line, then join neighbours along it.
    const byLine = new Map<number, number[]>();
    for (let k = 0; k < tileZone.length; k++) {
      if (tileZone[k] !== z) continue;
      const nx = (k % TILES_X) + dx;
      const ny = Math.floor(k / TILES_X) + dy;
      if (nx < 0 || ny < 0 || nx >= TILES_X || ny >= TILES_Y) continue;
      const n = ny * TILES_X + nx;
      if (tileZone[n] === z || dist(n) <= dist(k)) continue;
      const along = dx === 0 ? k % TILES_X : Math.floor(k / TILES_X);
      const line = dx === 0 ? Math.floor(k / TILES_X) : k % TILES_X;
      if (!byLine.has(line)) byLine.set(line, []);
      (byLine.get(line) as number[]).push(along);
    }
    for (const [line, alongs] of byLine) {
      alongs.sort((a, b) => a - b);
      let run: number[] = [];
      const flush = (): void => {
        if (run.length > 0) out.push({ facing: [dx, dy], cells: lineCells(dx, dy, line, run) });
        run = [];
      };
      for (const a of alongs) {
        if (run.length > 0 && a !== run[run.length - 1] + 1) flush();
        run.push(a);
      }
      flush();
    }
  }
  // Stable sort: longest first, equal lengths keep N, E, S, W scan order.
  return out.sort((a, b) => b.cells.length - a.cells.length).slice(0, MAX_LINES);
}

/** Cells of a line: the border cell row/column inside the zone for a run of tiles. */
function lineCells(dx: number, dy: number, line: number, run: readonly number[]): number[] {
  const cells: number[] = [];
  const first = run[0] * TILE_SIZE;
  const last = (run[run.length - 1] + 1) * TILE_SIZE;
  const edge = (side: number): number => line * TILE_SIZE + (side > 0 ? TILE_SIZE - 1 : 0);
  for (let a = first; a < last; a++) {
    cells.push(dx === 0 ? edge(dy) * GRID_W + a : a * GRID_W + edge(dx));
  }
  return cells;
}
