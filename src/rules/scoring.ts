/**
 * Result score and stars (docs/DETAILED_DESIGN_V2.md 8, docs/GAME_DESIGN_V2.md 7).
 * result = play + clear + matchup + build bonus + hp x2 + first combo + full run + late growth.
 * Risk contracts and mutators are out of scope (Story 006). There is no penalty item: every
 * item is clamped to >= 0 whatever the input. All constants come from data/rules/scoring.json;
 * late growth uses `lateLevelScore` from data/rules/draft-rules.json.
 */
import type { Run } from '../game/machine.ts';
import type { MapData } from '../game/maps.ts';
import { lateLevelScore, drafting } from './leveling.ts';
import { fail, num, obj } from './validate.ts';
import type { Obj } from './validate.ts';

/** Matchup of the played character on the map (정석 / 보통 / 도전). */
export type Affinity = 'home' | 'neutral' | 'challenge';
/** Build bonus type (GD 7.2); `none` = no type condition met. */
export type BuildType = 'artisan' | 'fusion' | 'restraint' | 'none';
/** Score item keys in display order (spec 8). */
export const SCORE_KEYS = ['play', 'clear', 'affinity', 'build', 'hp', 'firstCombo', 'fullRun', 'late'] as const;
export type ScoreKey = (typeof SCORE_KEYS)[number];

/** Tuning from data/rules/scoring.json. */
export interface ScoreRules {
  clear: number;
  affinity: Record<Affinity, number>;
  hpMul: number;
  firstCombo: number;
  fullRun: number;
  build: {
    cap: number; expectedLevelUps: number; artisanPerRank: number; fusionPerCharacter: number; fusionPerFusion: number;
    fusionMinCross: number; restraintPerSkip: number; restraintMinSkips: number; nonePerCross: number;
  };
  stars: { hp: number; star3Score: Record<string, number> };
}

/** What the player built this run (raw build bonus input, spec 8.1). */
export interface BuildInput {
  /** Sum of the ranks of the character's own (non-common) skills. */
  ownRanks: number;
  /** Number of owned cross (other character) skills. */
  cross: number;
  /** Number of distinct characters the cross skills come from. */
  crossOwners: number;
  /** Fusions fired this run. */
  fusions: number;
  /** Level-up cards skipped. */
  skips: number;
}

/** Theoretical maxima of the content (spec 8.1), derived from data. */
export interface BuildMax {
  /** min(own skill ranks available, start ranks + expected level-ups). */
  artisanRanks: number;
  /** min(characters - 1, cross sources the slots allow). */
  fusionOwners: number;
  /** Fusions shipped. */
  fusions: number;
  /** Expected level-ups per run (skips cannot exceed it in theory). */
  levelUps: number;
}

/** Everything the result score needs (plain data, so it can be fed any input). */
export interface ScoreInput {
  playScore: number;
  cleared: boolean;
  affinity: Affinity;
  hp: number;
  /** First clear of this map with this character. */
  firstCombo: boolean;
  retries: number;
  /** Late growth points (`lateLevelScore`). */
  late: number;
  build: BuildInput;
  buildMax: BuildMax;
}

/** One score row. */
export interface ScoreItem { key: ScoreKey; value: number }

/** Result score breakdown. */
export interface ScoreResult {
  items: ScoreItem[];
  total: number;
  /** Winning build type, or null when not cleared. */
  buildType: BuildType | null;
  stars: number;
}

/**
 * Validate data/rules/scoring.json.
 * @example const rules = parseScoreRules(await read('data/rules/scoring.json'));
 */
export function parseScoreRules(raw: unknown): ScoreRules {
  const w = 'scoring';
  const o = obj(raw, w);
  const af = obj(o.affinity, `${w}.affinity`);
  const b = obj(o.build, `${w}.build`);
  const st = obj(o.stars, `${w}.stars`);
  const s3 = obj(st.star3Score, `${w}.stars.star3Score`);
  const p = (x: Obj, k: string): number => num(x, k, w, 0);
  const build = {
    cap: p(b, 'cap'), expectedLevelUps: p(b, 'expectedLevelUps'), artisanPerRank: p(b, 'artisanPerRank'),
    fusionPerCharacter: p(b, 'fusionPerCharacter'), fusionPerFusion: p(b, 'fusionPerFusion'), fusionMinCross: p(b, 'fusionMinCross'),
    restraintPerSkip: p(b, 'restraintPerSkip'), restraintMinSkips: p(b, 'restraintMinSkips'), nonePerCross: p(b, 'nonePerCross'),
  };
  if (build.fusionMinCross < 1) fail(w, 'build.fusionMinCross must be >= 1 (artisan owns the 0-cross case)');
  return {
    clear: p(o, 'clear'), hpMul: p(o, 'hpMul'), firstCombo: p(o, 'firstCombo'), fullRun: p(o, 'fullRun'),
    affinity: { home: p(af, 'home'), neutral: p(af, 'neutral'), challenge: p(af, 'challenge') },
    build,
    stars: { hp: p(st, 'hp'), star3Score: Object.fromEntries(Object.keys(s3).map((k) => [k, num(s3, k, `${w}.star3Score`, 1)])) },
  };
}

/**
 * The character's matchup on the map: the map's standard character = home, listed challenge = challenge, else neutral.
 * @example affinityOf(map, 'dike-keeper') === 'home'
 */
export function affinityOf(map: MapData, characterId: string): Affinity {
  if (map.standard === characterId) return 'home';
  return map.challenge.includes(characterId) ? 'challenge' : 'neutral';
}

/** Any number -> finite and >= 0 (no penalty items, whatever the input). */
const nn = (x: number): number => (Number.isFinite(x) && x > 0 ? x : 0);

/**
 * Normalized build bonus (spec 8.1): each eligible type scores min(cap, cap * raw / max);
 * the best one wins. `none` (no type eligible) is min(cap, cross * nonePerCross).
 * At the theoretical maximum input of a type, its bonus is exactly `cap`.
 * @example buildBonus(rules.build, { ownRanks: 8, cross: 0, crossOwners: 0, fusions: 0, skips: 0 }, max)
 */
export function buildBonus(b: ScoreRules['build'], input: BuildInput, max: BuildMax): { type: BuildType; value: number } {
  const norm = (raw: number, top: number): number => (top > 0 ? Math.min(b.cap, (b.cap * nn(raw)) / top) : 0);
  const cross = nn(input.cross);
  const cands: { type: BuildType; value: number }[] = [];
  if (cross === 0) cands.push({ type: 'artisan', value: norm(input.ownRanks * b.artisanPerRank, nn(max.artisanRanks) * b.artisanPerRank) });
  if (cross >= b.fusionMinCross) {
    cands.push({
      type: 'fusion',
      value: norm(nn(input.crossOwners) * b.fusionPerCharacter + nn(input.fusions) * b.fusionPerFusion,
        nn(max.fusionOwners) * b.fusionPerCharacter + nn(max.fusions) * b.fusionPerFusion),
    });
  }
  if (nn(input.skips) >= b.restraintMinSkips) cands.push({ type: 'restraint', value: norm(input.skips * b.restraintPerSkip, nn(max.levelUps) * b.restraintPerSkip) });
  if (cands.length === 0) cands.push({ type: 'none', value: Math.min(b.cap, cross * b.nonePerCross) });
  const best = cands.reduce((a, c) => (c.value > a.value ? c : a));
  return { type: best.type, value: Math.round(best.value) };
}

/**
 * Itemized result score and stars (spec 8, 8.2). Bonus items need a clear; every item is an integer >= 0.
 * Stars: 1 for the clear, +1 for hp >= stars.hp, +1 for total >= `star3`.
 * @param star3 The map's 3-star score (`rules.stars.star3Score[mapId]`).
 * @example const r = scoreResult(rules, runScoreInput(run, rules, true), rules.stars.star3Score[map.id]);
 */
export function scoreResult(rules: ScoreRules, input: ScoreInput, star3: number): ScoreResult {
  const c = input.cleared === true;
  const build = c ? buildBonus(rules.build, input.build, input.buildMax) : null;
  const raw: Record<ScoreKey, number> = {
    play: input.playScore,
    clear: c ? rules.clear : 0,
    affinity: c ? rules.affinity[input.affinity] ?? 0 : 0,
    build: build ? build.value : 0,
    hp: c ? input.hp * rules.hpMul : 0,
    firstCombo: c && input.firstCombo ? rules.firstCombo : 0,
    fullRun: c && input.retries === 0 ? rules.fullRun : 0,
    late: input.late,
  };
  const items = SCORE_KEYS.map((key) => ({ key, value: Math.floor(nn(raw[key])) }));
  const total = items.reduce((s, x) => s + x.value, 0);
  const stars = c ? 1 + (nn(input.hp) >= rules.stars.hp ? 1 : 0) + (total >= star3 ? 1 : 0) : 0;
  return { items, total, buildType: build ? build.type : null, stars };
}

/**
 * Collect the score input of a finished run: owned skills split into own / cross, fusions and
 * skips from the draft, and the content maxima from the loaded data.
 * @example const input = runScoreInput(run, rules, firstCombo);
 */
export function runScoreInput(run: Run, rules: ScoreRules, firstCombo: boolean): ScoreInput {
  const { rt } = run;
  const me = rt.character;
  let ownRanks = 0;
  let cross = 0;
  const owners = new Set<string>();
  for (const [id, rank] of rt.owned) {
    const def = rt.data.skills.get(id);
    if (!def || def.slot === 'common') continue;
    if (def.owner === me.id) ownRanks += rank;
    else {
      cross++;
      owners.add(def.owner);
    }
  }
  const ownRankCap = me.skills.reduce((s, id) => s + (rt.data.skills.get(id)?.ranks.length ?? 0), 0);
  const crossSources = run.draftData ? run.draftData.rules.cards.maxCrossActives : 0;
  return {
    playScore: run.draft?.score ?? 0,
    cleared: run.phase === 'result',
    affinity: affinityOf(run.map, me.id),
    hp: run.state.hp,
    firstCombo,
    retries: run.retries,
    late: drafting(run) ? lateLevelScore(run) : 0,
    build: { ownRanks, cross, crossOwners: owners.size, fusions: run.draft?.fusions.length ?? 0, skips: run.draft?.skips ?? 0 },
    buildMax: {
      artisanRanks: Math.min(ownRankCap, me.start.length + rules.build.expectedLevelUps),
      fusionOwners: Math.min(rt.data.characters.size - 1, crossSources),
      fusions: run.draftData?.fusions.length ?? 0,
      levelUps: rules.build.expectedLevelUps,
    },
  };
}
