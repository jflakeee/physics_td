import type { SimGrid } from '../core/types.ts';
import { CELLS, FLAG_BASE_CORE, FLAG_INLET, FLAG_OUTLET, GRID_H, GRID_W, TILE_SIZE } from '../sim/constants.ts';

/** Zone palette indexed by `ZONE` code (none, plain, forest, hill, field, wetland, reservoir, base, inlet, outlet). */
const ZONE_RGB: readonly (readonly [number, number, number])[] = [
  [60, 60, 60], [155, 191, 106], [79, 138, 60], [168, 144, 96], [216, 196, 106],
  [106, 165, 154], [90, 143, 176], [217, 140, 74], [122, 155, 184], [122, 155, 184],
];
const INLET_RGB = [42, 111, 214] as const;
const OUTLET_RGB = [27, 63, 122] as const;
const CORE_RGB = [242, 226, 192] as const;
/** Contour interval in height units (spec 13). */
const CONTOUR_STEP = 0.5;
/** Height range mapped to the shade ramp. */
const SHADE_MIN_H = 0.4;
const SHADE_SPAN_H = 1.2;

/**
 * Render the static terrain (zone palette x height shade, contours every 0.5, zone
 * borders, inlet/outlet/base marks) into an offscreen canvas at board resolution.
 * Rebuild only when the board is resized or zones/heights change.
 * @example const terrain = buildTerrainLayer(state.grid, size.pxW, size.pxH);
 */
export function buildTerrainLayer(g: SimGrid, pxW: number, pxH: number): HTMLCanvasElement {
  const cells = document.createElement('canvas');
  cells.width = GRID_W;
  cells.height = GRID_H;
  const cctx = cells.getContext('2d') as CanvasRenderingContext2D;
  const img = cctx.createImageData(GRID_W, GRID_H);
  const d = img.data;
  for (let i = 0; i < CELLS; i++) {
    const f = g.flags[i];
    const rgb = f & FLAG_BASE_CORE ? CORE_RGB : f & FLAG_INLET ? INLET_RGB : f & FLAG_OUTLET ? OUTLET_RGB : ZONE_RGB[g.zone[i]];
    const s = 0.7 + 0.3 * Math.min(1, Math.max(0, (g.h[i] - SHADE_MIN_H) / SHADE_SPAN_H));
    d[i * 4] = rgb[0] * s;
    d[i * 4 + 1] = rgb[1] * s;
    d[i * 4 + 2] = rgb[2] * s;
    d[i * 4 + 3] = 255;
  }
  cctx.putImageData(img, 0, 0);

  const layer = document.createElement('canvas');
  layer.width = pxW;
  layer.height = pxH;
  const ctx = layer.getContext('2d') as CanvasRenderingContext2D;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(cells, 0, 0, pxW, pxH);
  const sx = pxW / GRID_W;
  const sy = pxH / GRID_H;

  ctx.beginPath();
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const i = y * GRID_W + x;
      const band = Math.floor(g.h[i] / CONTOUR_STEP);
      if (x < GRID_W - 1 && Math.floor(g.h[i + 1] / CONTOUR_STEP) !== band) {
        ctx.moveTo((x + 1) * sx, y * sy);
        ctx.lineTo((x + 1) * sx, (y + 1) * sy);
      }
      if (y < GRID_H - 1 && Math.floor(g.h[i + GRID_W] / CONTOUR_STEP) !== band) {
        ctx.moveTo(x * sx, (y + 1) * sy);
        ctx.lineTo((x + 1) * sx, (y + 1) * sy);
      }
    }
  }
  ctx.strokeStyle = 'rgba(40,30,20,0.35)';
  ctx.lineWidth = Math.max(1, sx * 0.15);
  ctx.stroke();

  ctx.beginPath();
  for (let x = TILE_SIZE; x < GRID_W; x += TILE_SIZE) {
    ctx.moveTo(x * sx, 0);
    ctx.lineTo(x * sx, pxH);
  }
  for (let y = TILE_SIZE; y < GRID_H; y += TILE_SIZE) {
    ctx.moveTo(0, y * sy);
    ctx.lineTo(pxW, y * sy);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.stroke();
  return layer;
}
