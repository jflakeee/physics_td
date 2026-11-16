/**
 * Level-up cards (docs/DETAILED_DESIGN_V2.md 7.2-7.3, docs/GAME_DESIGN_V2.md 6.4): 3 cards =
 * 1 own + 2 cross, rarity 70/25/5 (legendary demoted to rare at launch), pity (fusion after
 * N offers without one, own tactical at Lv3, own ultimate at Lv5), reroll and skip.
 * Draws use only `run.rng.cards`, so rerolling never disturbs the events/weather streams.
 */
import type { Rng } from '../core/rng.ts';
import { fail, obj, str } from './validate.ts';
import { checkFusions, completingFusion, parseFusions } from './fusion.ts';
import type { FusionDef } from './fusion.ts';
import { draftLevel, parseDraftRules } from './leveling.ts';
import type { DraftRules, DraftRun } from './leveling.ts';
import { acquireSkill, upgradeSkill, zoneAllowed } from './skills.ts';
import type { SkillDef } from './skills.ts';

/** Everything loaded from data/rules/draft-rules.json and data/fusions.json. */
export interface DraftData { rules: DraftRules; fusions: FusionDef[] }

/** Card rarity after the launch demotion (legendary does not exist yet). */
export type Rarity = 'common' | 'rare';

/** One offered card. `rank` is the rank the skill has after the pick. */
export interface Card {
  /** `own`/`cross` skill card, or a `fallback` card when candidates ran out. */
  source: 'own' | 'cross' | 'fallback';
  /** Skill id, or the fallback id (supply / repair / maintenance). */
  id: string;
  /** Upgrade of an owned skill (false = new skill). */
  upgrade: boolean;
  /** null for fallback cards (they have no rarity). */
  rarity: Rarity | null;
  rank: number;
  /** Id of the fusion this card would complete (shown as the sparkle badge), else null. */
  fusion: string | null;
}

/**
 * Load the draft rules and fusions (paths come from data/index.json).
 * @example const draftData = await loadDraftData(read);
 */
export async function loadDraftData(read: (path: string) => Promise<unknown>): Promise<DraftData> {
  const index = obj(await read('data/index.json'), 'data/index.json');
  return {
    rules: parseDraftRules(await read(str(index, 'draft', 'data/index.json'))),
    fusions: parseFusions(await read(str(index, 'fusions', 'data/index.json'))),
  };
}

const isActive = (def: SkillDef): boolean => def.slot === 'basic' || def.slot === 'tactical' || def.slot === 'ultimate';

/** Weighted draw without side effects besides one `rng.next()`. */
function draw<T>(rng: Rng, items: readonly T[], weight: (x: T) => number): T {
  const total = items.reduce((s, x) => s + weight(x), 0);
  let r = rng.next() * total;
  for (const x of items) {
    r -= weight(x);
    if (r < 0) return x;
  }
  return items[items.length - 1];
}

/** Own skills not yet owned (new) or below max rank (upgrade). */
function ownCandidates(run: DraftRun): { id: string; upgrade: boolean }[] {
  const { rt } = run;
  const out: { id: string; upgrade: boolean }[] = [];
  for (const id of rt.character.skills) {
    const def = rt.data.skills.get(id) as SkillDef;
    const rank = rt.owned.get(id);
    if (rank === undefined) out.push({ id, upgrade: false });
    else if (rank < def.ranks.length) out.push({ id, upgrade: true });
  }
  return out;
}

/** Other characters' passive/basic/tactical skills: borrowable, not owned, with a target on this map, within the cross-active cap. */
function crossCandidates(run: DraftRun): string[] {
  const { rt, state } = run;
  const crossActives = [...rt.owned.keys()].filter((id) => {
    const d = rt.data.skills.get(id) as SkillDef;
    return d.owner !== rt.character.id && d.owner !== 'common' && isActive(d);
  }).length;
  const full = crossActives >= run.draftData.rules.cards.maxCrossActives;
  const out: string[] = [];
  for (const c of rt.data.characters.values()) {
    if (c.id === rt.character.id) continue;
    for (const id of c.skills) {
      const def = rt.data.skills.get(id) as SkillDef;
      if (def.slot === 'ultimate' || !def.borrowable || rt.owned.has(id) || (full && isActive(def))) continue;
      if (def.target === 'zone' && !Array.from({ length: state.zones.count }, (_, z) => z).some((z) => zoneAllowed(def, state, z))) continue;
      out.push(id);
    }
  }
  return out;
}

/** Roll a rarity from the weights; demoted rarities (legendary -> rare) are mapped. */
function rollRarity(rng: Rng, rules: DraftRules): Rarity {
  const { weights, launchDemote } = rules.cards.rarity;
  const keys = Object.keys(weights);
  const k = draw(rng, keys, (x) => weights[x]);
  return (launchDemote[k] ?? k) as Rarity;
}

/**
 * Generate the 3 cards of the pending level-up (spec 7.2). Consumes only the cards stream.
 * Does not change the pity counter (that moves when the offer is settled).
 * @example const cards = rollCards(run);
 */
export function rollCards(run: DraftRun): Card[] {
  const { rules } = run.draftData;
  const c = rules.cards;
  const rng = run.rng.cards;
  const { rt, map } = run;
  const own = ownCandidates(run);
  const cross = crossCandidates(run);
  const level = draftLevel(run);
  const fusionOf = (id: string): string | null => completingFusion(run, id)?.id ?? null;

  // Own slot: spike guarantee first, else a random own candidate.
  let ownPicks: { id: string; upgrade: boolean }[] = [];
  const spike = c.pity.spikes.find((s) => s.level === level)?.slot;
  const spiked = spike === undefined ? undefined : own.find((o) => !o.upgrade && (rt.data.skills.get(o.id) as SkillDef).slot === spike);
  const fusionDue = run.draft.sinceFusion >= c.pity.fusionAfter;
  const crossFusion = fusionDue ? cross.filter((id) => fusionOf(id) !== null) : [];
  const ownFusion = fusionDue && crossFusion.length === 0 && !spiked ? own.filter((o) => !o.upgrade && fusionOf(o.id) !== null) : [];
  const ownPool = ownFusion.length > 0 ? ownFusion : own;
  if (spiked) ownPicks.push(spiked);
  else if (ownPool.length > 0) ownPicks.push(draw(rng, ownPool, () => 1));
  ownPicks = ownPicks.slice(0, c.ownSlots);

  // Cross slots: forced fusion card first, then weighted (x standardWeight for the map's standard
  // character's skills, off for the challenge matchup), preferring owners not yet on offer.
  const challenge = map.challenge.includes(rt.character.id);
  const weight = (id: string): number => ((rt.data.skills.get(id) as SkillDef).owner === map.standard && !challenge ? c.standardWeight : 1);
  const crossPicks: string[] = [];
  const pool = [...cross];
  const take = (id: string): void => {
    crossPicks.push(id);
    pool.splice(pool.indexOf(id), 1);
  };
  if (crossFusion.length > 0) take(draw(rng, crossFusion, weight));
  while (crossPicks.length < c.crossSlots && pool.length > 0) {
    const usedOwners = new Set(crossPicks.map((id) => (rt.data.skills.get(id) as SkillDef).owner));
    const fresh = pool.filter((id) => !usedOwners.has((rt.data.skills.get(id) as SkillDef).owner));
    take(draw(rng, fresh.length > 0 ? fresh : pool, weight));
  }

  // Fill shortages: more own cards, then fallback cards.
  const extraOwn = own.filter((o) => !ownPicks.some((p) => p.id === o.id));
  while (ownPicks.length + crossPicks.length < c.ownSlots + c.crossSlots && extraOwn.length > 0) {
    ownPicks.push(extraOwn.splice(rng.int(extraOwn.length), 1)[0]);
  }
  const cards: Card[] = [];
  for (const o of ownPicks) {
    const def = rt.data.skills.get(o.id) as SkillDef;
    const rarity = rollRarity(rng, rules);
    const rare = rarity === 'rare';
    const cur = rt.owned.get(o.id) ?? 0;
    const rank = o.upgrade ? cur + 1 + (rare ? c.rarity.rareUpgradeExtraRanks : 0) : 1 + (rare ? c.rarity.rareNewExtraRanks : 0);
    cards.push({ source: 'own', id: o.id, upgrade: o.upgrade, rarity, rank: Math.min(def.ranks.length, rank), fusion: o.upgrade ? null : fusionOf(o.id) });
  }
  for (const id of crossPicks) {
    rollRarity(rng, rules); // keeps the stream layout; cross skills are Rank 1 so they are always common
    cards.push({ source: 'cross', id, upgrade: false, rarity: 'common', rank: c.crossRank, fusion: fusionOf(id) });
  }
  const left = [...c.fallback];
  while (cards.length < c.ownSlots + c.crossSlots && left.length > 0) {
    const f = left.splice(rng.int(left.length), 1)[0];
    cards.push({ source: 'fallback', id: f.id, upgrade: false, rarity: null, rank: 0, fusion: null });
  }
  return cards;
}

/**
 * The cards on offer for the pending level-up (generated once, kept until settled).
 * @example const cards = currentOffer(run);
 */
export function currentOffer(run: DraftRun): Card[] {
  return (run.draft.offer ??= rollCards(run));
}

/**
 * Reroll the offer once per run (`rerolls` in the rules), from the same cards stream.
 * @returns false when no reroll is left.
 * @example if (reroll(run)) render(currentOffer(run));
 */
export function reroll(run: DraftRun): boolean {
  if (run.draft.rerollsLeft <= 0 || run.draft.pending <= 0) return false;
  run.draft.rerollsLeft--;
  run.draft.offer = rollCards(run);
  return true;
}

/** Close the current offer: update the fusion pity counter and consume one pending level-up. */
function settle(run: DraftRun): void {
  const d = run.draft;
  d.sinceFusion = (d.offer ?? []).some((x) => x.fusion !== null) ? 0 : d.sinceFusion + 1;
  d.offer = null;
  d.pending--;
}

/**
 * Whether taking `card` needs the player to pick an active skill to replace (spec 7.3).
 * @example if (needsReplace(run, card)) showReplaceSheet();
 */
export function needsReplace(run: DraftRun, card: Card): boolean {
  if (card.source === 'fallback' || card.upgrade) return false;
  const def = run.rt.data.skills.get(card.id) as SkillDef;
  return isActive(def) && ownedActives(run).length >= run.draftData.rules.cards.activeSlots;
}

/**
 * Owned actives (basic/tactical/ultimate) of the character and borrowed ones, i.e. the slots.
 * @example const choices = ownedActives(run);
 */
export function ownedActives(run: DraftRun): string[] {
  return [...run.rt.owned.keys()].filter((id) => isActive(run.rt.data.skills.get(id) as SkillDef));
}

/** Result of a pick. */
export type PickResult = { ok: true; fusions: FusionDef[] } | { ok: false; reason: 'NO_PENDING' | 'BAD_CARD' | 'NEED_REPLACE' | 'BAD_REPLACE' };

/**
 * Take offer card `index` (spec 7.3): acquire/upgrade the skill (borrowed skills stay Rank 1,
 * rare gives extra ranks), apply fallback effects, fire fusions, consume one pending level-up.
 * @param replace Owned active to drop when the active slots are full.
 * @example const r = pickCard(run, 0); if (!r.ok && r.reason === 'NEED_REPLACE') showSheet();
 */
export function pickCard(run: DraftRun, index: number, replace?: string): PickResult {
  if (run.draft.pending <= 0) return { ok: false, reason: 'NO_PENDING' };
  const card = currentOffer(run)[index];
  if (!card) return { ok: false, reason: 'BAD_CARD' };
  const { rt, state } = run;
  if (needsReplace(run, card)) {
    if (replace === undefined) return { ok: false, reason: 'NEED_REPLACE' };
    if (!ownedActives(run).includes(replace)) return { ok: false, reason: 'BAD_REPLACE' };
    rt.owned.delete(replace);
    rt.cooldown.delete(replace);
  }
  if (card.source === 'fallback') {
    const f = run.draftData.rules.cards.fallback.find((x) => x.id === card.id);
    if (!f) fail('draft-rules', `unknown fallback ${card.id}`);
    if (f.id === 'supply') run.cash += f.value;
    else if (f.id === 'repair') state.hp = Math.min(f.max, state.hp + f.value);
    else run.draft.modifiers[f.id] = Math.min(f.max, (run.draft.modifiers[f.id] ?? 0) + 1);
  } else if (card.upgrade) {
    for (let r = rt.owned.get(card.id) ?? 0; r < card.rank; r++) upgradeSkill(rt, state, card.id);
  } else {
    acquireSkill(rt, state, card.id);
    for (let r = 1; r < card.rank; r++) upgradeSkill(rt, state, card.id);
  }
  const fusions = checkFusions(run);
  settle(run);
  return { ok: true, fusions };
}

/**
 * Skip the offer: cash +`skipCash`, one pending level-up consumed (spec 7.3).
 * @returns false when nothing is pending.
 * @example skipCard(run);
 */
export function skipCard(run: DraftRun): boolean {
  if (run.draft.pending <= 0) return false;
  currentOffer(run);
  run.cash += run.draftData.rules.cards.skipCash;
  run.draft.skips++;
  settle(run);
  return true;
}

