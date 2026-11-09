import type { SimGrid } from '../../src/core/types.ts';
import { createHydro, type CardId, type CharId, type HydroWorld, type PowerupId } from './core.ts';
import { createRng } from '../../src/core/rng.ts';
import { GEMS, POWERUPS, STAGES } from './tuning.ts';

/**
 * Progress kept between runs (survivors-like main menu): gems, power-ups, characters, bonus skills,
 * stage records, lifetime stats, and the run in progress for 계속하기. No DOM: storage is injected.
 */

export interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
export const META_KEY = 'physics-td:v4-meta';
export const RUN_KEY = 'physics-td:v4-run';

export interface StageRecord { cleared: boolean; bestHearts: number; plays: number }
export interface Stats { runs: number; wins: number; losses: number; power: number; builds: number; floodHearts: number; blackoutHearts: number; seconds: number; bestLevel: number }
export interface Meta {
  v: 1;
  gems: number;
  chars: CharId[];
  skills: CardId[];
  powerups: Record<PowerupId, number>;
  stages: Record<string, StageRecord>;
  stats: Stats;
}

export function defaultMeta(): Meta {
  return {
    v: 1, gems: 0, chars: ['miller'], skills: [],
    powerups: { turbine: 0, purse: 0, builder: 0, heart: 0 },
    stages: Object.fromEntries(STAGES.map(s => [s.id, { cleared: false, bestHearts: 0, plays: 0 }])),
    stats: { runs: 0, wins: 0, losses: 0, power: 0, builds: 0, floodHearts: 0, blackoutHearts: 0, seconds: 0, bestLevel: 0 },
  };
}

/** Load (missing or broken data falls back to defaults, field by field). */
export function loadMeta(store: StorageLike | null): Meta {
  const d = defaultMeta();
  try {
    const raw = store?.getItem(META_KEY);
    if (!raw) return d;
    const m = JSON.parse(raw) as Partial<Meta>;
    return {
      v: 1, gems: Number(m.gems) || 0,
      chars: Array.isArray(m.chars) && m.chars.length ? m.chars : d.chars,
      skills: Array.isArray(m.skills) ? m.skills : [],
      powerups: { ...d.powerups, ...(m.powerups ?? {}) },
      stages: { ...d.stages, ...(m.stages ?? {}) },
      stats: { ...d.stats, ...(m.stats ?? {}) },
    };
  } catch { return d; }
}
export function saveMeta(store: StorageLike | null, m: Meta): void { try { store?.setItem(META_KEY, JSON.stringify(m)); } catch { /* storage full or blocked */ } }

/** Stages you can pick: the first, and each one after a cleared stage. */
export function openStages(m: Meta): number { let n = 1; while (n < STAGES.length && m.stages[STAGES[n - 1].id]?.cleared) n++; return n; }

/** What a run brings in from the menu. */
export const runOptions = (m: Meta, stage: number, char: CharId) => ({ stage, char, powerups: { ...m.powerups }, unlocked: [...m.skills] });

export interface RunResult { gems: number; newSkill: CardId | null; newChar: CharId | null; firstClear: boolean }
/** Book a finished run (won or lost): gems, records, stats, first-clear unlocks. */
export function finishRun(m: Meta, w: HydroWorld): RunResult {
  const won = w.phase === 'won', st = STAGES[w.stage], rec = m.stages[st.id] ?? { cleared: false, bestHearts: 0, plays: 0 };
  const gems = Math.floor(w.record.power / GEMS.perPower) + (won ? Math.max(0, w.hearts) * GEMS.perStar : 0);
  const firstClear = won && !rec.cleared;
  rec.plays++;
  if (won) { rec.cleared = true; rec.bestHearts = Math.max(rec.bestHearts, w.hearts); }
  m.stages[st.id] = rec;
  let newSkill: CardId | null = null, newChar: CharId | null = null;
  if (firstClear) {
    if (st.bonusSkill && !m.skills.includes(st.bonusSkill)) { m.skills.push(st.bonusSkill); newSkill = st.bonusSkill; }
    if (st.unlockChar && !m.chars.includes(st.unlockChar)) { m.chars.push(st.unlockChar); newChar = st.unlockChar; }
  }
  m.gems += gems;
  const s = m.stats;
  s.runs++; if (won) s.wins++; else s.losses++;
  s.power += Math.round(w.record.power); s.builds += w.record.builds;
  s.floodHearts += w.record.floodHearts; s.blackoutHearts += w.record.blackoutHearts;
  s.seconds += Math.round(w.tick / 30); s.bestLevel = Math.max(s.bestLevel, w.level);
  return { gems, newSkill, newChar, firstClear };
}

/** Buy the next rank of a power-up. */
export function buyPowerup(m: Meta, id: PowerupId): boolean {
  const def = POWERUPS.find(p => p.id === id); if (!def) return false;
  const rank = m.powerups[id] ?? 0, price = def.cost[rank];
  if (price === undefined || m.gems < price) return false;
  m.gems -= price; m.powerups[id] = rank + 1;
  return true;
}

// ---- the run in progress (계속하기) ----------------------------------------------------
const b64 = (a: ArrayBufferView) => { const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s: string) => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
const GRID_KEYS = ['w', 'ice', 'h', 'wall', 'tmp', 'tmpTtl', 'dur'] as const;

/** Serialise a run that can be continued later (exact: typed arrays are stored bit for bit). */
export function snapshotRun(w: HydroWorld): string {
  const grid: Record<string, string> = {};
  for (const k of GRID_KEYS) grid[k] = b64((w.g as unknown as Record<string, ArrayBufferView>)[k]);
  return JSON.stringify({
    v: 1, origin: w.origin, grid, rng: w.rng.state(), sandbags: [...w.sandbags],
    s: {
      built: w.built, plants: w.plants, tick: w.tick, phase: w.phase, xp: w.xp, level: w.level, coins: w.coins, hearts: w.hearts,
      secPower: w.secPower, lastSecPower: w.lastSecPower, blackout: w.blackout, inflow: w.inflow, drained: w.drained,
      skill: w.skill, spiritTimer: w.spiritTimer, cards: w.cards, floodCooldown: w.floodCooldown, floodFrom: w.floodFrom, record: w.record,
    },
  });
}
/** Rebuild a saved run, or null if the data is missing or broken. */
export function restoreRun(raw: string | null): HydroWorld | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    if (d.v !== 1) return null;
    const w = createHydro(d.origin.seed, d.origin.opt);
    for (const k of GRID_KEYS) {
      const dst = (w.g as unknown as Record<string, ArrayBufferView & { set(a: ArrayLike<number>): void; constructor: new (b: ArrayBuffer) => ArrayLike<number> }>)[k];
      const src = new (dst.constructor as new (b: ArrayBuffer) => ArrayLike<number>)(unb64(d.grid[k]));
      if (src.length !== (dst as unknown as ArrayLike<number>).length) return null;
      dst.set(src);
    }
    Object.assign(w, d.s);
    w.rng = createRng(d.rng);
    w.sandbags = new Map(d.sandbags);
    return w;
  } catch { return null; }
}
export function saveRun(store: StorageLike | null, w: HydroWorld): void { try { store?.setItem(RUN_KEY, snapshotRun(w)); } catch { /* full or blocked */ } }
export function loadRun(store: StorageLike | null): HydroWorld | null { try { return restoreRun(store?.getItem(RUN_KEY) ?? null); } catch { return null; } }
export function clearRun(store: StorageLike | null): void { try { store?.removeItem(RUN_KEY); } catch { /* blocked */ } }
export type { SimGrid };
