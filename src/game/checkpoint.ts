/**
 * Wave-start checkpoint and state hash (docs/GAME_DESIGN_V2.md 20 "웨이브 재도전",
 * docs/DETAILED_DESIGN_V2.md 12 `stateHash`). A checkpoint is a deep snapshot of every
 * mutable part of the run (incl. XP, pending level-ups, pity, reroll and the cards RNG state); restoring writes it back into the same objects, so views that
 * hold `run.state` keep working. Same checkpoint + same inputs -> same state hash.
 */
import type { SimGrid, SimState } from '../core/types.ts';
import { sfc32FromState } from '../core/rng.ts';
import type { RngStreams } from '../core/rng.ts';
import type { DraftState } from '../rules/leveling.ts';
import type { EffectEnv } from '../rules/effects.ts';
import type { SkillRuntime } from '../rules/skills.ts';

/** Grid arrays that are per-tick scratch (recomputed before use), not state. */
const SCRATCH: ReadonlySet<string> = new Set(['head', 'flowOut', 'flowScale']);

/** The run fields a checkpoint covers (the machine's `Run` satisfies this). */
export interface CheckpointTarget {
  state: SimState;
  rt: SkillRuntime;
  rng: RngStreams;
  cash: number;
  level: number;
  wave: number;
  draft: DraftState | null;
}

/** Opaque deep snapshot of a run. */
export interface Checkpoint {
  grid: Record<string, ArrayLike<number>>;
  sim: Pick<SimState, 'pumps' | 'mods' | 'hp' | 'hpAcc' | 'tick' | 'waveTick' | 'inflow' | 'metrics' | 'iceWarned' | 'ecologyCells'>;
  gatesOpen: boolean[];
  rt: Pick<SkillRuntime, 'owned' | 'cooldown' | 'gauge' | 'axis' | 'lastBlocked' | 'maxEcology'> & { env: Omit<EffectEnv, 'leveeLines'> };
  rng: { cards: number[]; events: number[]; weather: number[] };
  cash: number;
  level: number;
  wave: number;
  draft: DraftState | null;
}

/**
 * Snapshot every mutable part of the run.
 * @example run.checkpoint = saveCheckpoint(run);
 */
export function saveCheckpoint(r: CheckpointTarget): Checkpoint {
  const { state: s, rt } = r;
  const grid: Record<string, ArrayLike<number>> = {};
  for (const [k, v] of Object.entries(s.grid)) if (!SCRATCH.has(k)) grid[k] = (v as Float64Array).slice();
  const { timers, opened, repaired, iceBuilt, nextWeights } = rt.env;
  return {
    grid,
    sim: structuredClone({
      pumps: s.pumps, mods: s.mods, hp: s.hp, hpAcc: s.hpAcc, tick: s.tick, waveTick: s.waveTick, inflow: s.inflow,
      metrics: s.metrics, iceWarned: s.iceWarned, ecologyCells: s.ecologyCells,
    }),
    gatesOpen: s.gates.map((g) => g.open),
    rt: structuredClone({
      owned: rt.owned, cooldown: rt.cooldown, gauge: rt.gauge, axis: rt.axis, lastBlocked: rt.lastBlocked, maxEcology: rt.maxEcology,
      env: { timers, opened, repaired, iceBuilt, nextWeights },
    }),
    rng: { cards: r.rng.cards.getState(), events: r.rng.events.getState(), weather: r.rng.weather.getState() },
    cash: r.cash,
    level: r.level,
    wave: r.wave,
    draft: r.draft === null ? null : structuredClone(r.draft),
  };
}

/**
 * Write a checkpoint back into the run in place (the checkpoint stays reusable).
 * @example restoreCheckpoint(run, run.checkpoint);
 */
export function restoreCheckpoint(r: CheckpointTarget, cp: Checkpoint): void {
  const { state: s, rt } = r;
  const g = s.grid as unknown as Record<string, Float64Array>;
  for (const [k, v] of Object.entries(cp.grid)) g[k].set(v);
  Object.assign(s, structuredClone(cp.sim));
  cp.gatesOpen.forEach((open, k) => (s.gates[k].open = open));
  s.fx.leveeCollapsed.length = 0;
  s.fx.iceCollapsed.length = 0;
  s.fx.iceWarning = false;
  const saved = structuredClone(cp.rt);
  rt.owned = saved.owned;
  rt.cooldown = saved.cooldown;
  rt.gauge = saved.gauge;
  rt.axis = saved.axis;
  rt.lastBlocked = saved.lastBlocked;
  rt.maxEcology = saved.maxEcology;
  Object.assign(rt.env, saved.env);
  r.rng.cards = sfc32FromState(cp.rng.cards);
  r.rng.events = sfc32FromState(cp.rng.events);
  r.rng.weather = sfc32FromState(cp.rng.weather);
  r.cash = cp.cash;
  r.level = cp.level;
  r.wave = cp.wave;
  r.draft = cp.draft === null ? null : structuredClone(cp.draft);
}

/** FNV-1a over raw bytes, continuing from `h`. */
function fnv(h: number, bytes: Uint8Array): number {
  for (let k = 0; k < bytes.length; k++) h = Math.imul(h ^ bytes[k], 16777619);
  return h >>> 0;
}

const bytesOf = (a: ArrayBufferView): Uint8Array => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);

/**
 * FNV-1a hash of water, ice, levees, hp, cash, level and the disposition axes (spec 12,
 * extended with ice and levees so structure state is covered too).
 * @example stateHash(a) === stateHash(b)
 */
export function stateHash(r: CheckpointTarget): number {
  const g: SimGrid = r.state.grid;
  let h = 2166136261;
  h = fnv(h, bytesOf(g.w));
  h = fnv(h, bytesOf(g.ice));
  h = fnv(h, bytesOf(g.wall));
  const axes = Object.keys(r.rt.axis).sort().map((k) => r.rt.axis[k]);
  h = fnv(h, bytesOf(Float64Array.from([r.state.hp, r.state.hpAcc, r.cash, r.level, ...axes])));
  return h;
}
