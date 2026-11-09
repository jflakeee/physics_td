import type { EconomyDef } from './types.ts';

/**
 * Result score (GD §7, DETAILED §8). No penalties: every item is ≥ 0.
 *   play + clear 500 + affinity (home 0 / neutral 100 / challenge 200) + build bonus
 *   + HP×2 + first combo 50 + no retry 100 + late levels ×50
 * Build bonus: best qualifying type, normalised by its theoretical max for the current
 * content so each type can reach exactly 300 (§8.1).
 */

export type Affinity = 'home' | 'neutral' | 'challenge';
export type BuildType = 'artisan' | 'fusion' | 'restraint' | 'none';

export interface ResultInput {
  playScore: number;
  cleared: boolean;
  affinity: Affinity;
  hp: number;
  firstCombo: boolean;
  retries: number;
  lateLevels: number;
  /** Ranks of own skills owned at the end. */
  ownRanks: number[];
  /** Characters the cross skills came from, one entry per cross skill. */
  crossOwners: string[];
  fusionsFired: number;
  skips: number;
}

/** Content facts the normalisation depends on (computed from data). */
export interface Content {
  /** Skills per character (4). */
  ownSkillCount: number;
  /** Rank sum at Lv1 (passive + basic = 2). */
  startRankSum: number;
  maxRank: number;
  characters: number;
  /** Distinct characters cross skills may come from (cross active slots allow 2). */
  crossSourcesAllowed: number;
  fusions: number;
}

export interface ScoreItem { key: string; value: number; }

export function buildMax(c: Content, r: EconomyDef['result']): Record<Exclude<BuildType, 'none'>, number> {
  return {
    artisan: Math.min(c.ownSkillCount * c.maxRank, c.startRankSum + r.expectedLevelUps) * r.artisanPerRank,
    fusion: Math.min(c.characters - 1, c.crossSourcesAllowed) * r.fusionPerSource + c.fusions * r.fusionPerFusion,
    restraint: r.expectedLevelUps * r.restraintPerSkip,
  };
}

/** Best build bonus and its type. */
export function buildBonus(i: ResultInput, c: Content, eco: EconomyDef): { type: BuildType; value: number } {
  const r = eco.result, max = buildMax(c, r), cap = r.buildCap;
  const norm = (raw: number, m: number) => Math.max(0, Math.min(cap, Math.round(cap * raw / m)));
  const cands: { type: BuildType; value: number }[] = [];
  if (i.crossOwners.length === 0) cands.push({ type: 'artisan', value: norm(i.ownRanks.reduce((a, b) => a + b, 0) * r.artisanPerRank, max.artisan) });
  if (i.crossOwners.length >= r.fusionMinCross) cands.push({ type: 'fusion', value: norm(new Set(i.crossOwners).size * r.fusionPerSource + i.fusionsFired * r.fusionPerFusion, max.fusion) });
  if (i.skips >= r.restraintMinSkips) cands.push({ type: 'restraint', value: norm(i.skips * r.restraintPerSkip, max.restraint) });
  if (!cands.length) cands.push({ type: 'none', value: Math.max(0, Math.min(cap, i.crossOwners.length * r.nonePerCross)) });
  return cands.reduce((a, b) => (b.value > a.value ? b : a));
}

/** Itemised result score (items with value 0 are kept; the UI hides them). */
export function resultScore(i: ResultInput, c: Content, eco: EconomyDef): { items: ScoreItem[]; total: number; build: BuildType } {
  const r = eco.result;
  const b = buildBonus(i, c, eco);
  const items: ScoreItem[] = [
    { key: 'play', value: Math.max(0, Math.floor(i.playScore)) },
    { key: 'clear', value: i.cleared ? r.clear : 0 },
    { key: 'affinity', value: i.cleared ? r.affinity[i.affinity] : 0 },
    { key: 'build', value: i.cleared ? b.value : 0 },
    { key: 'hp', value: Math.max(0, i.hp) * r.hpPer },
    { key: 'firstCombo', value: i.cleared && i.firstCombo ? r.firstCombo : 0 },
    { key: 'noRetry', value: i.cleared && i.retries === 0 ? r.noRetry : 0 },
    { key: 'late', value: Math.max(0, i.lateLevels) * eco.xp.lateLevelScore },
  ];
  return { items, total: items.reduce((a, x) => a + x.value, 0), build: b.type };
}

/** Stars: ⭐1 clear, ⭐2 HP ≥ 70, ⭐3 result ≥ the map's target (§8.2). */
export function stars(cleared: boolean, hp: number, total: number, star3Score: number, eco: EconomyDef): number {
  if (!cleared) return 0;
  return 1 + (hp >= eco.result.star2Hp ? 1 : 0) + (total >= star3Score ? 1 : 0);
}
