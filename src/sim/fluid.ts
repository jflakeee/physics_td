import type { SimGrid } from '../core/types.ts';
import { CELLS, FLOW_K, GRID_H, GRID_W } from './constants.ts';

/**
 * One flow tick: 2-pass virtual pipe. Pass 1 computes every cell's outflow from
 * the head field (ground + levee + temp wall + gate + ice + water); pass 2 gathers.
 * Nothing is written to `w` during pass 1, so the result does not depend on the
 * iteration order, and what leaves one cell arrives in another (mass conserving).
 * Out-of-map is a wall. The last outflows stay readable in `g.flowOut` / `g.flowScale`
 * (direction order +x, -x, +y, -y) for flux measurement.
 * @example fluidStep(grid); // advance water by one tick
 */
export function fluidStep(g: SimGrid): void {
  const { w, h, wall, tmp, gate, ice, head, flowOut: out, flowScale: scale } = g;
  for (let i = 0; i < CELLS; i++) head[i] = h[i] + wall[i] + tmp[i] + gate[i] + ice[i] + w[i];

  let i = 0;
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++, i++) {
      const hi = head[i];
      const o = i * 4;
      let d = x < GRID_W - 1 ? hi - head[i + 1] : 0;
      const a = d > 0 ? d * FLOW_K : 0;
      d = x > 0 ? hi - head[i - 1] : 0;
      const b = d > 0 ? d * FLOW_K : 0;
      d = y < GRID_H - 1 ? hi - head[i + GRID_W] : 0;
      const c = d > 0 ? d * FLOW_K : 0;
      d = y > 0 ? hi - head[i - GRID_W] : 0;
      const e = d > 0 ? d * FLOW_K : 0;
      out[o] = a;
      out[o + 1] = b;
      out[o + 2] = c;
      out[o + 3] = e;
      const total = a + b + c + e;
      scale[i] = total > w[i] ? w[i] / total : 1;
    }
  }

  i = 0;
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++, i++) {
      const o = i * 4;
      let v = w[i] - (out[o] + out[o + 1] + out[o + 2] + out[o + 3]) * scale[i];
      if (x > 0) v += out[(i - 1) * 4] * scale[i - 1];
      if (x < GRID_W - 1) v += out[(i + 1) * 4 + 1] * scale[i + 1];
      if (y > 0) v += out[(i - GRID_W) * 4 + 2] * scale[i - GRID_W];
      if (y < GRID_H - 1) v += out[(i + GRID_W) * 4 + 3] * scale[i + GRID_W];
      // v can only be below 0 by double rounding (~1e-17); never store negative water.
      w[i] = v > 0 ? v : 0;
    }
  }
}
