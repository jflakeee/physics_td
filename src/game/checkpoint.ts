import type { SimGrid, SimWorld } from '../core/types.ts';
import type { RulesState } from '../rules/skills.ts';
import type { Play } from './play.ts';
import type { ScoreState } from '../rules/leveling.ts';
import type { RngState } from '../core/rng.ts';
import { createRng } from '../core/rng.ts';

/**
 * Wave checkpoints (DETAILED_DESIGN_V2 §10 defeat → retry). Taken in prepare right before a
 * wave starts; restoring brings back the exact prepare state, so the same commands replay to
 * the same result. Tutorial progress lives outside the run and is not rolled back.
 */

// ES2022 lib has no structuredClone typing (it is a host API available in browsers and Node 17+)
declare function structuredClone<V>(value: V): V;

type GridArrays = Omit<SimGrid, 'width' | 'height'>;
const GRID_KEYS = ['w', 'ice', 'h', 'wall', 'gate', 'tmp', 'tmpTtl', 'dur', 'flags', 'ztype', 'health', 'floodTicks'] as const;

export interface Checkpoint {
  grid: Partial<GridArrays>;
  world: Pick<SimWorld, 'wave' | 'waveTick' | 'waveLen' | 'waveParams' | 'hp' | 'hpAcc' | 'cash' | 'cashAcc' | 'tick' | 'ecoBase' | 'metrics' | 'mods'>;
  pumps: boolean[];
  /** Optional routed discharge destinations; absent in older checkpoints. */
  pumpDischarges?: (number | null)[];
  gates: boolean[];
  lakes: { warned: boolean; broken: boolean }[];
  zoneTypes: string[];
  rules: Partial<RulesState> | null;
  level: number;
  score: ScoreState | null;
  story: Play['story'];
  /** Source-tracer mix (block fractions). */
  traceF: Float64Array | null;
  draft: { rng: RngState; rerollsLeft: number; sinceFusion: number; skips: number; drafted: number } | null;
}

function snapRules(rs: RulesState): Partial<RulesState> {
  return structuredClone({
    owned: rs.owned, commonCd: rs.commonCd, gauge: rs.gauge, axes: rs.axes, zones: rs.zones,
    commonCdMul: rs.commonCdMul, maintenanceStacks: rs.maintenanceStacks, fusions: rs.fusions,
    builtLines: rs.builtLines, baseMods: rs.baseMods, timedMods: rs.timedMods, waveRestore: rs.waveRestore,
    fieldDepth: rs.fieldDepth, waveTicks: rs.waveTicks, lastBlocked: rs.lastBlocked, lastEcoBest: rs.lastEcoBest,
  });
}

/** Capture the current state. */
export function takeCheckpoint(p: Play): Checkpoint {
  const w = p.world, g = w.grid, grid: Partial<GridArrays> = {};
  for (const k of GRID_KEYS) (grid as Record<string, unknown>)[k] = g[k].slice();
  return {
    grid,
    world: structuredClone({ wave: w.wave, waveTick: w.waveTick, waveLen: w.waveLen, waveParams: w.waveParams, hp: w.hp, hpAcc: w.hpAcc,
      cash: w.cash, cashAcc: w.cashAcc, tick: w.tick, ecoBase: w.ecoBase, metrics: w.metrics, mods: w.mods }),
    pumps: w.pumps.map(x => x.on),
    pumpDischarges: w.pumps.map(x => x.dischargeCell ?? null),
    gates: w.gates.map(x => x.open),
    lakes: p.map.lakes.map(L => ({ warned: L.warned, broken: L.broken })),
    zoneTypes: p.map.zones.zones.map(z => z.type),
    rules: p.rules ? snapRules(p.rules) : null,
    level: p.level,
    score: p.score ? structuredClone(p.score) : null,
    story: structuredClone(p.story),
    traceF: p.world.trace ? p.world.trace.f.slice() : null,
    draft: p.draft ? { rng: p.draft.rng.state(), rerollsLeft: p.draft.rerollsLeft, sinceFusion: p.draft.sinceFusion, skips: p.draft.skips, drafted: p.draft.drafted } : null,
  };
}

/** Restore a checkpoint into the same play session (arrays are copied, not shared). */
export function restoreCheckpoint(p: Play, c: Checkpoint): void {
  const w = p.world, g = w.grid;
  for (const k of GRID_KEYS) (g[k] as { set(a: ArrayLike<number>): void }).set((c.grid as Record<string, ArrayLike<number>>)[k]);
  Object.assign(w, structuredClone(c.world));
  c.pumps.forEach((on, i) => { w.pumps[i].on = on; });
  w.pumps.forEach((pump, i) => {
    const cell = c.pumpDischarges?.[i];
    // Old checkpoints have no route field; default to legacy outside-map discharge.
    if (cell === undefined || cell === null) delete pump.dischargeCell;
    else if (Number.isInteger(cell) && cell >= 0 && cell < g.w.length) pump.dischargeCell = cell;
    else delete pump.dischargeCell;
  });
  c.gates.forEach((open, i) => { w.gates[i].open = open; });
  c.lakes.forEach((s, i) => Object.assign(p.map.lakes[i], s));
  c.zoneTypes.forEach((t, i) => { p.map.zones.zones[i].type = t as typeof p.map.zones.zones[number]['type']; });
  if (p.rules && c.rules) { Object.assign(p.rules, structuredClone(c.rules)); p.rules.refreshMods(); }
  p.level = c.level;
  if (p.score && c.score) Object.assign(p.score, structuredClone(c.score));
  if (c.story) p.story = structuredClone(c.story);
  if (p.world.trace && c.traceF) { p.world.trace.f.set(c.traceF); p.world.trace.damage.fill(0); }
  if (p.draft && c.draft) { const { rng, ...rest } = c.draft; Object.assign(p.draft, rest, { rng: createRng(rng), offer: null }); }
  p.queue.length = 0; p.acc = 0; p.damaging = false;
}

/** FNV-1a over water, ice, hp, cash, level and axes (DETAILED §12 stateHash). */
export function stateHash(p: Play): number {
  let h = 0x811c9dc5;
  const mix = (b: number) => { h = Math.imul(h ^ (b & 0xff), 16777619); };
  for (const arr of [p.world.grid.w, p.world.grid.ice]) {
    const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    for (let i = 0; i < bytes.length; i++) mix(bytes[i]);
  }
  const nums = [p.world.hp, p.world.cash ?? -1, p.level, ...(p.rules ? Object.values(p.rules.axes) : [])];
  const f = new Float64Array(nums), b = new Uint8Array(f.buffer);
  for (let i = 0; i < b.length; i++) mix(b[i]);
  return h >>> 0;
}
