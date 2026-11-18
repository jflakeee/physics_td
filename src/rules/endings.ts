/**
 * Endings (docs/DETAILED_DESIGN_V2.md 9, docs/GAME_DESIGN_V2.md 8.2): the main disposition is
 * the played character's axis; the secondary is the highest other axis, and counts only when it
 * is >= `subThreshold` x the main axis. Launch content: 4 endings from data/rules/endings.json.
 * The secret ending (confluence) is out of scope for Story 006.
 */
import { arr, fail, num, obj, str } from './validate.ts';

/** One ending: the character it belongs to and the secondary axis it needs (null = solo). */
export interface EndingDef { id: string; character: string; sub: string | null; i18n: string }

/** Data from data/rules/endings.json. */
export interface EndingRules { subThreshold: number; endings: EndingDef[] }

/**
 * Validate data/rules/endings.json; every character must have a solo ending.
 * @example const er = parseEndings(await read('data/rules/endings.json'), [...data.characters.keys()]);
 */
export function parseEndings(raw: unknown, characterIds: readonly string[]): EndingRules {
  const w = 'endings';
  const o = obj(raw, w);
  const endings = arr(o, 'endings', w).map((e, k) => {
    const eo = obj(e, `${w}[${k}]`);
    return { id: str(eo, 'id', w), character: str(eo, 'character', w), sub: eo.sub === null ? null : str(eo, 'sub', w), i18n: str(eo, 'i18n', w) };
  });
  for (const c of characterIds) if (!endings.some((e) => e.character === c && e.sub === null)) fail(w, `no solo ending for ${c}`);
  return { subThreshold: num(o, 'subThreshold', w, 0), endings };
}

/**
 * Resolve the ending of a run from its axis scores. Ties between other axes go to the
 * alphabetically first axis; a secondary axis of 0 or one without an ending entry gives the solo ending.
 * @example const e = resolveEnding(er, 'dike-keeper', 'safety', run.rt.axis);
 */
export function resolveEnding(rules: EndingRules, characterId: string, mainAxis: string, axes: Readonly<Record<string, number>>): EndingDef {
  const main = axes[mainAxis] ?? 0;
  let sub: string | null = null;
  let best = 0;
  for (const k of Object.keys(axes).sort()) {
    if (k !== mainAxis && axes[k] > best) {
      best = axes[k];
      sub = k;
    }
  }
  const mine = rules.endings.filter((e) => e.character === characterId);
  const withSub = sub !== null && best >= rules.subThreshold * main ? mine.find((e) => e.sub === sub) : undefined;
  const ending = withSub ?? mine.find((e) => e.sub === null);
  if (!ending) throw new Error(`endings: no solo ending for ${characterId}`);
  return ending;
}
