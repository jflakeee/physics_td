/**
 * Persistence (DETAILED_DESIGN_V2 §16, GD §20). Key `physics-td:v2`, schema `v: 1` + migrate().
 * Every access is guarded: a throwing or missing storage switches to memory mode, a corrupt
 * value resets to defaults; each is reported once through `onIssue` (UI shows one toast).
 * The backend is injected so tests can use a fake.
 */

export const SAVE_KEY = 'physics-td:v2';
const LEGACY_KEY = 'ptd.v2.progress';

export interface MapRecord { stars: number; best: number; clearedBy: string[]; /** Last ending reached here (world map record). */ ending?: string; }

export interface SaveV1 {
  v: 1;
  progress: {
    maps: Record<string, MapRecord>;
    endings: string[];
    fusions: string[];
    lastChar: string | null;
    /** Memory fragments collected (story 007). */
    memories: string[];
    /** Story scenes already shown (prologue, region unlocks). */
    seen: string[];
    /** Tutorial step (7 = done). */
    tutorial: number;
  };
  settings: { haptics: boolean; sound: boolean; reducedMotion: 'auto' | 'on' | 'off' };
  run?: { dataVersion: string; mapId: string; charId: string; seed: number; wave: number; snapshot: string };
}

export interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void; }
export type SaveIssue = 'memory' | 'corrupt' | 'discarded';

export function defaultSave(): SaveV1 {
  return { v: 1, progress: { maps: {}, endings: [], fusions: [], lastChar: null, tutorial: 1, memories: [], seen: [] }, settings: { haptics: true, sound: true, reducedMotion: 'auto' } };
}

/** Bring any stored value up to the current schema. Returns null when it cannot be used. */
export function migrate(raw: unknown): SaveV1 | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<SaveV1> & { v?: number };
  if (r.v !== 1 || !r.progress || typeof r.progress !== 'object') return null;
  const d = defaultSave();
  return {
    v: 1,
    progress: { ...d.progress, ...r.progress, maps: { ...(r.progress.maps ?? {}) } },
    settings: { ...d.settings, ...(r.settings ?? {}) },
    ...(r.run && typeof r.run.snapshot === 'string' ? { run: r.run } : {}),
  };
}

export interface Store {
  load(): SaveV1;
  save(s: SaveV1): void;
  /** True when writes only reach memory. */
  memory(): boolean;
}

export function createStore(backend: StorageLike | null | undefined, onIssue: (i: SaveIssue) => void = () => {}): Store {
  let mem: SaveV1 | null = null;
  let memoryMode = !backend;
  const reported = new Set<SaveIssue>();
  const issue = (i: SaveIssue) => { if (!reported.has(i)) { reported.add(i); onIssue(i); } };
  if (memoryMode) issue('memory');
  return {
    load() {
      if (mem) return structuredClone(mem);
      let s: SaveV1 | null = null;
      if (!memoryMode) {
        try {
          const raw = backend!.getItem(SAVE_KEY);
          if (raw !== null) {
            let parsed: unknown = null;
            try { parsed = JSON.parse(raw); } catch { parsed = null; }
            s = migrate(parsed);
            if (!s) issue('corrupt');
          } else {
            const legacy = backend!.getItem(LEGACY_KEY); // story 004/005 dev store
            if (legacy) {
              try {
                const l = JSON.parse(legacy) as { cleared?: Record<string, boolean>; tutorial?: number; codex?: string[] };
                s = defaultSave();
                for (const id of Object.keys(l.cleared ?? {})) s.progress.maps[id] = { stars: 1, best: 0, clearedBy: [] };
                s.progress.tutorial = l.tutorial ?? 1; s.progress.fusions = l.codex ?? [];
              } catch { s = null; }
            }
          }
        } catch { memoryMode = true; issue('memory'); }
      }
      mem = s ?? defaultSave();
      return structuredClone(mem);
    },
    save(s) {
      mem = structuredClone(s);
      if (memoryMode) return;
      try { backend!.setItem(SAVE_KEY, JSON.stringify(s)); } catch { memoryMode = true; issue('memory'); }
    },
    memory: () => memoryMode,
  };
}

/** First run: nothing cleared and the tutorial not started (map select "여기부터"). */
export const isFirstRun = (s: SaveV1) => Object.keys(s.progress.maps).length === 0 && s.progress.tutorial <= 1;

/** Resume check: a stored run is usable only with the same data version (GD §20). */
export function takeResumable(store: Store, dataVersion: string): { run: SaveV1['run'] | null; discarded: boolean } {
  const s = store.load();
  if (!s.run) return { run: null, discarded: false };
  if (s.run.dataVersion === dataVersion) return { run: s.run, discarded: false };
  delete s.run;
  store.save(s);
  return { run: null, discarded: true };
}

declare function structuredClone<V>(value: V): V;
