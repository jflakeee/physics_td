import type { SimWorld } from '../core/types.ts';

/**
 * Wave inflow pulses (docs/DETAILED_DESIGN_V2.md §4.5).
 *   I_w = I1 × GROWTH[w] × mul;  N = floor(waveLen / P) pulses at waveTick = k·P, k < N
 *   inlet k per pulse = I_w × (1 − r) / N × weight_k / Σweight, split evenly over its cells
 *   rain per pulse    = I_w × r / N, spread evenly over every cell
 * Exactly N pulses fire, so a full wave adds I_w (SIM-07). Inlet cells are capped at
 * `inletCellCap`; clipped water is recorded in `metrics.inflowClipped`.
 */

/** Total inflow of wave `wave` (1-based) before per-wave multipliers. */
export function waveInflow(I1: number, growth: readonly number[], wave: number): number {
  return I1 * growth[Math.min(wave, growth.length) - 1];
}

/** Apply this tick's pulse, if any. Returns the water added. */
export function applyInflow(world: SimWorld): number {
  const { cfg, map, grid: g, waveParams: wp } = world;
  const P = map.pulseEvery;
  if (world.waveTick % P !== 0) return 0;
  const N = Math.floor(world.waveLen / P);
  if (world.waveTick / P >= N) return 0;
  const Iw = waveInflow(map.I1, cfg.growth, world.wave) * wp.mul;
  const r = wp.rain;
  let added = 0;
  const wi = world.wave - 1;
  let wsum = 0;
  for (const inl of world.inlets) wsum += inl.weights[wi] ?? 1;
  if (world.inlets.length > 0 && wsum > 0) {
    const perPulse = Iw * (1 - r) / N;
    for (const inl of world.inlets) {
      const per = perPulse * (inl.weights[wi] ?? 1) / wsum / inl.cells.length;
      for (let k = 0; k < inl.cells.length; k++) {
        const c = inl.cells[k];
        const room = Math.max(0, cfg.inletCellCap - g.w[c]);
        const a = per < room ? per : room;
        g.w[c] += a; added += a;
        world.metrics.inflowClipped += per - a;
      }
    }
  } else {
    // no inlets: everything falls as rain so the wave total still holds
    const rainAll = Iw / N / g.w.length;
    for (let i = 0; i < g.w.length; i++) g.w[i] += rainAll;
    added += Iw / N;
    return added;
  }
  if (r > 0) {
    const rain = Iw * r / N / g.w.length;
    for (let i = 0; i < g.w.length; i++) g.w[i] += rain;
    added += Iw * r / N;
  }
  return added;
}
