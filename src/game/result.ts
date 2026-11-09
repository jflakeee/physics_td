import type { Play } from './play.ts';
import type { CharacterDef, EconomyDef, FusionDef, SkillDef } from '../rules/types.ts';
import { resultScore, stars } from '../rules/scoring.ts';
import type { Affinity, BuildType, Content, ScoreItem } from '../rules/scoring.ts';
import { resolveEnding } from '../rules/endings.ts';
import type { EndingDef, EndingsData } from '../rules/endings.ts';
import type { SaveV1 } from '../save/storage.ts';

/**
 * End of a run → result score, stars, ending, next goal, and the progress update (codex).
 * Pure: takes the save, returns the new one.
 */

export interface RunResult {
  cleared: boolean;
  items: ScoreItem[];
  total: number;
  build: BuildType;
  stars: number;
  ending: EndingDef;
  goal: { key: string; params?: Record<string, number> };
}

export interface ResultData { skills: readonly SkillDef[]; chars: readonly CharacterDef[]; fusions: readonly FusionDef[]; eco: EconomyDef; endings: EndingsData; }

export function affinityOf(char: CharacterDef, style: string | undefined, chars: readonly CharacterDef[]): Affinity {
  if (!style) return 'neutral';
  if (char.homeStyles.includes(style)) return 'home';
  return chars.some(c => c.id !== char.id && c.homeStyles.includes(style)) ? 'challenge' : 'neutral';
}

export function contentOf(char: CharacterDef, d: ResultData): Content {
  const own = d.skills.filter(s => s.owner === char.id);
  return {
    ownSkillCount: own.length, startRankSum: char.start.length, maxRank: Math.max(...own.map(s => s.ranks.length)),
    characters: d.chars.length, crossSourcesAllowed: 2, fusions: d.fusions.length,
  };
}

export function computeResult(p: Play, save: SaveV1, d: ResultData): RunResult {
  const rs = p.rules!, char = rs.char, cleared = p.phase === 'result';
  const own = rs.owned.filter(o => !o.borrowed && rs.defs.get(o.id)!.owner === char.id);
  const cross = rs.owned.filter(o => o.borrowed);
  const rec = save.progress.maps[p.map.data.id];
  const r = resultScore({
    playScore: p.score?.scoreF ?? 0, cleared, affinity: affinityOf(char, p.map.data.style, d.chars), hp: p.world.hp,
    firstCombo: !(rec?.clearedBy ?? []).includes(char.id), retries: p.retries, lateLevels: p.score?.lateLevels ?? 0,
    ownRanks: own.map(o => o.rank), crossOwners: cross.map(o => rs.defs.get(o.id)!.owner), fusionsFired: rs.fusions.length, skips: p.draft?.skips ?? 0,
  }, contentOf(char, d), d.eco);
  const st = stars(cleared, p.world.hp, r.total, p.map.data.star3Score ?? Infinity, d.eco);
  const ending = resolveEnding(char.id, char.axis, rs.axes, d.endings);
  const best = Math.max(st, rec?.stars ?? 0);
  const otherDone = d.chars.every(c => c.id === char.id || (rec?.clearedBy ?? []).includes(c.id));
  const goal: RunResult['goal'] = !cleared ? { key: 'goal.star2', params: { hp: d.eco.result.star2Hp } }
    : best < 2 ? { key: 'goal.star2', params: { hp: d.eco.result.star2Hp } }
    : best < 3 ? { key: 'goal.star3', params: { score: p.map.data.star3Score ?? 0 } }
    : !otherDone ? { key: 'goal.otherChar' } : { key: 'goal.allDone' };
  return { cleared, ...r, stars: st, ending, goal };
}

/** Progress after a finished run: stars/best/clearedBy, ending + fusion codex, last character. */
export function recordResult(save: SaveV1, p: Play, res: RunResult): SaveV1 {
  const s = structuredClone(save), id = p.map.data.id, charId = p.rules!.char.id;
  const rec = s.progress.maps[id] ?? { stars: 0, best: 0, clearedBy: [] };
  if (res.cleared) {
    rec.stars = Math.max(rec.stars, res.stars);
    rec.best = Math.max(rec.best, res.total);
    if (!rec.clearedBy.includes(charId)) rec.clearedBy.push(charId);
    if (!s.progress.endings.includes(res.ending.id)) s.progress.endings.push(res.ending.id);
  }
  s.progress.maps[id] = rec;
  for (const f of p.rules!.fusions) if (!s.progress.fusions.includes(f)) s.progress.fusions.push(f);
  s.progress.lastChar = charId;
  delete s.run;
  return s;
}

declare function structuredClone<V>(value: V): V;
