import { ZT } from '../core/types.ts';
import type { SimGrid, SimWorld } from '../core/types.ts';
import { DRAIN_RGB, ICE_RGB, SOAK_RGB, WATER, WATER_RGB } from './palette.ts';

/**
 * Water layer: one 64×96 ImageData (1 px per cell) written per frame, drawn once with
 * `drawImage` (§13). Buffers are reused — no per-frame allocation (§18).
 */
export interface WaterLayer { canvas: OffscreenCanvas | HTMLCanvasElement; ctx: CanvasRenderingContext2D; img: ImageData; sink: Uint8Array; }

export function createWaterLayer(g: SimGrid, make: (w: number, h: number) => OffscreenCanvas | HTMLCanvasElement): WaterLayer {
  const canvas = make(g.width, g.height);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  return { canvas, ctx, img: ctx.createImageData(g.width, g.height), sink: new Uint8Array(g.width * g.height) };
}

/** Sink kinds per cell (B3). */
export const SINK = { none: 0, pump: 1, soak: 2 } as const;

/**
 * Mark where water is being removed this frame: discs of running pumps, wetland / forest cells
 * while absorption is on, and the inner side of levees after the green-levee fusion.
 */
export function markSinks(out: Uint8Array, world: SimWorld): void {
  const g = world.grid;
  out.fill(0);
  if (world.mods.absorbMul > 0) for (let i = 0; i < out.length; i++) { const z = g.ztype[i]; if (z === ZT.wetland || z === ZT.forest) out[i] = SINK.soak; }
  const dist = world.distToBase;
  if (world.mods.greenLevee > 0 && dist) {
    const W = g.width;
    for (let i = 0; i < out.length; i++) {
      if (g.wall[i] <= 0) continue;
      for (let k = 0; k < 4; k++) { // no per-frame allocation (§18)
        const j = k === 0 ? i + 1 : k === 1 ? i - 1 : k === 2 ? i + W : i - W;
        if (j >= 0 && j < out.length && g.wall[j] <= 0 && dist[j] < dist[i]) out[j] = SINK.soak;
      }
    }
  }
  world.pumps.forEach((p, k) => { if (p.on) for (const c of world.pumpCells[k]) out[c] = SINK.pump; });
}

/**
 * RGBA for a water depth (exported for tests). Deep water alternates shade (stripe cue).
 * `sink` tints water that is being pumped (teal) or soaked up (green) — B3.
 */
export function waterColor(w: number, ice: number, stripe: boolean, out: number[], sink = 0): void {
  let r = 0, gg = 0, b = 0, a = 0;
  if (w >= WATER.clear) {
    if (w <= WATER.shallow) { [r, gg, b] = WATER_RGB.sky; a = 90 + 110 * (w / WATER.shallow); }
    else if (w <= WATER.deep) { [r, gg, b] = WATER_RGB.blue; a = 200 + 40 * ((w - WATER.shallow) / (WATER.deep - WATER.shallow)); }
    else { [r, gg, b] = WATER_RGB.navy; a = 245; if (stripe) { r += 30; gg += 30; b += 40; } }
  }
  if (sink && w >= WATER.clear) {
    const c = sink === SINK.pump ? DRAIN_RGB : SOAK_RGB, k = sink === SINK.pump && stripe ? 0.75 : 0.55;
    r = r * (1 - k) + c[0] * k; gg = gg * (1 - k) + c[1] * k; b = b * (1 - k) + c[2] * k;
    a = Math.max(a, 170);
  }
  if (ice >= WATER.clear) {
    const k = Math.min(1, ice / 0.5) * 0.8;
    r = r * (1 - k) + ICE_RGB[0] * k; gg = gg * (1 - k) + ICE_RGB[1] * k; b = b * (1 - k) + ICE_RGB[2] * k;
    a = Math.max(a, 150 + 80 * k);
  }
  out[0] = r; out[1] = gg; out[2] = b; out[3] = a;
}

const tmp = [0, 0, 0, 0];
/** Refresh the water image from the grid; `phase` shifts the pump stripe (0 when motion is reduced). */
export function updateWater(L: WaterLayer, world: SimWorld, phase = 0): void {
  const g = world.grid, d = L.img.data, W = g.width;
  markSinks(L.sink, world);
  for (let i = 0; i < g.w.length; i++) {
    const x = i % W, y = (i / W) | 0;
    waterColor(g.w[i], g.ice[i], ((x + y + phase) & 1) === 0, tmp, L.sink[i]);
    const o = i * 4;
    d[o] = tmp[0]; d[o + 1] = tmp[1]; d[o + 2] = tmp[2]; d[o + 3] = tmp[3];
  }
  L.ctx.putImageData(L.img, 0, 0);
}
