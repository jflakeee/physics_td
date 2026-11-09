import { ZT } from '../core/types.ts';
import type { SimMetrics, SimWorld } from '../core/types.ts';

/**
 * Base damage (docs/DETAILED_DESIGN_V2.md §4.6) and metric bookkeeping (§4.7).
 *   flood = Σ baseCore w;  dmg/tick = max(0, flood − threshold) × damagePerTick
 *   HP is an integer: the fraction accumulates in `hpAcc`, whole units are subtracted.
 */

/** Fresh zeroed metrics. */
export function createMetrics(): SimMetrics {
  return { drained: 0, blocked: 0, evaporated: 0, inflow: 0, waveInflow: 0, inflowClipped: 0, waveDamage: 0, waveMaxFlood: 0, collapses: 0, ecology: 0, ecologyBest: 0 };
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

/**
 * Forest health and ecology index (GD §16, DETAILED §4.1 step 7).
 * Forest cell with depth ≥ forestFloodDepth for forestFloodTicks → health −forestDamagePerTick
 * per tick (wetland unaffected). ecology = Σ health(forest + wetland) / ecoBase × 100, capped.
 */
export function updateEcology(world: SimWorld): void {
  const g = world.grid, cfg = world.cfg, { w, ztype, health, floodTicks } = g;
  let sum = 0;
  for (let i = 0; i < w.length; i++) {
    const t = ztype[i];
    if (t === ZT.forest) {
      if (w[i] >= cfg.forestFloodDepth) {
        if (floodTicks[i] < 0xffff) floodTicks[i]++;
        if (floodTicks[i] >= cfg.forestFloodTicks && health[i] > 0) health[i] = Math.max(0, health[i] - cfg.forestDamagePerTick);
      } else floodTicks[i] = 0;
      sum += health[i];
    } else if (t === ZT.wetland) sum += health[i];
  }
  const m = world.metrics;
  m.ecology = world.ecoBase > 0 ? Math.min(cfg.ecologyMax, sum / world.ecoBase * 100) : 0;
  if (m.ecology > m.ecologyBest) m.ecologyBest = m.ecology;
}

/** Initialise health (1 on forest/wetland cells) and the ecology baseline. */
export function initEcology(world: SimWorld): void {
  const g = world.grid;
  let n = 0;
  for (let i = 0; i < g.ztype.length; i++) {
    const t = g.ztype[i];
    if (t === ZT.forest || t === ZT.wetland) { g.health[i] = 1; n++; } else g.health[i] = 0;
  }
  world.ecoBase = n;
  world.metrics.ecology = n > 0 ? 100 : 0;
  world.metrics.ecologyBest = world.metrics.ecology;
}
