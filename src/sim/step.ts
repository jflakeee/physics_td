import type { MapSimParams, SimConfig, SimWorld, StepResult, WaveParams } from '../core/types.ts';
import type { Terrain } from './terrain.ts';
import { makeConfig, waveLen } from './config.ts';
import { createFluidScratch, fluidStep } from './fluid.ts';
import { fractureIce, meltIce } from './ice.ts';
import { applyInflow } from './inflow.ts';
import { applySinks, pumpBudget } from './sinks.ts';
import { updateStructures } from './structures.ts';
import { applyDamage, createMetrics } from './metrics.ts';

/**
 * Sim tick pipeline (docs/DETAILED_DESIGN_V2.md §4.1), fixed order:
 *   inflow → fluid → ice melt/fracture → sinks → structures → base damage → end check.
 * Steps 1 (events), 7 (ecology) and 9 (score / xp / gauges) belong to the rules layer
 * (stories 003–005) and run around this function, not inside it.
 */

/** Options for `createWorld`. */
export interface WorldOptions {
  cfg?: Partial<SimConfig>;
  hp?: number;
  /** Starting cash; `null` disables cash (pumps run free). */
  cash?: number | null;
}

/** Create a world from built terrain and map params. */
export function createWorld(t: Terrain, map: MapSimParams, opt: WorldOptions = {}): SimWorld {
  const cfg = makeConfig(opt.cfg);
  const m = { I1: map.I1, rain: map.rain ?? cfg.rain, pulseEvery: map.pulseEvery ?? cfg.pulseEvery };
  const n = t.grid.width * t.grid.height;
  const world: SimWorld = {
    cfg, map: m, grid: t.grid, baseCore: t.baseCore, inlets: t.inlets,
    pumps: [], gates: [], pumpCells: [], pumpBudget: 0,
    mods: { wallDurabilityMul: 1, absorbMul: 0 },
    wave: 0, waveTick: 0, waveLen: 0, waveParams: { mul: 1, rain: m.rain },
    hp: opt.hp ?? 100, hpAcc: 0, cash: opt.cash === undefined ? 150 : opt.cash, cashAcc: 0,
    tick: 0, metrics: createMetrics(), events: { collapsed: [], iceBroken: [], cashEmpty: false },
    scratch: createFluidScratch(n),
  };
  world.pumpBudget = pumpBudget(world);
  return world;
}

/** Begin wave `wave` (1-based). `params` comes from the rules layer (peak, contract). */
export function startWave(world: SimWorld, wave: number, params: Partial<WaveParams> = {}): void {
  world.wave = wave;
  world.waveTick = 0;
  world.waveLen = waveLen(wave, world.cfg.tps);
  world.waveParams = { mul: params.mul ?? 1, rain: params.rain ?? world.map.rain };
  world.metrics.waveInflow = 0;
  world.metrics.waveDamage = 0;
  world.metrics.waveMaxFlood = 0;
}

/** Advance one tick of an active wave. HP 0 wins over wave end on the same tick (FSM-02). */
export function stepSim(world: SimWorld): StepResult {
  const g = world.grid, cfg = world.cfg;
  world.events.collapsed.length = 0;
  world.events.iceBroken.length = 0;
  world.events.cashEmpty = false;
  const added = applyInflow(world);
  world.metrics.inflow += added;
  world.metrics.waveInflow += added;
  fluidStep(g, cfg.K, world.scratch);
  meltIce(g, cfg.iceMelt, cfg.iceEpsilon, cfg.glacierMelt);
  fractureIce(g, cfg.iceFractureHead, world.events.iceBroken);
  applySinks(world);
  updateStructures(world);
  applyDamage(world);
  world.tick++;
  world.waveTick++;
  if (world.hp <= 0) return 'defeat';
  if (world.waveTick >= world.waveLen) return 'waveEnd';
  return 'running';
}

/** Step without waves: fluid + ice only (no inflow, sinks, damage). For tests and previews. */
export function stepFluidOnly(world: SimWorld): void {
  fluidStep(world.grid, world.cfg.K, world.scratch);
  meltIce(world.grid, world.cfg.iceMelt, world.cfg.iceEpsilon, world.cfg.glacierMelt);
  fractureIce(world.grid, world.cfg.iceFractureHead);
}

/** Result of running waves to completion. */
export interface RunOutcome { result: 'clear' | 'defeat'; wave: number; hp: number; }

/**
 * Run waves `from..to` back to back (no prepare phase in between).
 * `onWaveStart` / `onTick` let callers (bots, tests, prototypes) act at wave boundaries or
 * before every tick (the command-queue slot of §12).
 */
export function runWaves(
  world: SimWorld, from = 1, to = 5,
  onWaveStart?: (w: SimWorld) => void,
  params?: (wave: number) => Partial<WaveParams>,
  onTick?: (w: SimWorld) => void,
): RunOutcome {
  for (let wv = from; wv <= to; wv++) {
    startWave(world, wv, params?.(wv));
    onWaveStart?.(world);
    for (;;) {
      onTick?.(world);
      const r = stepSim(world);
      if (r === 'defeat') return { result: 'defeat', wave: wv, hp: 0 };
      if (r === 'waveEnd') break;
    }
  }
  return { result: 'clear', wave: to, hp: world.hp };
}
