/**
 * Save data (docs/DETAILED_DESIGN_V2.md 16, docs/GAME_DESIGN_V2.md 20). One localStorage key
 * `physics-td:v2` holds progress (map stars, codex endings / fusions) and the in-progress run
 * snapshot. Every storage access is in try/catch: a throwing storage or unreadable JSON switches
 * the store to memory mode (nothing is written any more) and reports it once.
 * The run snapshot is the prep-phase checkpoint (game/checkpoint.ts) serialized to JSON with
 * TypedArrays as base64; it is only restored when its `dataVersion` matches the loaded data.
 */
import type { Run } from '../game/machine.ts';
import { restoreCheckpoint, saveCheckpoint } from '../game/checkpoint.ts';
import type { Checkpoint } from '../game/checkpoint.ts';

/** The localStorage key. */
export const SAVE_KEY = 'physics-td:v2';

/** Per-map progress. */
export interface MapProgress { stars: number; best: number; clearedBy: string[] }

/**
 * Long-lived progress: best results, the codex (endings, fusions) and the story layer (Story 007):
 * `tiles` = ids of cleared maps in clear order (one world-map home tile each), `shards` = memory
 * shard ids, `recalls` = unlocked recall cards (philosophy ids).
 */
export interface Progress { maps: Record<string, MapProgress>; endings: string[]; fusions: string[]; tiles: string[]; shards: string[]; recalls: string[] }

/** The in-progress run (spec 16 `run`). */
export interface RunSave { dataVersion: string; mapId: string; charId: string; seed: number; snapshot: string }

/** Save schema version 2 (v1 + world tiles / memory shards; v1 saves are migrated on load). */
export interface SaveV2 { v: 2; progress: Progress; run?: RunSave }

/** The part of `Storage` the store uses (injectable for tests). */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** A loaded save plus its write channel. */
export interface Store {
  /** Current save data; mutate it, then `flush()`. */
  readonly data: SaveV2;
  /** True after a storage failure: the game keeps running, nothing is persisted. */
  readonly memoryOnly: boolean;
  /** Write `data` to storage (no-op in memory mode; a failure switches to memory mode). */
  flush(): void;
}

/**
 * Fresh save data.
 * @example const s = defaultSave();
 */
export function defaultSave(): SaveV2 {
  return { v: 2, progress: { maps: {}, endings: [], fusions: [], tiles: [], shards: [], recalls: [] } };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/**
 * Bring any parsed save to the current schema (spec 16): no `v` / damaged -> defaults; v1 and v2
 * fields are checked one by one (bad fields fall back, a bad run is dropped). A v1 save gains
 * `tiles` from its cleared maps (best score > 0) and empty shards / recalls. Later versions add
 * one step per version here.
 * @example const save = migrate(JSON.parse(text));
 */
export function migrate(raw: unknown): SaveV2 {
  const out = defaultSave();
  if (!isObj(raw) || (raw.v !== 1 && raw.v !== 2)) return out;
  const p = isObj(raw.progress) ? raw.progress : {};
  if (isObj(p.maps)) {
    for (const [id, m] of Object.entries(p.maps)) {
      if (isObj(m)) out.progress.maps[id] = { stars: Math.min(3, Math.floor(count(m.stars))), best: count(m.best), clearedBy: strings(m.clearedBy) };
    }
  }
  out.progress.endings = strings(p.endings);
  out.progress.fusions = strings(p.fusions);
  out.progress.shards = strings(p.shards);
  out.progress.recalls = strings(p.recalls);
  out.progress.tiles = raw.v === 1 ? Object.entries(out.progress.maps).filter(([, m]) => m.best > 0).map(([id]) => id) : strings(p.tiles);
  const r = raw.run;
  if (isObj(r) && typeof r.dataVersion === 'string' && typeof r.mapId === 'string' && typeof r.charId === 'string' &&
      typeof r.seed === 'number' && typeof r.snapshot === 'string') {
    out.run = { dataVersion: r.dataVersion, mapId: r.mapId, charId: r.charId, seed: r.seed, snapshot: r.snapshot };
  }
  return out;
}

/**
 * Open the save. `storage` is a getter because touching `window.localStorage` itself can throw.
 * @param onMemoryMode Called at most once, when storage first fails (show the toast).
 * @example const store = openStore(() => localStorage, () => toast(t('save.memoryMode')));
 */
export function openStore(storage: () => StorageLike, onMemoryMode: () => void): Store {
  let memoryOnly = false;
  const fall = (): void => {
    if (memoryOnly) return;
    memoryOnly = true;
    onMemoryMode();
  };
  let data = defaultSave();
  try {
    const text = storage().getItem(SAVE_KEY);
    if (text !== null) data = migrate(JSON.parse(text));
  } catch {
    fall();
  }
  return {
    get data() {
      return data;
    },
    get memoryOnly() {
      return memoryOnly;
    },
    flush() {
      if (memoryOnly) return;
      try {
        storage().setItem(SAVE_KEY, JSON.stringify(data));
      } catch {
        fall();
      }
    },
  };
}

/**
 * Data version: FNV-1a hash of every loaded data file (path-sorted JSON).
 * @example const dv = hashData({ 'data/index.json': index, ... });
 */
export function hashData(files: Readonly<Record<string, unknown>>): string {
  let h = 2166136261;
  for (const k of Object.keys(files).sort()) {
    const s = `${k}=${JSON.stringify(files[k])};`;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const TYPED: Record<string, new (b: ArrayBuffer) => ArrayBufferView> = {
  Float64Array, Float32Array, Int32Array, Uint32Array, Int16Array, Uint16Array, Int8Array, Uint8Array,
};
const CHUNK = 0x8000;

/** JSON replacer: Map / Set / TypedArray (base64) / non-finite and -0 numbers survive the round trip. */
function replacer(_k: string, v: unknown): unknown {
  if (v instanceof Map) return { $map: [...v] };
  if (v instanceof Set) return { $set: [...v] };
  if (ArrayBuffer.isView(v)) {
    const b = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    let s = '';
    for (let i = 0; i < b.length; i += CHUNK) s += String.fromCharCode(...b.subarray(i, i + CHUNK));
    return { $ta: v.constructor.name, b64: btoa(s) };
  }
  if (typeof v === 'number' && (!Number.isFinite(v) || Object.is(v, -0))) return { $num: Object.is(v, -0) ? '-0' : String(v) };
  return v;
}

function reviver(_k: string, v: unknown): unknown {
  if (!isObj(v)) return v;
  if (Array.isArray(v.$map)) return new Map(v.$map as [unknown, unknown][]);
  if (Array.isArray(v.$set)) return new Set(v.$set);
  if (typeof v.$num === 'string') return Number(v.$num);
  if (typeof v.$ta === 'string' && typeof v.b64 === 'string') {
    const Ctor = TYPED[v.$ta];
    if (!Ctor) throw new Error(`save: unknown array type ${v.$ta}`);
    const s = atob(v.b64);
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return new Ctor(bytes.buffer);
  }
  return v;
}

/** Serialized snapshot body. */
interface Snapshot { cp: Checkpoint; retries: number; codex: string[] }

/**
 * Snapshot a run for resuming (state as of the current / last prep phase). In prep a fresh
 * checkpoint is taken (it re-seats the RNG streams, exactly like a wave start); in a wave or
 * after a defeat the wave-start checkpoint is used. Null after the result or before any checkpoint.
 * @example const s = snapshotRun(run, dataVersion); if (s) { store.data.run = s; store.flush(); }
 */
export function snapshotRun(run: Run, dataVersion: string): RunSave | null {
  if (run.phase === 'result') return null;
  const cp = run.phase === 'prep' ? saveCheckpoint(run) : run.checkpoint;
  if (cp === null) return null;
  const body: Snapshot = { cp, retries: run.retries, codex: run.codex };
  return { dataVersion, mapId: run.map.id, charId: run.rt.character.id, seed: run.seed, snapshot: JSON.stringify(body, replacer) };
}

/**
 * Restore a snapshot into a fresh run created with the same map, character and seed (still in prep).
 * Throws on a damaged snapshot (the caller discards it); the RNG streams are re-seated from the
 * saved words the same way a wave retry does (game/checkpoint.ts), so the run continues identically.
 * @example const run = createRun(map, data, s.charId, s.seed, draftData); restoreRun(run, s);
 */
export function restoreRun(run: Run, save: RunSave): void {
  const body = JSON.parse(save.snapshot, reviver) as Snapshot;
  if (!isObj(body) || !isObj(body.cp) || !isObj(body.cp.grid)) throw new Error('save: bad snapshot');
  const grid = run.state.grid as unknown as Record<string, ArrayBufferView & { length: number }>;
  for (const [k, v] of Object.entries(body.cp.grid)) {
    if (!(k in grid) || !ArrayBuffer.isView(v) || v.constructor !== grid[k].constructor || (v as ArrayLike<number>).length !== grid[k].length) {
      throw new Error(`save: grid "${k}" does not match`);
    }
  }
  if (body.cp.gatesOpen.length !== run.state.gates.length) throw new Error('save: gates do not match');
  restoreCheckpoint(run, body.cp);
  run.retries = count(body.retries);
  run.codex = strings(body.codex);
}

/**
 * Add ids to a codex list (keeps first-discovery order, no duplicates).
 * @example addToCodex(store.data.progress.fusions, run.codex);
 */
export function addToCodex(list: string[], ids: readonly string[]): void {
  for (const id of ids) if (!list.includes(id)) list.push(id);
}

/**
 * Record a clear: best score / stars, the clearing character, ending and fusions to the codex.
 * @returns true when the ending is new to the codex.
 * @example const isNew = recordClear(store.data.progress, run.map.id, charId, score, ending.id, run.codex);
 */
export function recordClear(p: Progress, mapId: string, charId: string, score: { total: number; stars: number }, endingId: string, fusions: readonly string[]): boolean {
  const m = (p.maps[mapId] ??= { stars: 0, best: 0, clearedBy: [] });
  m.stars = Math.max(m.stars, score.stars);
  m.best = Math.max(m.best, score.total);
  addToCodex(m.clearedBy, [charId]);
  addToCodex(p.fusions, fusions);
  const isNew = !p.endings.includes(endingId);
  addToCodex(p.endings, [endingId]);
  addToCodex(p.tiles, [mapId]);
  return isNew;
}
