/**
 * Minimal persistence until story 006 (save/storage.ts): progress and tutorial step in
 * localStorage. Every access is guarded — private mode or blocked storage falls back to memory.
 */
export interface Progress { cleared: Record<string, boolean>; tutorial: number; }

const KEY = 'ptd.v2.progress';
let memory: Progress | null = null;

export function loadProgress(): Progress {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (raw) { const p = JSON.parse(raw) as Progress; if (p && typeof p === 'object' && p.cleared) return p; }
  } catch { /* fall through */ }
  return memory ?? { cleared: {}, tutorial: 1 };
}

export function saveProgress(p: Progress): void {
  memory = p;
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(p)); } catch { /* memory only */ }
}

/** First run = nothing cleared and the tutorial never finished. */
export const isFirstRun = (p: Progress) => Object.keys(p.cleared).length === 0 && p.tutorial <= 1;
