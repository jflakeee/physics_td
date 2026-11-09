import type { SimGrid } from '../core/types.ts';
import type { ZoneMap } from '../sim/zones.ts';
import { NO_ZONE, ZONE_COLOR } from './palette.ts';

/**
 * Terrain layer: rebuilt only when zone types or heights change (§13).
 * Cell colour = zone-type palette × height shade; contour lines every 0.5; zone borders.
 */

const PX = 4; // offscreen pixels per cell

/** Render terrain into an offscreen canvas (PX px per cell). */
export function renderTerrain(g: SimGrid, zones: ZoneMap, make: (w: number, h: number) => OffscreenCanvas | HTMLCanvasElement): OffscreenCanvas | HTMLCanvasElement {
  const W = g.width, H = g.height;
  const c = make(W * PX, H * PX);
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  const img = ctx.createImageData(W * PX, H * PX), d = img.data;
  let hmin = Infinity, hmax = -Infinity;
  for (let i = 0; i < g.h.length; i++) { hmin = Math.min(hmin, g.h[i]); hmax = Math.max(hmax, g.h[i]); }
  const span = hmax - hmin || 1;
  // contours on a 3×3-smoothed height so the ±0.02 hash noise does not draw staircases
  const sm = new Float32Array(g.h.length);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let a = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < W && ny < H) { a += g.h[ny * W + nx]; n++; }
    }
    sm[y * W + x] = a / n;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, z = zones.zoneOf[i];
    const rgb = z ? ZONE_COLOR[zones.zones[z - 1].type] : NO_ZONE;
    const shade = 0.75 + 0.45 * (g.h[i] - hmin) / span;
    const band = Math.floor(sm[i] / 0.5);
    const right = x + 1 < W ? Math.floor(sm[i + 1] / 0.5) : band, down = y + 1 < H ? Math.floor(sm[i + W] / 0.5) : band;
    const zr = x + 1 < W ? zones.zoneOf[i + 1] : z, zd = y + 1 < H ? zones.zoneOf[i + W] : z;
    for (let py = 0; py < PX; py++) for (let px = 0; px < PX; px++) {
      let k = shade;
      if ((px === PX - 1 && right !== band) || (py === PX - 1 && down !== band)) k *= 0.8; // contour
      if ((px === PX - 1 && zr !== z) || (py === PX - 1 && zd !== z)) k = 1.6;            // zone border
      const o = ((y * PX + py) * W * PX + x * PX + px) * 4;
      d[o] = Math.min(255, rgb[0] * k); d[o + 1] = Math.min(255, rgb[1] * k); d[o + 2] = Math.min(255, rgb[2] * k); d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
