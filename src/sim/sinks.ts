import { FLAG } from '../core/types.ts';
import type { Pump, SimGrid, SimWorld } from '../core/types.ts';
import { waveInflow } from './inflow.ts';
import { waveLen } from './config.ts';

/**
 * Sinks (docs/DETAILED_DESIGN_V2.md §4.4), applied in fixed order:
 * pumps (capped) → outlets → wetland/forest absorption (needs `mods.absorbMul` > 0) → evaporation.
 */

/** Cells of a pump disc (Euclidean radius `r`) around `cell`, row-major fixed order. */
export function pumpDisc(g: SimGrid, cell: number, r: number): Uint32Array {
  const W = g.width, cx = cell % W, cy = (cell / W) | 0;
  const out: number[] = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (dx * dx + dy * dy > r * r) continue;
    const x = cx + dx, y = cy + dy;
    if (x < 0 || y < 0 || x >= W || y >= g.height) continue;
    out.push(y * W + x);
  }
  return Uint32Array.from(out);
}

/** Per-pump tick budget = pumpCapFrac × I_3 / waveLen_3 (GD §3.0). */
export function pumpBudget(world: Pick<SimWorld, 'cfg' | 'map'>): number {
  const { cfg, map } = world;
  return cfg.pumpCapFrac * waveInflow(map.I1, cfg.growth, 3) / waveLen(3, cfg.tps);
}

/** Register a pump site. Returns its id. */
export function addPump(world: SimWorld, cell: number): number {
  const id = world.pumps.length;
  world.pumps.push({ id, cell, on: false });
  world.pumpCells.push(pumpDisc(world.grid, cell, world.cfg.pumpRadius));
  return id;
}

/** Why a pump toggle was refused. */
export type PumpRefusal = 'maxOn' | 'noCash' | 'unknown';

/**
 * Switch a pump. Turning on is refused when `pumpMaxOn` pumps already run (SIM-10)
 * or cash is 0. Returns `null` on success.
 */
export function setPump(world: SimWorld, id: number, on: boolean): PumpRefusal | null {
  const p: Pump | undefined = world.pumps[id];
  if (!p) return 'unknown';
  if (on && !p.on) {
    let running = 0;
    for (const q of world.pumps) if (q.on) running++;
    if (running >= world.cfg.pumpMaxOn) return 'maxOn';
    if (world.cash !== null && world.cash <= 0) return 'noCash';
  }
  p.on = on;
  return null;
}

/** Switch every pump off (HUD 💧 button). */
export function pumpsOff(world: SimWorld): void { for (const p of world.pumps) p.on = false; }

/** Apply all sinks for one tick. */
export function applySinks(world: SimWorld): void {
  const { grid: g, cfg, metrics: m } = world;
  const w = g.w;
  let drained = 0;

  // pumps
  let running = 0;
  for (let k = 0; k < world.pumps.length; k++) {
    if (!world.pumps[k].on) continue;
    running++;
    let budget = world.pumpBudget;
    const cells = world.pumpCells[k];
    for (let j = 0; j < cells.length && budget > 0; j++) {
      const c = cells[j];
      let d = w[c];
      if (d > cfg.pumpRate) d = cfg.pumpRate;
      if (d > budget) d = budget;
      if (d <= 0) continue;
      w[c] -= d; budget -= d; drained += d;
    }
  }
  if (running > 0 && world.cash !== null) {
    world.cashAcc += running * cfg.pumpCashPerTick;
    const whole = Math.floor(world.cashAcc + 1e-9);
    if (whole > 0) { world.cashAcc -= whole; world.cash = Math.max(0, world.cash - whole); }
    if (world.cash <= 0) { pumpsOff(world); world.events.cashEmpty = true; }
  }

  // outlets, absorption, evaporation (single pass, per-cell order fixed)
  const flags = g.flags, evap = cfg.evap, out = cfg.outletRate;
  let evaporated = 0;
  for (let i = 0; i < w.length; i++) {
    let v = w[i];
    if (v <= 0) continue;
    if (flags[i] & FLAG.outlet) { const d = v < out ? v : out; v -= d; drained += d; }
    // absorption (wetland/forest) hooks in here once zone types exist (story 003)
    const e = v * evap; v -= e; evaporated += e;
    w[i] = v;
  }
  m.drained += drained;
  m.evaporated += evaporated;
}
