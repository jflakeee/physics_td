/**
 * Story layer rules (docs/STORY_WORLD_EXPANSION.md 3, 5, 6): world-map unlocks, memory shard
 * conditions, recall cards and the prologue line picker. Pure logic over data/story/*.json;
 * the data files are validated here (data boundary), callers pass plain inputs.
 */
import { arr, fail, num, obj, oneOf, str } from './validate.ts';
import type { Obj } from './validate.ts';

/** One world region (data/story/world.json). `far` regions are silhouettes only at launch. */
export interface RegionDef { id: string; kind: 'home' | 'frontier' | 'far'; icon: string; i18n: string; opensAfter: string | null }

/** Shard condition: every present field must hold for the cleared run (AND). */
export interface ShardWhen {
  region?: string;
  /** The clearing character must be this one. */
  character?: string;
  /** Base hp at clear >= (100 = no damage taken). */
  minHp?: number;
  /** Ecology index percent at clear >=. */
  minEcology?: number;
  /** Defeat retries in the run >=. */
  minRetries?: number;
  /** Fusions discovered in the run >=. */
  minFusions?: number;
  /** Axis points of the run, each >= (coexistence >= 1 = a floodplain / wetland skill was used). */
  minAxis?: Record<string, number>;
}

/** One memory shard. */
export interface ShardDef { id: string; philosophy: string; region: string; i18n: string; when: ShardWhen }

/** A philosophy and its character; `recall` is the i18n prefix of the recall card. */
export interface PhilosophyDef { id: string; character: string; i18n: string; recall: string }

/** data/story/shards.json. */
export interface ShardData { recallNeeds: number; philosophies: PhilosophyDef[]; shards: ShardDef[] }

/** Prologue text data (i18n keys only). */
export interface PrologueData {
  briefing: string[];
  waveLines: { wave: number; key: string }[];
  foreshadow: { id: string; key: string; wave: number; chance: number }[];
}

/** What a cleared run offers to the shard conditions. */
export interface ClearFacts {
  region: string; character: string; hp: number; ecology: number; retries: number; fusions: number; axis: Readonly<Record<string, number>>;
}

/**
 * Validate data/story/world.json.
 * @example const regions = parseWorld(await read('data/story/world.json'));
 */
export function parseWorld(raw: unknown): RegionDef[] {
  const w = 'data/story/world.json';
  return arr(obj(raw, w), 'regions', w).map((r, k) => {
    const o = obj(r, `${w}.regions[${k}]`);
    return { id: str(o, 'id', w), kind: oneOf(o, 'kind', w, ['home', 'frontier', 'far']), icon: str(o, 'icon', w), i18n: str(o, 'i18n', w), opensAfter: o.opensAfter === undefined ? null : str(o, 'opensAfter', w) };
  });
}

/**
 * Validate data/story/shards.json (conditions are data; unknown condition keys are rejected).
 * @example const sd = parseShards(await read('data/story/shards.json'));
 */
export function parseShards(raw: unknown): ShardData {
  const w = 'data/story/shards.json';
  const o = obj(raw, w);
  const philosophies = arr(o, 'philosophies', w).map((p, k) => {
    const po = obj(p, `${w}.philosophies[${k}]`);
    return { id: str(po, 'id', w), character: str(po, 'character', w), i18n: str(po, 'i18n', w), recall: str(po, 'recall', w) };
  });
  const keys = ['region', 'character', 'minHp', 'minEcology', 'minRetries', 'minFusions', 'minAxis'];
  const shards = arr(o, 'shards', w).map((s, k): ShardDef => {
    const so = obj(s, `${w}.shards[${k}]`);
    const wo = obj(so.when, `${w}.shards[${k}].when`);
    for (const key of Object.keys(wo)) if (!keys.includes(key)) fail(`${w}.shards[${k}].when`, `unknown condition "${key}"`);
    const when: ShardWhen = {};
    if (wo.region !== undefined) when.region = str(wo, 'region', w);
    if (wo.character !== undefined) when.character = str(wo, 'character', w);
    for (const key of ['minHp', 'minEcology', 'minRetries', 'minFusions'] as const) if (wo[key] !== undefined) when[key] = num(wo, key, w, 0);
    if (wo.minAxis !== undefined) {
      const ao = obj(wo.minAxis, `${w}.shards[${k}].when.minAxis`);
      when.minAxis = Object.fromEntries(Object.keys(ao).map((a) => [a, num(ao, a, w, 0)]));
    }
    const philosophy = str(so, 'philosophy', w);
    if (!philosophies.some((p) => p.id === philosophy)) fail(w, `shard ${k}: unknown philosophy "${philosophy}"`);
    return { id: str(so, 'id', w), philosophy, region: str(so, 'region', w), i18n: str(so, 'i18n', w), when };
  });
  return { recallNeeds: num(o, 'recallNeeds', w, 1), philosophies, shards };
}

/**
 * Validate data/story/prologue.json.
 * @example const pro = parsePrologue(await read('data/story/prologue.json'));
 */
export function parsePrologue(raw: unknown): PrologueData {
  const w = 'data/story/prologue.json';
  const o = obj(raw, w);
  const lines = (k: string): Obj[] => arr(o, k, w).map((r, i) => obj(r, `${w}.${k}[${i}]`));
  return {
    briefing: arr(o, 'briefing', w).map(String),
    waveLines: lines('waveLines').map((l) => ({ wave: num(l, 'wave', w, 1), key: str(l, 'key', w) })),
    foreshadow: lines('foreshadow').map((l) => ({ id: str(l, 'id', w), key: str(l, 'key', w), wave: num(l, 'wave', w, 1), chance: num(l, 'chance', w, 0) })),
  };
}

/**
 * Shards whose conditions the cleared run meets (including ones already owned; the caller diffs).
 * @example const got = evaluateShards(sd, facts).filter((s) => !owned.includes(s.id));
 */
export function evaluateShards(sd: ShardData, f: ClearFacts): ShardDef[] {
  return sd.shards.filter(({ when: c }) =>
    (c.region === undefined || c.region === f.region) && (c.character === undefined || c.character === f.character) &&
    f.hp >= (c.minHp ?? 0) && f.ecology >= (c.minEcology ?? 0) && f.retries >= (c.minRetries ?? 0) && f.fusions >= (c.minFusions ?? 0) &&
    Object.entries(c.minAxis ?? {}).every(([a, v]) => (f.axis[a] ?? 0) >= v));
}

/**
 * Recall cards (philosophy ids) unlocked by the owned shards: `recallNeeds` shards of one character.
 * @example const recalls = unlockedRecalls(sd, store.data.progress.shards);
 */
export function unlockedRecalls(sd: ShardData, owned: readonly string[]): string[] {
  return sd.philosophies.filter((p) => sd.shards.filter((s) => s.philosophy === p.id && owned.includes(s.id)).length >= sd.recallNeeds).map((p) => p.id);
}

/**
 * Regions open for play: home regions always, a frontier once every map of `opensAfter` is cleared.
 * @example const open = openRegions(regions, maps, p.maps);
 */
export function openRegions(regions: readonly RegionDef[], maps: readonly { id: string; region: string }[], cleared: Readonly<Record<string, unknown>>): Set<string> {
  const open = new Set<string>();
  const isOpen = (r: RegionDef): boolean => r.kind === 'home' || (r.opensAfter !== null && maps.filter((m) => m.region === r.opensAfter).every((m) => m.id in cleared));
  for (const r of regions) if (r.kind !== 'far' && isOpen(r)) open.add(r.id);
  return open;
}

/** FNV-style unit hash in [0,1) of a string; keeps story lines deterministic and off the sim RNG. */
const unit = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 2 ** 32;
};

/**
 * Story lines for the start of a wave: the wave line plus at most one foreshadow line whose
 * seeded roll passes. Deterministic per (seed, wave); never touches the run RNG.
 * @example for (const key of waveStoryKeys(pro, run.seed, run.wave)) toast(t(key));
 */
export function waveStoryKeys(p: PrologueData, seed: number, wave: number): string[] {
  const keys = p.waveLines.filter((l) => l.wave === wave).map((l) => l.key);
  const fore = p.foreshadow.find((f) => f.wave === wave && unit(`${f.id}:${seed}:${wave}`) < f.chance);
  if (fore) keys.push(fore.key);
  return keys;
}
