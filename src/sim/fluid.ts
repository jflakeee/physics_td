import type { SimGrid } from '../core/types.ts';

/**
 * Two-pass virtual-pipe flow (docs/DETAILED_DESIGN_V2.md §4.2). Order independent and
 * mass conserving: every amount a cell sends is subtracted from it exactly as the
 * receiver adds it (both read the same stored value).
 *
 * Head  H_i = h + wall + gate + tmp + ice + w.
 * pass 1: out_ij = max(0, H_i − H_j)·K, scaled by s_i = min(1, w_i / Σ_j out_ij).
 * pass 2: w'_i = w_i − Σ out_ij·s_i + Σ out_ji·s_j.
 * Map edges are walls. Sums are grouped as (E+W)+(S+N) so mirrored cells add the same
 * numbers in the same pairing — left/right symmetry is bit exact.
 */

/** Reusable buffers (no allocation per tick, §18). */
export interface FluidScratch { head: Float64Array; out: Float64Array; s: Float64Array; }

/** Allocate scratch buffers for an `n`-cell grid. */
export function createFluidScratch(n: number): FluidScratch {
  return { head: new Float64Array(n), out: new Float64Array(n * 4), s: new Float64Array(n) };
}

// direction slots: 0 = E, 1 = W, 2 = S, 3 = N

/** Advance water one tick. */
export function fluidStep(g: SimGrid, K: number, sc: FluidScratch): void {
  const { width: W, height: Hh, w, h, wall, gate, tmp, ice } = g;
  const n = W * Hh;
  const { head, out, s } = sc;
  for (let i = 0; i < n; i++) head[i] = h[i] + wall[i] + gate[i] + tmp[i] + ice[i] + w[i];

  // pass 1 — outflows
  for (let y = 0; y < Hh; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      const i = row + x, o = i * 4, wi = w[i];
      if (wi <= 0) { out[o] = 0; out[o + 1] = 0; out[o + 2] = 0; out[o + 3] = 0; s[i] = 0; continue; }
      const Hi = head[i];
      let d: number;
      d = x + 1 < W ? Hi - head[i + 1] : 0; out[o] = d > 0 ? d * K : 0;
      d = x > 0 ? Hi - head[i - 1] : 0; out[o + 1] = d > 0 ? d * K : 0;
      d = y + 1 < Hh ? Hi - head[i + W] : 0; out[o + 2] = d > 0 ? d * K : 0;
      d = y > 0 ? Hi - head[i - W] : 0; out[o + 3] = d > 0 ? d * K : 0;
      const tot = (out[o] + out[o + 1]) + (out[o + 2] + out[o + 3]);
      s[i] = tot > wi ? wi / tot : 1;
    }
  }

  // pass 2 — apply (gather inflows, so each cell is written once)
  for (let y = 0; y < Hh; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      const i = row + x, o = i * 4, si = s[i];
      let kept: number;
      if (si === 0) kept = w[i] > 0 ? w[i] : 0;
      else if (si < 1) kept = 0; // sends everything it has
      else kept = w[i] - ((out[o] + out[o + 1]) + (out[o + 2] + out[o + 3]));
      const inW = x > 0 ? out[(i - 1) * 4] * s[i - 1] : 0;          // west neighbour's E flow
      const inE = x + 1 < W ? out[(i + 1) * 4 + 1] * s[i + 1] : 0;  // east neighbour's W flow
      const inN = y > 0 ? out[(i - W) * 4 + 2] * s[i - W] : 0;      // north neighbour's S flow
      const inS = y + 1 < Hh ? out[(i + W) * 4 + 3] * s[i + W] : 0; // south neighbour's N flow
      const v = kept + ((inE + inW) + (inS + inN));
      w[i] = v > 0 ? v : 0;
    }
  }
}
