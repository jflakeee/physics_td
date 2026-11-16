import type { SimGrid } from '../core/types.ts';
import { GRID_H, GRID_W } from '../sim/constants.ts';

/** Depth colour table resolution and range (spec 13.1 water colour table). */
const LUT_SIZE = 256;
const LUT_MAX_DEPTH = 1.5;
const MIN_DEPTH = 0.02;
const SHALLOW_DEPTH = 0.3;
const DEEP_DEPTH = 1.0;
const ICE_MIN = 0.01;

/** Pack RGBA into a little-endian Uint32 pixel. */
function rgba(r: number, g: number, b: number, a: number): number {
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

/** Depth -> pixel. <0.02 clear, 0.02-0.3 sky, 0.3-1.0 blue, >=1.0 navy (striped for colour-blind contrast). */
const LUT: Uint32Array = (() => {
  const lut = new Uint32Array(LUT_SIZE);
  for (let k = 0; k < LUT_SIZE; k++) {
    const dep = (k / (LUT_SIZE - 1)) * LUT_MAX_DEPTH;
    if (dep < MIN_DEPTH) lut[k] = 0;
    else if (dep < SHALLOW_DEPTH) lut[k] = rgba(120, 200, 255, 90 + Math.round((60 * dep) / SHALLOW_DEPTH));
    else if (dep < DEEP_DEPTH) lut[k] = rgba(40, 110, 220, 170 + Math.round(40 * ((dep - SHALLOW_DEPTH) / (DEEP_DEPTH - SHALLOW_DEPTH))));
    else lut[k] = rgba(20, 40, 120, 230);
  }
  return lut;
})();
const STRIPE = rgba(70, 95, 185, 235);
const ICE = rgba(225, 245, 255, 235);
const DEEP_INDEX = Math.ceil((DEEP_DEPTH / LUT_MAX_DEPTH) * (LUT_SIZE - 1));

/** Cell-resolution water + ice layer: one ImageData written per frame. */
export interface WaterLayer {
  /** 64x96 canvas to drawImage (scaled, smoothed) onto the board. */
  canvas: HTMLCanvasElement;
  /** Rewrite every pixel from the grid and putImageData once. Allocation free. */
  update(g: SimGrid): void;
}

/**
 * Create the water layer (spec 13: 64x96 ImageData, cell = 1px, depth colour table).
 * @example const water = createWaterLayer(); water.update(grid); ctx.drawImage(water.canvas, 0, 0, w, h);
 */
export function createWaterLayer(): WaterLayer {
  const canvas = document.createElement('canvas');
  canvas.width = GRID_W;
  canvas.height = GRID_H;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const img = ctx.createImageData(GRID_W, GRID_H);
  const px = new Uint32Array(img.data.buffer);
  const scale = (LUT_SIZE - 1) / LUT_MAX_DEPTH;
  return {
    canvas,
    update(g: SimGrid): void {
      const { w, ice } = g;
      for (let y = 0, i = 0; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W; x++, i++) {
          if (ice[i] > ICE_MIN) {
            px[i] = ICE;
            continue;
          }
          const k = Math.min(LUT_SIZE - 1, (w[i] * scale) | 0);
          px[i] = k >= DEEP_INDEX && ((x + y) & 3) === 0 ? STRIPE : LUT[k];
        }
      }
      ctx.putImageData(img, 0, 0);
    },
  };
}
