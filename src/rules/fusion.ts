/**
 * Fusions (docs/DETAILED_DESIGN_V2.md 7.4, docs/GAME_DESIGN_V2.md 6.5). Owning every skill in
 * `requires` fires the fusion once; its modifier ops land in `draft.modifiers` and the first
 * discovery is recorded in the run's codex (Story 006 persists and shows it).
 */
import type { DraftRun } from './leveling.ts';
import { arr, fail, num, obj, oneOf, str } from './validate.ts';

/** A fusion definition from data/fusions.json. */
export interface FusionDef {
  id: string;
  /** i18n key prefix (`<i18n>.name`). */
  i18n: string;
  requires: string[];
  ops: { key: string; value: number; mode: 'set' | 'add' | 'mul' }[];
  /** Card shows only a hint instead of the name. */
  hidden: boolean;
}

/**
 * Validate data/fusions.json.
 * @example const fusions = parseFusions(await read('data/fusions.json'));
 */
export function parseFusions(raw: unknown): FusionDef[] {
  if (!Array.isArray(raw)) fail('fusions.json', 'expected an array');
  return raw.map((r, k) => {
    const w = `fusions[${k}]`;
    const o = obj(r, w);
    return {
      id: str(o, 'id', w), i18n: str(o, 'i18n', w), hidden: o.hidden === true,
      requires: arr(o, 'requires', w).map((s) => String(s)),
      ops: arr(o, 'ops', w).map((p, j) => {
        const po = obj(p, `${w}.ops[${j}]`);
        oneOf(po, 'op', w, ['modifier']);
        return { key: str(po, 'key', w), value: num(po, 'value', w), mode: oneOf(po, 'mode', w, ['set', 'add', 'mul']) };
      }),
    };
  });
}

/**
 * The unfired fusion that owning `extra` (besides the owned skills) would complete, or null.
 * @example const f = completingFusion(run, 'restore-wetland');
 */
export function completingFusion(run: DraftRun, extra: string): FusionDef | null {
  const { owned } = run.rt;
  return run.draftData.fusions.find((f) => !run.draft.fusions.includes(f.id) && f.requires.includes(extra) && f.requires.every((s) => s === extra || owned.has(s))) ?? null;
}

/**
 * Fire every unfired fusion whose requirements are owned: apply its ops once, add it to
 * `draft.fusions`, and record first discoveries in `run.codex`.
 * @returns the fusions fired now.
 * @example for (const f of checkFusions(run)) toast(f.id);
 */
export function checkFusions(run: DraftRun): FusionDef[] {
  const fired: FusionDef[] = [];
  for (const f of run.draftData.fusions) {
    if (run.draft.fusions.includes(f.id) || !f.requires.every((s) => run.rt.owned.has(s))) continue;
    const mods = run.draft.modifiers;
    for (const op of f.ops) {
      const prior = mods[op.key] ?? (op.mode === 'mul' ? 1 : 0);
      mods[op.key] = op.mode === 'set' ? op.value : op.mode === 'add' ? prior + op.value : prior * op.value;
    }
    run.draft.fusions.push(f.id);
    if (!run.codex.includes(f.id)) run.codex.push(f.id);
    fired.push(f);
  }
  return fired;
}
