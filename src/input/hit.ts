import type { SimState } from '../core/types.ts';
import { GRID_H, GRID_W, NO_ZONE, TILE_SIZE, ZONE } from '../sim/constants.ts';

/** Pump hit radius in cells (spec 14.2). */
export const PUMP_HIT_RADIUS = 2;
/** Gate hit radius in cells (Chebyshev): a gate line is 1 cell wide, too thin to tap exactly. */
export const GATE_HIT_RADIUS = 1;
/** A tap on a cell without a zone (edge, inlet, outlet) snaps to the nearest zone within this radius. */
export const ZONE_SNAP_RADIUS = 2;

/** Result of a board hit test: pump index, gate index, zone id (-1 = none). */
export interface Hit {
  pump: number;
  gate: number;
  zone: number;
}

/** A hit on nothing. */
export const NO_HIT: Readonly<Hit> = { pump: -1, gate: -1, zone: -1 };

/**
 * Zone id of a cell from the map zone layer, -1 outside every zone.
 * @example zoneOfCell(state, cell) >= 0
 */
export function zoneOfCell(state: SimState, cell: number): number {
  const z = state.grid.zoneId[cell];
  return z === NO_ZONE ? -1 : z;
}

/**
 * Centre cell of an authoring tile (pump placement).
 * @example const c = tileCenterCell(5, 4);
 */
export function tileCenterCell(tx: number, ty: number): number {
  return (ty * TILE_SIZE + TILE_SIZE / 2) * GRID_W + tx * TILE_SIZE + TILE_SIZE / 2;
}

/**
 * Terrain type code (`ZONE.*`) of a zone: the most common type among its cells
 * (spec 26.1; ties go to the lower code), so zone conversions change it.
 * @example zoneType(state, 3) === ZONE.plain
 */
export function zoneType(state: SimState, zone: number): number {
  const counts = new Array<number>(Object.keys(ZONE).length).fill(0);
  for (const c of state.zones.cells[zone] ?? []) counts[state.grid.zone[c]]++;
  let best = 0;
  for (let k = 1; k < counts.length; k++) if (counts[k] > counts[best]) best = k;
  return best;
}

/**
 * Whether a zone type can be selected by a tap (inlets, outlets and empty cells cannot).
 * @example isSelectableType(ZONE.inlet) === false
 */
export function isSelectableType(type: number): boolean {
  return type !== ZONE.none && type !== ZONE.inlet && type !== ZONE.outlet;
}

/**
 * All cells of a zone.
 * @example freezeCells(grid, zoneCells(state, z), 0.3);
 */
export function zoneCells(state: SimState, zone: number): readonly number[] {
  return state.zones.cells[zone];
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
 * Hit test with spec 14.2 priority: nearest pump within 2 cells, then a gate cell
 * (1 cell tolerance), then the cell's zone, else the nearest selectable zone within 2 cells.
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
  let gate = -1;
  let gateBest = Infinity;
  for (let k = 0; k < state.gates.length; k++) {
    for (const gc of state.gates[k].cells) {
      const dx = (gc % GRID_W) - x;
      const dy = Math.floor(gc / GRID_W) - y;
      const d = dx * dx + dy * dy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) <= GATE_HIT_RADIUS && d < gateBest) {
        gateBest = d;
        gate = k;
      }
    }
  }
  const selectable = (c: number): boolean => {
    const z = zoneOfCell(state, c);
    return z >= 0 && isSelectableType(zoneType(state, z));
  };
  let zone = -1;
  if (selectable(cell)) {
    zone = zoneOfCell(state, cell);
  } else {
    let bestD = Infinity;
    for (let dy = -ZONE_SNAP_RADIUS; dy <= ZONE_SNAP_RADIUS; dy++) {
      for (let dx = -ZONE_SNAP_RADIUS; dx <= ZONE_SNAP_RADIUS; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        const d = dx * dx + dy * dy;
        if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H || d > ZONE_SNAP_RADIUS * ZONE_SNAP_RADIUS) continue;
        const c = ny * GRID_W + nx;
        if (d < bestD && selectable(c)) {
          bestD = d;
          zone = zoneOfCell(state, c);
        }
      }
    }
  }
  return { pump, gate, zone };
}
