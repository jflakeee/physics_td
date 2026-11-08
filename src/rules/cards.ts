import type { Rng } from '../core/rng.ts';
import type { RulesState } from './skills.ts';
import { canUse, grant, revoke } from './skills.ts';
import { checkFusions, completes, ingredientOf } from './fusion.ts';
import type { FusionDef, SkillDef } from './types.ts';

/**
 * Level-up draft (GD §6.4, DETAILED §7.2–7.3). No DOM; all randomness from `rng.cards`.
 * 3 cards = own 1 + cross 2. Own: unowned own skill (ultimate included) or an upgrade.
 * Cross: another character's passive/basic/tactical, not owned, actives only while < 2
 * cross actives, never a skill with no target on this map. Lv3/Lv5 guarantee the own
 * tactical/ultimate. After `fusionCeiling` drafts without a fusion card, one is forced.
 * Rarity 70/25/5 per card; legendary → rare (no variants yet); cross cards stay common
 * (Rank 1 fixed). Rare: upgrade +2 ranks / new own skill at Rank 2.
 */

export type Rarity = 'common' | 'rare' | 'legendary';
export type SubId = 'supply' | 'repair' | 'maintenance';

export type Card =
  | { kind: 'skill'; skill: string; side: 'own' | 'cross'; upgrade: boolean; rank: number; rarity: Rarity; fusion: string | null; completes: boolean }
  | { kind: 'sub'; sub: SubId };

export interface DraftState {
  rng: Rng;
  rerollsLeft: number;
  /** Drafts since a fusion card was last offered. */
  sinceFusion: number;
  skips: number;
  /** Levels drafted so far (the next draft is for level `drafted + 2`). */
  drafted: number;
  offer: Card[] | null;
  /** 정석 character of the map style, when the player is not that map's 도전 character. */
  homeChar: string | null;
}

export interface DraftCtx { rs: RulesState; fusions: readonly FusionDef[]; }

export function createDraft(rng: Rng, rs: RulesState, mapStyle: string | undefined, chars: readonly { id: string; homeStyles: string[] }[]): DraftState {
  const home = chars.find(c => mapStyle && c.homeStyles.includes(mapStyle))?.id ?? null;
  // challenge = the map has a home character and it is not us → no home weighting (GD §6.4 예외)
  const challenge = home !== null && home !== rs.char.id;
  return { rng, rerollsLeft: rs.eco.draft.rerolls, sinceFusion: 0, skips: 0, drafted: 0, offer: null, homeChar: challenge ? null : home };
}

/** Raw rarity draw (exported for the distribution test). */
export function rollRarity(rng: Rng, w: { common: number; rare: number; legendary: number }): Rarity {
  const r = rng.next() * (w.common + w.rare + w.legendary);
  return r < w.common ? 'common' : r < w.common + w.rare ? 'rare' : 'legendary';
}

const ACTIVE = new Set(['basic', 'tactical', 'ultimate']);
const activeCount = (rs: RulesState) => rs.owned.filter(o => ACTIVE.has(rs.defs.get(o.id)!.slot)).length;
const crossActiveCount = (rs: RulesState) => rs.owned.filter(o => o.borrowed && ACTIVE.has(rs.defs.get(o.id)!.slot)).length;
const hasTarget = (rs: RulesState, d: SkillDef) => d.target !== 'zone' || canUse({ ...rs, owned: [...rs.owned, { id: d.id, rank: 1, borrowed: true, cd: 0 }], world: { ...rs.world, cash: null } }, d.id, false) !== 'NO_TARGET_IN_MAP';

interface Cand { def: SkillDef; upgrade: boolean; weight: number; }

function ownCandidates(rs: RulesState): Cand[] {
  const out: Cand[] = [];
  for (const id of Object.values(rs.char.skills)) {
    const d = rs.defs.get(id)!, have = rs.owned.find(o => o.id === id);
    if (have) { if (have.rank < d.ranks.length) out.push({ def: d, upgrade: true, weight: 1 }); }
    else if (hasTarget(rs, d)) out.push({ def: d, upgrade: false, weight: 1 });
  }
  return out;
}

function crossCandidates(rs: RulesState, homeChar: string | null, homeWeight: number): Cand[] {
  const full = crossActiveCount(rs) >= 2;
  const out: Cand[] = [];
  for (const d of rs.defs.values()) {
    if (d.owner === rs.char.id || d.slot === 'common' || d.slot === 'ultimate' || !d.borrowable) continue;
    if (rs.owned.some(o => o.id === d.id)) continue;
    if (full && ACTIVE.has(d.slot)) continue;
    if (!hasTarget(rs, d)) continue;
    out.push({ def: d, upgrade: false, weight: homeChar && d.owner === homeChar ? homeWeight : 1 });
  }
  return out;
}

function pickWeighted(rng: Rng, c: Cand[]): Cand {
  let total = 0;
  for (const x of c) total += x.weight;
  let r = rng.next() * total;
  for (const x of c) { r -= x.weight; if (r < 0) return x; }
  return c[c.length - 1];
}

/** Roll an offer of 3 cards for the next drafted level. */
export function rollCards(ds: DraftState, ctx: DraftCtx): Card[] {
  const { rs, fusions } = ctx, cfg = rs.eco.draft, level = ds.drafted + 2;
  let own = ownCandidates(rs);
  let cross = crossCandidates(rs, ds.homeChar, cfg.homeWeight);
  const picks: { c: Cand; side: 'own' | 'cross' }[] = [];
  const take = (pool: Cand[], c: Cand) => pool.filter(x => x !== c);

  // own slot (with Lv3 tactical / Lv5 ultimate spikes)
  const spike = level === cfg.spike.tactical ? 'tactical' : level === cfg.spike.ultimate ? 'ultimate' : null;
  const spiked = spike ? own.find(c => !c.upgrade && c.def.slot === spike) : undefined;
  if (spiked) { picks.push({ c: spiked, side: 'own' }); own = take(own, spiked); }
  else if (own.length) { const c = pickWeighted(ds.rng, own); picks.push({ c, side: 'own' }); own = take(own, c); }

  // two cross cards; shortfall → own; then substitutes
  for (let k = 0; k < 2; k++) {
    if (cross.length) { const c = pickWeighted(ds.rng, cross); picks.push({ c, side: 'cross' }); cross = take(cross, c); }
    else if (own.length) { const c = pickWeighted(ds.rng, own); picks.push({ c, side: 'own' }); own = take(own, c); }
  }

  // fusion ceiling: force a card that completes (or else feeds) an unfired fusion
  const isFusion = (c: Cand) => completes(rs, fusions, c.def.id) ?? ingredientOf(rs, fusions, c.def.id);
  if (ds.sinceFusion >= cfg.fusionCeiling && !picks.some(p => !p.c.upgrade && isFusion(p.c))) {
    const pool = [...own.map(c => ({ c, side: 'own' as const })), ...cross.map(c => ({ c, side: 'cross' as const }))].filter(p => !p.c.upgrade);
    const best = pool.find(p => completes(rs, fusions, p.c.def.id)) ?? pool.find(p => ingredientOf(rs, fusions, p.c.def.id));
    if (best) {
      const slot = picks.findIndex(p => p.side === best.side && !(spiked && p.c === spiked));
      picks[slot >= 0 ? slot : picks.length - 1] = best;
    }
  }

  const cards: Card[] = picks.map(({ c, side }) => {
    let rarity = rollRarity(ds.rng, cfg.rarity);
    if (rarity === 'legendary') rarity = 'rare';            // no legendary variants in the release
    if (side === 'cross') rarity = 'common';               // borrowed skills are Rank 1 fixed
    const have = rs.owned.find(o => o.id === c.def.id);
    const rank = c.upgrade ? Math.min(c.def.ranks.length, (have?.rank ?? 1) + (rarity === 'rare' ? cfg.rareRankGain : 1))
      : side === 'cross' ? 1 : rarity === 'rare' ? Math.min(c.def.ranks.length, cfg.rareNewRank) : 1;
    const done = !c.upgrade ? completes(rs, fusions, c.def.id) : null;
    const fusion = c.upgrade ? null : done ?? ingredientOf(rs, fusions, c.def.id);
    return { kind: 'skill', skill: c.def.id, side, upgrade: c.upgrade, rank, rarity, fusion, completes: !!done };
  });
  const subs: SubId[] = ['supply', 'repair', 'maintenance'];
  while (cards.length < 3) {
    const left = subs.filter(s => !cards.some(c => c.kind === 'sub' && c.sub === s)
      && !(s === 'maintenance' && rs.maintenanceStacks >= rs.eco.substitutes.maintenance.maxStacks));
    if (!left.length) break;
    cards.push({ kind: 'sub', sub: left[ds.rng.int(left.length)] });
  }
  ds.sinceFusion = cards.some(c => c.kind === 'skill' && c.fusion) ? 0 : ds.sinceFusion + 1;
  ds.offer = cards;
  return cards;
}

export type PickResult = { ok: true; fused: string[] } | { ok: false; reason: 'NEED_REPLACE' | 'BAD_INDEX' | 'NO_REROLL' };

/** Would taking this card need an active slot to be freed? */
export function needsReplace(rs: RulesState, c: Card): boolean {
  if (c.kind !== 'skill' || c.upgrade) return false;
  return ACTIVE.has(rs.defs.get(c.skill)!.slot) && activeCount(rs) >= 4;
}

/** Take card `index`; `replace` = the active skill to drop when slots are full. */
export function pickCard(ds: DraftState, ctx: DraftCtx, index: number, replace?: string): PickResult {
  const { rs } = ctx, c = ds.offer?.[index];
  if (!c) return { ok: false, reason: 'BAD_INDEX' };
  if (c.kind === 'skill') {
    if (needsReplace(rs, c)) {
      if (!replace || !rs.owned.some(o => o.id === replace && ACTIVE.has(rs.defs.get(o.id)!.slot))) return { ok: false, reason: 'NEED_REPLACE' };
      revoke(rs, replace);
    }
    grant(rs, c.skill, c.side === 'cross', c.rank);
  } else {
    const s = rs.eco.substitutes, w = rs.world;
    if (c.sub === 'supply' && w.cash !== null) w.cash += s.supply.cash;
    if (c.sub === 'repair') w.hp = Math.min(s.repair.maxHp, w.hp + s.repair.hp);
    if (c.sub === 'maintenance') { rs.commonCdMul *= s.maintenance.commonCdMul; rs.maintenanceStacks++; }
  }
  ds.offer = null; ds.drafted++;
  return { ok: true, fused: checkFusions(rs, ctx.fusions) };
}

/** Skip the draft: +40 cash. */
export function skipDraft(ds: DraftState, rs: RulesState): void {
  if (rs.world.cash !== null) rs.world.cash += rs.eco.draft.skipCash;
  ds.skips++; ds.offer = null; ds.drafted++;
}

/** Reroll once per run with the same card stream. */
export function reroll(ds: DraftState, ctx: DraftCtx): PickResult {
  if (ds.rerollsLeft <= 0) return { ok: false, reason: 'NO_REROLL' };
  ds.rerollsLeft--;
  rollCards(ds, ctx);
  return { ok: true, fused: [] };
}
