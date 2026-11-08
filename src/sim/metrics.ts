import type { SimMetrics, SimWorld } from '../core/types.ts';

/**
 * Base damage (docs/DETAILED_DESIGN_V2.md §4.6) and metric bookkeeping (§4.7).
 *   flood = Σ baseCore w;  dmg/tick = max(0, flood − threshold) × damagePerTick
 *   HP is an integer: the fraction accumulates in `hpAcc`, whole units are subtracted.
 */

/** Fresh zeroed metrics. */
export function createMetrics(): SimMetrics {
  return { drained: 0, blocked: 0, evaporated: 0, inflow: 0, waveInflow: 0, inflowClipped: 0, waveDamage: 0, waveMaxFlood: 0, collapses: 0 };
}

/** Water sum on the base core. */
export function baseFlood(world: SimWorld): number {
  let f = 0;
  const w = world.grid.w, core = world.baseCore;
  for (let k = 0; k < core.length; k++) f += w[core[k]];
  return f;
}

/** Apply this tick's base damage. Returns the integer HP lost. */
export function applyDamage(world: SimWorld): number {
  const f = baseFlood(world);
  if (f > world.metrics.waveMaxFlood) world.metrics.waveMaxFlood = f;
  const over = f - world.cfg.floodThreshold;
  if (over <= 0) return 0;
  world.hpAcc += over * world.cfg.damagePerTick;
  const whole = Math.floor(world.hpAcc + 1e-9); // tolerate float dust (SIM-08: 30 × 1/30 = 1)
  if (whole <= 0) return 0;
  world.hpAcc = Math.max(0, world.hpAcc - whole);
  const lost = Math.min(whole, world.hp);
  world.hp -= lost;
  world.metrics.waveDamage += lost;
  return lost;
}
