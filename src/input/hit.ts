import type { SimGrid, SimState } from '../core/types.ts';
import { GRID_H, GRID_W, TILE_SIZE, TILES_X, TILES_Y, ZONE } from '../sim/constants.ts';

/**
 * Zones are the 8x8-cell authoring tiles until Story 004 adds a map `zones` layer.
 * Zone id = ty * TILES_X + tx; the zone type is the tile's `SimGrid.zone` code.
 */
export const ZONE_COUNT = TILES_X * TILES_Y;
/** Pump hit radius in cells (spec 14.2). */
export const PUMP_HIT_RADIUS = 2;
/** A tap on a cell without a zone (edge, inlet, outlet) snaps to the nearest zone within this radius. */
export const ZONE_SNAP_RADIUS = 2;

/** Result of a board hit test: pump index (-1 none) and zone id (-1 none). */
export interface Hit {
  pump: number;
  zone: number;
}

/** A hit on nothing. */
export const NO_HIT: Readonly<Hit> = { pump: -1, zone: -1 };

/**
 * Zone id of a cell.
 * @example zoneOfCell(0) === 0
 */
export function zoneOfCell(cell: number): number {
  const x = cell % GRID_W;
  const y = Math.floor(cell / GRID_W);
  return Math.floor(y / TILE_SIZE) * TILES_X + Math.floor(x / TILE_SIZE);
}

/**
 * Centre cell of a zone (used for pump placement and the zone type lookup).
 * @example const c = zoneCenterCell(27);
 */
export function zoneCenterCell(zone: number): number {
  const tx = zone % TILES_X;
  const ty = Math.floor(zone / TILES_X);
  return (ty * TILE_SIZE + TILE_SIZE / 2) * GRID_W + tx * TILE_SIZE + TILE_SIZE / 2;
}

/**
 * Zone type code (`ZONE.*`) of a zone.
 * @example zoneType(state.grid, 27) === ZONE.plain
 */
export function zoneType(g: SimGrid, zone: number): number {
  return g.zone[zoneCenterCell(zone)];
}

/**
 * Whether a zone type can be selected by a tap (inlets, outlets and empty cells cannot).
 * @example isSelectableType(ZONE.inlet) === false
 */
export function isSelectableType(type: number): boolean {
  return type !== ZONE.none && type !== ZONE.inlet && type !== ZONE.outlet;
}

/**
 * All cells of a zone, row by row.
 * @example freezeCells(grid, zoneCells(z), 0.3);
 */
export function zoneCells(zone: number): number[] {
  const x0 = (zone % TILES_X) * TILE_SIZE;
  const y0 = Math.floor(zone / TILES_X) * TILE_SIZE;
  const out: number[] = [];
  for (let y = y0; y < y0 + TILE_SIZE; y++) {
    for (let x = x0; x < x0 + TILE_SIZE; x++) out.push(y * GRID_W + x);
  }
  return out;
}

/**
 * Border ring cells of a zone (placeholder levee line until Story 003 picks levee lines).
 * @example buildLevee(grid, zonePerimeter(z), LEVEE_HEIGHTS[0]);
 */
export function zonePerimeter(zone: number): number[] {
  const x0 = (zone % TILES_X) * TILE_SIZE;
  const y0 = Math.floor(zone / TILES_X) * TILE_SIZE;
  const last = TILE_SIZE - 1;
  const out: number[] = [];
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      if (x === 0 || y === 0 || x === last || y === last) out.push((y0 + y) * GRID_W + x0 + x);
    }
  }
  return out;
}

/**
 * Screen point to cell index (spec 14.2), -1 when outside the board rect.
 * @example const cell = cellAt(canvas.getBoundingClientRect(), e.clientX, e.clientY);
 */
export function cellAt(rect: DOMRectReadOnly, clientX: number, clientY: number): number {
  const x = Math.floor(((clientX - rect.left) / rect.width) * GRID_W);
  const y = Math.floor(((clientY - rect.top) / rect.height) * GRID_H);
  if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return -1;
  return y * GRID_W + x;
}

/**
 * Hit test with spec 14.2 priority: nearest pump within 2 cells, then the cell's zone,
 * else the nearest selectable zone within 2 cells. Gates have no sim structure yet.
 * @example const hit = hitTest(state, cell); if (hit.pump >= 0) togglePump(hit.pump);
 */
export function hitTest(state: SimState, cell: number): Hit {
  const x = cell % GRID_W;
  const y = Math.floor(cell / GRID_W);
  let pump = -1;
  let best = PUMP_HIT_RADIUS * PUMP_HIT_RADIUS;
  for (let k = 0; k < state.pumps.length; k++) {
    const pc = state.pumps[k].cell;
    const dx = (pc % GRID_W) - x;
    const dy = Math.floor(pc / GRID_W) - y;
    const d = dx * dx + dy * dy;
    if (d <= best) {
      best = d;
      pump = k;
    }
  }
  let zone = -1;
  if (isSelectableType(state.grid.zone[cell])) {
    zone = zoneOfCell(cell);
  } else {
    let bestD = Infinity;
    for (let dy = -ZONE_SNAP_RADIUS; dy <= ZONE_SNAP_RADIUS; dy++) {
      for (let dx = -ZONE_SNAP_RADIUS; dx <= ZONE_SNAP_RADIUS; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        const d = dx * dx + dy * dy;
        if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H || d > ZONE_SNAP_RADIUS * ZONE_SNAP_RADIUS) continue;
        const c = ny * GRID_W + nx;
        if (d < bestD && isSelectableType(state.grid.zone[c])) {
          bestD = d;
          zone = zoneOfCell(c);
        }
      }
    }
  }
  return { pump, zone };
}
