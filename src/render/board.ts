import type { SimState } from '../core/types.ts';
import { GRID_W } from '../sim/constants.ts';
import type { BoardSize } from './canvas.ts';
import { drawGates, drawPumps, drawStructures, drawZoneOverlay } from './overlayLayer.ts';
import { buildTerrainLayer } from './terrainLayer.ts';
import { createWaterLayer } from './waterLayer.ts';

/** Board renderer: cached terrain, per-frame water/structures/pumps/overlay. */
export interface Board {
  /** Apply a new size and rebuild the cached terrain layer. */
  resize(size: BoardSize): void;
  /**
   * Draw one frame.
   * @param selected Highlighted zone (-1 none).
   * @param valid Per-zone valid-target mask while targeting, else null.
   * @param timeMs Animation clock (0 = reduced motion).
   */
  render(state: SimState, selected: number, valid: Uint8Array | null, timeMs: number): void;
}

/**
 * Create the board renderer on a canvas (spec 13 layer order).
 * @example const board = createBoard(canvas, state); board.resize(fitBoard(canvas, w, h));
 */
export function createBoard(canvas: HTMLCanvasElement, state: SimState): Board {
  const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
  const water = createWaterLayer();
  let terrain: HTMLCanvasElement | null = null;
  let w = 0;
  let h = 0;
  return {
    resize(size: BoardSize): void {
      w = size.pxW;
      h = size.pxH;
      terrain = buildTerrainLayer(state.grid, w, h);
    },
    render(st: SimState, selected: number, valid: Uint8Array | null, timeMs: number): void {
      if (!terrain) return;
      const s = w / GRID_W;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(terrain, 0, 0);
      water.update(st.grid);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(water.canvas, 0, 0, w, h);
      drawStructures(ctx, st.grid, s);
      drawGates(ctx, st.gates, s);
      drawPumps(ctx, st.pumps, st.maxPumpsOn, s, timeMs);
      drawZoneOverlay(ctx, s, st.zones.tileZone, selected, valid);
    },
  };
}
