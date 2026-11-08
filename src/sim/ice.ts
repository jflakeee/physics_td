import type { SimGrid } from '../core/types.ts';

/**
 * Ice (GD §3.2, §5.1 긴급 결빙; brief: 빙하호 붕괴).
 * Ice adds to the hydraulic head, so it blocks flow; it melts back into water in place.
 * Melting is mass-conserving: water + ice is invariant under `meltIce` and `freezeCells`.
 */

/** Melt `rate` ice per tick from every ice cell into water. Returns the amount melted. */
export function meltIce(g: SimGrid, rate: number, epsilon: number): number {
  const { ice, w } = g;
  let melted = 0;
  for (let i = 0; i < ice.length; i++) {
    const v = ice[i];
    if (v <= 0) continue;
    const m = v - rate <= epsilon ? v : rate;
    ice[i] = v - m;
    w[i] += m;
    melted += m;
  }
  return melted;
}

/** Turn `fraction` of the water in `cells` into ice (긴급 결빙: 0.5). Returns the amount frozen. */
export function freezeCells(g: SimGrid, cells: ArrayLike<number>, fraction: number): number {
  let frozen = 0;
  for (let k = 0; k < cells.length; k++) {
    const i = cells[k], f = g.w[i] * fraction;
    g.w[i] -= f; g.ice[i] += f; frozen += f;
  }
  return frozen;
}

/** Add ice of `thickness` to `cells` (map-authored ice dams, glacier tongues). */
export function placeIce(g: SimGrid, cells: ArrayLike<number>, thickness: number): void {
  for (let k = 0; k < cells.length; k++) g.ice[cells[k]] += thickness;
}

/**
 * Ice-dam outburst (빙하호 붕괴). Melting alone lowers the crest 0.0008/tick and lets the
 * lake out only as fast as the crest drops (~17 s to empty half a 0.8-deep lake). A real
 * glacial-lake outburst fails catastrophically once overtopped, so an ice cell shatters
 * (all its ice → water in place, mass conserved) when
 *   (a) it is overtopped: h_c + ice_c < max_j S_j, and
 *   (b) the water surface across it differs by ≥ `minHead`: max_j S_j − min_j S_j ≥ minHead,
 * with S_j = h_j + wall_j + gate_j + tmp_j + ice_j + w_j over the 4 neighbours (only wet
 * neighbours, w_j > WET, count for the max).
 * (b) keeps freeze films on still or gently sloping water intact. `minHead ≤ 0` disables it.
 * Returns the number of cells that shattered.
 */
const WET = 1e-3;

export function fractureIce(g: SimGrid, minHead: number, out?: number[]): number {
  if (!(minHead > 0)) return 0;
  const { width: W, height: Hc, ice, w, h, wall, gate, tmp } = g;
  let n = 0;
  for (let i = 0; i < ice.length; i++) {
    const v = ice[i];
    if (v <= 0) continue;
    const x = i % W, y = (i / W) | 0;
    let hi = -Infinity, lo = Infinity;
    for (let d = 0; d < 4; d++) {
      const nx = d === 0 ? x + 1 : d === 1 ? x - 1 : x;
      const ny = d === 2 ? y + 1 : d === 3 ? y - 1 : y;
      if (nx < 0 || ny < 0 || nx >= W || ny >= Hc) continue;
      const j = ny * W + nx;
      const s = h[j] + wall[j] + gate[j] + tmp[j] + ice[j] + w[j];
      if (w[j] > WET && s > hi) hi = s; // only standing water pushes (a dry uphill neighbour does not)
      if (s < lo) lo = s;
    }
    if (h[i] + v < hi && hi - lo >= minHead) {
      ice[i] = 0; w[i] += v; n++;
      out?.push(i);
    }
  }
  return n;
}
