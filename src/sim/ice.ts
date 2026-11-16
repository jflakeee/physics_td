import type { SimGrid, SimState } from '../core/types.ts';
import {
  CELLS, GRID_H, GRID_W, ICE_COLLAPSE_RATIO, ICE_MELT_PER_TICK, ICE_WARN_SEC, TICKS_PER_SEC,
} from './constants.ts';

/**
 * Freeze cells to at least the given ice thickness. Ice adds to the head, so it
 * acts as a wall until it melts; water already in the cell is squeezed out.
 * A glacier-lake dam is a row of frozen cells holding back a reservoir.
 * @example freezeCells(grid, damCells, 0.5);
 */
export function freezeCells(g: SimGrid, cells: ArrayLike<number>, thickness: number): void {
  for (let k = 0; k < cells.length; k++) {
    if (g.ice[cells[k]] < thickness) g.ice[cells[k]] = thickness;
  }
}

/**
 * Tick 4: melt every ice cell by 0.0008, then collapse ice that is too thin for the
 * water it holds. An ice cell fails (ice -> 0 at once) when
 * `ice < ICE_COLLAPSE_RATIO * max_neighbour(ground + water - own ground)`. A failure
 * unzips the dam: every ice cell next to a collapsed one that still holds back water
 * collapses too (flood fill within the same tick), so a melting glacier-lake dam
 * releases its whole reservoir in one burst instead of a trickle. Collapsed cells
 * are listed in `state.fx.iceCollapsed`. When the lake dam (`state.lakeDam`) would
 * fail within `ICE_WARN_SEC` at the current melt rate and water level,
 * `state.fx.iceWarning` is raised once per run (the lake has one dam).
 * @example updateIce(state);
 */
export function updateIce(state: SimState): void {
  const { ice, h, w } = state.grid;
  const failed = state.fx.iceCollapsed;
  for (let i = 0; i < CELLS; i++) {
    if (ice[i] <= 0) continue;
    const t = ice[i] - ICE_MELT_PER_TICK;
    ice[i] = t > 0 ? t : 0;
    if (ice[i] > 0 && ice[i] < ICE_COLLAPSE_RATIO * heldBack(h, w, i)) failed.push(i);
  }
  // Collapse after the scan so the scan result does not depend on cell order.
  for (let k = 0; k < failed.length; k++) ice[failed[k]] = 0;
  for (let k = 0; k < failed.length; k++) {
    const i = failed[k];
    const x = i % GRID_W;
    const y = (i / GRID_W) | 0;
    if (x > 0) unzip(state, i - 1);
    if (x < GRID_W - 1) unzip(state, i + 1);
    if (y > 0) unzip(state, i - GRID_W);
    if (y < GRID_H - 1) unzip(state, i + GRID_W);
  }
  if (state.lakeDam.length > 0) warnLakeCollapse(state);
}

/** Raise `fx.iceWarning` (once per run) when the lake dam is within `ICE_WARN_SEC` of its first failure. */
function warnLakeCollapse(state: SimState): void {
  const { ice, h, w } = state.grid;
  if (state.iceWarned) return;
  let soonest = Infinity;
  for (const i of state.lakeDam) {
    const held = heldBack(h, w, i);
    if (ice[i] > 0 && held > 0) soonest = Math.min(soonest, (ice[i] - ICE_COLLAPSE_RATIO * held) / ICE_MELT_PER_TICK);
  }
  if (soonest <= ICE_WARN_SEC * TICKS_PER_SEC) {
    state.fx.iceWarning = true;
    state.iceWarned = true;
  }
}

/** Water surface height above cell i's ground that its neighbours push on it (>= 0). */
function heldBack(h: Float32Array, w: Float64Array, i: number): number {
  const x = i % GRID_W;
  const y = (i / GRID_W) | 0;
  let m = 0;
  if (x > 0) m = Math.max(m, h[i - 1] + w[i - 1] - h[i]);
  if (x < GRID_W - 1) m = Math.max(m, h[i + 1] + w[i + 1] - h[i]);
  if (y > 0) m = Math.max(m, h[i - GRID_W] + w[i - GRID_W] - h[i]);
  if (y < GRID_H - 1) m = Math.max(m, h[i + GRID_W] + w[i + GRID_W] - h[i]);
  return m;
}

/** Collapse ice cell i (queued for further unzipping) if it is holding back water. */
function unzip(state: SimState, i: number): void {
  const { ice, h, w } = state.grid;
  if (ice[i] > 0 && heldBack(h, w, i) > 0) {
    ice[i] = 0;
    state.fx.iceCollapsed.push(i);
  }
}
