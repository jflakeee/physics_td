import type { Gate, SimGrid, SimState } from '../core/types.ts';
import { CELLS, GRID_H, GRID_W, LEVEE_START_DURABILITY, LEVEE_WEAR_PER_SEC, TICKS_PER_SEC } from './constants.ts';

/**
 * Build (or raise) a permanent levee on the given cells with full durability.
 * @example buildLevee(grid, ringCells, LEVEE_HEIGHTS[1]);
 */
export function buildLevee(g: SimGrid, cells: ArrayLike<number>, height: number): void {
  for (let k = 0; k < cells.length; k++) {
    g.wall[cells[k]] = height;
    g.dur[cells[k]] = LEVEE_START_DURABILITY;
  }
}

/**
 * Place a temporary wall (sandbag) that disappears after `ttl` ticks.
 * @example placeTempWall(grid, cells, SANDBAG_HEIGHT, 900);
 */
export function placeTempWall(g: SimGrid, cells: ArrayLike<number>, height: number, ttl: number): void {
  for (let k = 0; k < cells.length; k++) {
    g.tmp[cells[k]] = height;
    g.tmpTtl[cells[k]] = ttl;
  }
}

/**
 * Open or close a gate: closed raises `grid.gate` on its cells to the gate height.
 * @example setGate(state.grid, state.gates[0], false);
 */
export function setGate(g: SimGrid, gate: Gate, open: boolean): void {
  gate.open = open;
  for (const c of gate.cells) g.gate[c] = open ? 0 : gate.height;
}

/**
 * Tick 6: levee wear from pressure, collapse at durability 0, temp wall expiry.
 * pressure = max over neighbours of clamp(ground + water - own ground, 0, wall);
 * collapsed cells are listed in `state.fx.leveeCollapsed`.
 * @example updateStructures(state);
 */
export function updateStructures(state: SimState): void {
  const { grid: g, mods } = state;
  const { w, h, wall, dur, tmp, tmpTtl } = g;
  const wear = LEVEE_WEAR_PER_SEC / TICKS_PER_SEC / mods.wallDurabilityMul;
  for (let i = 0; i < CELLS; i++) {
    const wi = wall[i];
    if (wi > 0) {
      const x = i % GRID_W;
      const y = (i / GRID_W) | 0;
      let m = 0;
      if (x > 0) m = Math.max(m, h[i - 1] + w[i - 1] - h[i]);
      if (x < GRID_W - 1) m = Math.max(m, h[i + 1] + w[i + 1] - h[i]);
      if (y > 0) m = Math.max(m, h[i - GRID_W] + w[i - GRID_W] - h[i]);
      if (y < GRID_H - 1) m = Math.max(m, h[i + GRID_W] + w[i + GRID_W] - h[i]);
      dur[i] -= wear * Math.min(m, wi);
      if (dur[i] <= 0) {
        wall[i] = 0;
        dur[i] = 0;
        state.fx.leveeCollapsed.push(i);
      }
    }
    if (tmpTtl[i] > 0 && --tmpTtl[i] === 0) tmp[i] = 0;
  }
}
