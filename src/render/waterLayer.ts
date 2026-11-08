import type { SimGrid } from '../core/types.ts';
import { ICE_RGB, WATER, WATER_RGB } from './palette.ts';

/**
 * Water layer: one 64×96 ImageData (1 px per cell) written per frame, drawn once with
 * `drawImage` (§13). Buffers are reused — no per-frame allocation (§18).
 */
export interface WaterLayer { canvas: OffscreenCanvas | HTMLCanvasElement; ctx: CanvasRenderingContext2D; img: ImageData; }

export function createWaterLayer(g: SimGrid, make: (w: number, h: number) => OffscreenCanvas | HTMLCanvasElement): WaterLayer {
  const canvas = make(g.width, g.height);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  return { canvas, ctx, img: ctx.createImageData(g.width, g.height) };
}

/** RGBA for a water depth (exported for tests). Deep water alternates shade (stripe cue). */
export function waterColor(w: number, ice: number, stripe: boolean, out: number[]): void {
  let r = 0, gg = 0, b = 0, a = 0;
  if (w >= WATER.clear) {
    if (w <= WATER.shallow) { [r, gg, b] = WATER_RGB.sky; a = 90 + 110 * (w / WATER.shallow); }
    else if (w <= WATER.deep) { [r, gg, b] = WATER_RGB.blue; a = 200 + 40 * ((w - WATER.shallow) / (WATER.deep - WATER.shallow)); }
    else { [r, gg, b] = WATER_RGB.navy; a = 245; if (stripe) { r += 30; gg += 30; b += 40; } }
  }
  if (ice >= WATER.clear) {
    const k = Math.min(1, ice / 0.5) * 0.8;
    r = r * (1 - k) + ICE_RGB[0] * k; gg = gg * (1 - k) + ICE_RGB[1] * k; b = b * (1 - k) + ICE_RGB[2] * k;
    a = Math.max(a, 150 + 80 * k);
  }
  out[0] = r; out[1] = gg; out[2] = b; out[3] = a;
}

const tmp = [0, 0, 0, 0];
/** Refresh the water image from the grid. */
export function updateWater(L: WaterLayer, g: SimGrid): void {
  const d = L.img.data, W = g.width;
  for (let i = 0; i < g.w.length; i++) {
    const x = i % W, y = (i / W) | 0;
    waterColor(g.w[i], g.ice[i], ((x + y) & 1) === 0, tmp);
    const o = i * 4;
    d[o] = tmp[0]; d[o + 1] = tmp[1]; d[o + 2] = tmp[2]; d[o + 3] = tmp[3];
  }
  L.ctx.putImageData(L.img, 0, 0);
}
