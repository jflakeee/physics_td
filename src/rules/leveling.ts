/**
 * Play score = XP and level-ups (docs/DETAILED_DESIGN_V2.md 7.1, docs/GAME_DESIGN_V2.md 6.1-6.3).
 * Level-ups during a wave only raise `pending` (HUD badge); the wave-end settlement turns them
 * into card picks (rules/cards.ts). Level-ups during the last wave become `lateLevels`,
 * worth `lateLevelScore` result points each. All numbers come from data/rules/draft-rules.json.
 */
import type { Run } from '../game/machine.ts';
import type { SimState } from '../core/types.ts';
import type { Card } from './cards.ts';
import { arr, fail, num, obj, str } from './validate.ts';
import type { Obj } from './validate.ts';

/** One rarity / fallback / spike entry of the card rules. */
export interface FallbackRule { id: string; value: number; max: number }
export interface SpikeRule { level: number; slot: string }

/** Tuning from data/rules/draft-rules.json. */
export interface DraftRules {
  xp: { base: number; growth: number };
  score: { drainedPer: number; blockedPer: number; ecologyPerPercent: number; noDamageWave: number; waveClear: number };
  lateLevelScore: number;
  cards: {
    ownSlots: number; crossSlots: number; maxCrossActives: number; activeSlots: number; crossRank: number;
    standardWeight: number; rerolls: number; skipCash: number;
    rarity: { weights: Record<string, number>; launchDemote: Record<string, string>; rareNewExtraRanks: number; rareUpgradeExtraRanks: number };
    pity: { fusionAfter: number; spikes: SpikeRule[] };
    fallback: FallbackRule[];
  };
}

/** Mutable draft progress of one run (everything a wave checkpoint must restore). */
export interface DraftState {
  /** XP into the current level. */
  xp: number;
  /** Total play score earned this run (never reset by level-ups). */
  score: number;
  /** Level-ups waiting for a card pick. */
  pending: number;
  /** Level-ups during the last wave, converted to result score. */
  lateLevels: number;
  /** Metric values already scored. */
  seen: { drained: number; blocked: number; ecology: number };
  /** Level-up offers since the last offer containing a fusion card. */
  sinceFusion: number;
  rerollsLeft: number;
  skips: number;
  /** Fusion ids fired this run (restored on retry). */
  fusions: string[];
  /** Effect modifiers set by fusions / fallback cards (hooks for the sim; Story 003 owns reading them). */
  modifiers: Record<string, number>;
  /** The cards currently on offer, null until the screen first asks. */
  offer: Card[] | null;
}

const pos = (o: Obj, k: string, w: string): number => num(o, k, w, 0);

/**
 * Validate data/rules/draft-rules.json.
 * @example const rules = parseDraftRules(await read('data/rules/draft-rules.json'));
 */
export function parseDraftRules(raw: unknown): DraftRules {
  const w = 'draft-rules';
  const o = obj(raw, w);
  const xp = obj(o.xp, `${w}.xp`);
  const sc = obj(o.score, `${w}.score`);
  const c = obj(o.cards, `${w}.cards`);
  const ra = obj(c.rarity, `${w}.cards.rarity`);
  const pi = obj(c.pity, `${w}.cards.pity`);
  const weights = obj(ra.weights, `${w}.rarity.weights`);
  const demote = obj(ra.launchDemote, `${w}.rarity.launchDemote`);
  for (const k of Object.keys(weights)) pos(weights, k, `${w}.rarity.weights`);
  for (const k of Object.keys(demote)) if (!(k in weights)) fail(w, `launchDemote "${k}" is not a rarity`);
  return {
    xp: { base: pos(xp, 'base', w), growth: num(xp, 'growth', w, 1) },
    score: {
      drainedPer: pos(sc, 'drainedPer', w), blockedPer: pos(sc, 'blockedPer', w), ecologyPerPercent: pos(sc, 'ecologyPerPercent', w),
      noDamageWave: pos(sc, 'noDamageWave', w), waveClear: pos(sc, 'waveClear', w),
    },
    lateLevelScore: pos(o, 'lateLevelScore', w),
    cards: {
      ownSlots: pos(c, 'ownSlots', w), crossSlots: pos(c, 'crossSlots', w), maxCrossActives: pos(c, 'maxCrossActives', w),
      activeSlots: pos(c, 'activeSlots', w), crossRank: num(c, 'crossRank', w, 1), standardWeight: pos(c, 'standardWeight', w),
      rerolls: pos(c, 'rerolls', w), skipCash: pos(c, 'skipCash', w),
      rarity: {
        weights: weights as Record<string, number>,
        launchDemote: Object.fromEntries(Object.keys(demote).map((k) => [k, str(demote, k, w)])),
        rareNewExtraRanks: pos(ra, 'rareNewExtraRanks', w), rareUpgradeExtraRanks: pos(ra, 'rareUpgradeExtraRanks', w),
      },
      pity: {
        fusionAfter: pos(pi, 'fusionAfter', w),
        spikes: arr(pi, 'spikes', w).map((s, k) => {
          const so = obj(s, `${w}.pity.spikes[${k}]`);
          return { level: pos(so, 'level', w), slot: str(so, 'slot', w) };
        }),
      },
      fallback: arr(c, 'fallback', w).map((f, k) => {
        const fo = obj(f, `${w}.fallback[${k}]`);
        return { id: str(fo, 'id', w), value: pos(fo, 'value', w), max: fo.max === undefined ? Infinity : pos(fo, 'max', w) };
      }),
    },
  };
}

/**
 * Fresh draft state; the metric baselines start at the sim's current values.
 * @example run.draft = createDraft(rules, state);
 */
export function createDraft(rules: DraftRules, state: SimState): DraftState {
  const m = state.metrics;
  return {
    xp: 0, score: 0, pending: 0, lateLevels: 0, seen: { drained: m.drained, blocked: m.blocked, ecology: m.ecology },
    sinceFusion: 0, rerollsLeft: rules.cards.rerolls, skips: 0, fusions: [], modifiers: {}, offer: null,
  };
}

/** A run that has the draft system attached. */
export type DraftRun = Run & { draft: DraftState; draftData: NonNullable<Run['draftData']> };

/**
 * Whether the run has draft data (bots and old tests create runs without it).
 * @example if (drafting(run)) accrueScore(run);
 */
export function drafting(run: Run): run is DraftRun {
  return run.draft !== null && run.draftData !== null;
}

/**
 * XP needed to go from `lv` to `lv + 1`: `round(base * growth^(lv-1))` (spec 7.1).
 * @example xpToNext(rules, 3) === 182
 */
export function xpToNext(rules: DraftRules, lv: number): number {
  return Math.round(rules.xp.base * rules.xp.growth ** (lv - 1));
}

/**
 * Add play score (= XP 1:1). Level-ups go to `pending`, or to `lateLevels` while the last wave runs.
 * @example addXp(run, 120);
 */
export function addXp(run: DraftRun, n: number): void {
  const d = run.draft;
  const rules = run.draftData.rules;
  d.xp += n;
  d.score += n;
  for (let need = xpToNext(rules, run.level); d.xp >= need; need = xpToNext(rules, run.level)) {
    d.xp -= need;
    run.level++;
    if (run.phase === 'wave' && run.wave >= run.waveMax) d.lateLevels++;
    else d.pending++;
  }
}

/**
 * Score what the sim measured since the last call: drained water, blocked water, new ecology highs
 * (GD 6.1). Call once per wave tick.
 * @example accrueScore(run);
 */
export function accrueScore(run: DraftRun): void {
  const { seen } = run.draft;
  const m = run.state.metrics;
  const s = run.draftData.rules.score;
  const eco = Math.max(0, m.ecology - seen.ecology);
  const gain = (m.drained - seen.drained) * s.drainedPer + (m.blocked - seen.blocked) * s.blockedPer + eco * s.ecologyPerPercent;
  seen.drained = m.drained;
  seen.blocked = m.blocked;
  seen.ecology = Math.max(seen.ecology, m.ecology);
  if (gain > 0) addXp(run, gain);
}

/**
 * Wave-end score: the clear bonus, plus the no-damage bonus. Call while the wave is still the
 * current phase so last-wave level-ups convert to score.
 * @example waveEndScore(run);
 */
export function waveEndScore(run: DraftRun): void {
  const s = run.draftData.rules.score;
  addXp(run, s.waveClear + (run.state.metrics.damageThisWave === 0 ? s.noDamageWave : 0));
}

/**
 * Result score of the last-wave level-ups ("막판 성장"); Story 006 adds it to the result.
 * @example const bonus = lateLevelScore(run);
 */
export function lateLevelScore(run: DraftRun): number {
  return run.draft.lateLevels * run.draftData.rules.lateLevelScore;
}

/**
 * The level the next card pick is for (the level just reached by that level-up).
 * @example const lv = draftLevel(run);
 */
export function draftLevel(run: DraftRun): number {
  return run.level - run.draft.pending + 1;
}
