/**
 * Skill system (docs/DETAILED_DESIGN_V2.md 6.1-6.7, 4.8; GAME_DESIGN_V2.md 5, 8.1).
 * Loads data/skills/*.json + data/characters/*.json, validates them at the boundary,
 * and keeps per-run state (ownership, cooldowns in ticks, ultimate gauge, axis scores).
 * Effects are delegated to rules/effects.ts ops. Leveling/cards (Story 005) and map
 * levee lines (Story 004) plug in through `acquireSkill`/`upgradeSkill` and `EffectEnv.leveeLines`.
 */
import type { SimState } from '../core/types.ts';
import { TICKS_PER_SEC, ZONE } from '../sim/constants.ts';
import { zoneType } from '../input/hit.ts';
import { advanceEffects, createEffectEnv, endWaveEffects, isRedundant, parseOps, runOps, swipeCells, useCost } from './effects.ts';
import type { EffectEnv, Op } from './effects.ts';
import { arr, fail, num, obj, oneOf, str } from './validate.ts';
import type { Obj } from './validate.ts';

export const SLOTS = ['common', 'passive', 'basic', 'tactical', 'ultimate'] as const;
export const TARGETS = ['zone', 'gate', 'swipe', 'global', 'pump', 'none'] as const;

/** One rank: the ops that run on use (actives) or on acquire (passives). */
export interface Rank { ops: Op[] }
/** Region/variant override: presentation and ranks (e.g. levee -> ice dam). */
export interface SkillVariant { icon?: string; i18n?: string; ranks?: Rank[] }

/** A skill as defined in data/skills/*.json. `cooldown` in seconds. */
export interface SkillDef {
  id: string;
  owner: string;
  slot: (typeof SLOTS)[number];
  axis: string | null;
  target: (typeof TARGETS)[number];
  /** Zone type names (keys of `ZONE`) the skill may target, or `all`. */
  zoneTypes: string[];
  cooldown: number;
  cost: number;
  borrowable: boolean;
  ranks: Rank[];
  icon: string;
  i18n: string;
  variants: Record<string, SkillVariant>;
  /** Only for `target: "pump"`. */
  pump?: { maxConcurrent: number; costPerSec: number };
}

/** Ultimate gauge source. `blocked`: metrics.blocked delta; `ecology`: new ecology highs. */
export interface CharacterDef {
  id: string;
  i18n: string;
  axis: string;
  skills: string[];
  start: string[];
  gauge: { source: 'blocked' | 'ecology'; perUnit: number; gain: number };
}

/** Run-independent tuning from data/rules/skill-rules.json. */
export interface SkillRules {
  gaugeMax: number;
  axis: { acquire: number; rankUp: number; passivePerWave: number; costOnlyUse: number; cooldownDivisor: number };
}

/** Everything loaded from data/. */
export interface SkillData {
  rules: SkillRules;
  characters: Map<string, CharacterDef>;
  skills: Map<string, SkillDef>;
}

/** `canUse` failure codes (spec 6.6). */
export type FailReason = 'NOT_OWNED' | 'COOLDOWN' | 'NO_CASH' | 'NO_GAUGE' | 'BAD_TARGET' | 'NO_TARGET_IN_MAP' | 'PAUSED' | 'ALREADY_DONE';

/** Toast i18n key per failure code (NOT_OWNED has no button, so no toast). */
export const FAIL_TOAST: Readonly<Record<FailReason, string | null>> = {
  NOT_OWNED: null,
  COOLDOWN: 'toast.cooldown',
  NO_CASH: 'toast.noCash',
  NO_GAUGE: 'toast.noGauge',
  BAD_TARGET: 'toast.badTarget',
  NO_TARGET_IN_MAP: 'toast.noTargetInMap',
  PAUSED: 'toast.paused',
  ALREADY_DONE: 'toast.alreadyDone',
};

/** Toast for turning on a pump when `maxConcurrent` pumps already run (reported as BAD_TARGET). */
export const PUMP_LIMIT_TOAST = 'toast.pumpLimit';

/** Result of a validity check. `toast` is an i18n key or null. */
export type CanUse = { ok: true } | { ok: false; reason: FailReason; toast: string | null };
/** Result of using a skill; `spent` is the cash to deduct. */
export type UseResult = { ok: true; spent: number } | Extract<CanUse, { ok: false }>;

/** Per-use situation supplied by the caller (economy and pause live elsewhere). */
export interface UseContext { cash: number; paused: boolean }
/** Target of a use: a zone id, and/or swipe cells already converted from the screen path. */
export interface UseTarget { zone?: number; cells?: readonly number[] }

/** Per-run skill state. */
export interface SkillRuntime {
  data: SkillData;
  character: CharacterDef;
  /** skill id -> rank (1-based). */
  owned: Map<string, number>;
  /** skill id -> remaining cooldown ticks. */
  cooldown: Map<string, number>;
  gauge: number;
  /** Disposition axis scores (spec 6.7 / GD 8.1). */
  axis: Record<string, number>;
  /** Region variant key (e.g. `glacier`) or null. */
  variant: string | null;
  env: EffectEnv;
  lastBlocked: number;
  maxEcology: number;
}

const bad = (reason: FailReason, toast: string | null = FAIL_TOAST[reason]): Extract<CanUse, { ok: false }> => ({ ok: false, reason, toast });

function parseRanks(o: Obj, where: string): Rank[] {
  const ranks = arr(o, 'ranks', where).map((r, i) => ({ ops: parseOps(obj(r, `${where}.ranks[${i}]`), `${where}.ranks[${i}]`) }));
  if (ranks.length === 0) fail(where, '"ranks" must not be empty');
  return ranks;
}

function parseSkill(raw: unknown, where: string): SkillDef {
  const o = obj(raw, where);
  const target = oneOf(o, 'target', where, TARGETS);
  const zoneTypes = arr(o, 'zoneTypes', where).map((z) => {
    if (typeof z !== 'string' || (z !== 'all' && !(z in ZONE))) fail(where, `unknown zone type ${String(z)}`);
    return z;
  });
  if (target === 'zone' && zoneTypes.length === 0) fail(where, 'zone skills need zoneTypes');
  const variants: Record<string, SkillVariant> = {};
  if (o.variants !== undefined) {
    for (const [k, v] of Object.entries(obj(o.variants, `${where}.variants`))) {
      const vo = obj(v, `${where}.variants.${k}`);
      variants[k] = {
        ...(vo.icon === undefined ? {} : { icon: str(vo, 'icon', `${where}.variants.${k}`) }),
        ...(vo.i18n === undefined ? {} : { i18n: str(vo, 'i18n', `${where}.variants.${k}`) }),
        ...(vo.ranks === undefined ? {} : { ranks: parseRanks(vo, `${where}.variants.${k}`) }),
      };
    }
  }
  let pump: SkillDef['pump'];
  if (target === 'pump') {
    const p = obj(o.pump, `${where}.pump`);
    pump = { maxConcurrent: num(p, 'maxConcurrent', `${where}.pump`, 1), costPerSec: num(p, 'costPerSec', `${where}.pump`, 0) };
  }
  return {
    id: str(o, 'id', where), owner: str(o, 'owner', where), slot: oneOf(o, 'slot', where, SLOTS),
    axis: o.axis === null ? null : str(o, 'axis', where), target, zoneTypes,
    cooldown: num(o, 'cooldown', where, 0), cost: num(o, 'cost', where, 0), borrowable: o.borrowable === true,
    ranks: parseRanks(o, where), icon: str(o, 'icon', where), i18n: str(o, 'i18n', where), variants, pump,
  };
}

function parseCharacter(raw: unknown, where: string): CharacterDef {
  const o = obj(raw, where);
  const g = obj(o.gauge, `${where}.gauge`);
  const strs = (k: string): string[] => arr(o, k, where).map((s) => (typeof s === 'string' ? s : fail(where, `"${k}" must hold strings`)));
  return {
    id: str(o, 'id', where), i18n: str(o, 'i18n', where), axis: str(o, 'axis', where), skills: strs('skills'), start: strs('start'),
    gauge: { source: oneOf(g, 'source', where, ['blocked', 'ecology']), perUnit: num(g, 'perUnit', where, Number.MIN_VALUE), gain: num(g, 'gain', where, 0) },
  };
}

/**
 * Load and validate all skill data. `read` returns parsed JSON for a path listed in
 * data/index.json (browser: fetch; tests: fs).
 * @example const data = await loadSkillData(async (p) => (await fetch(p)).json());
 */
export async function loadSkillData(read: (path: string) => Promise<unknown>): Promise<SkillData> {
  const index = obj(await read('data/index.json'), 'data/index.json');
  const rawRules = obj(await read(str(index, 'rules', 'data/index.json')), 'rules');
  const ax = obj(rawRules.axis, 'rules.axis');
  const rules: SkillRules = {
    gaugeMax: num(rawRules, 'gaugeMax', 'rules', 1),
    axis: {
      acquire: num(ax, 'acquire', 'rules.axis', 0), rankUp: num(ax, 'rankUp', 'rules.axis', 0), passivePerWave: num(ax, 'passivePerWave', 'rules.axis', 0),
      costOnlyUse: num(ax, 'costOnlyUse', 'rules.axis', 0), cooldownDivisor: num(ax, 'cooldownDivisor', 'rules.axis', Number.MIN_VALUE),
    },
  };
  const characters = new Map<string, CharacterDef>();
  for (const p of arr(index, 'characters', 'data/index.json')) {
    const c = parseCharacter(await read(String(p)), String(p));
    characters.set(c.id, c);
  }
  const skills = new Map<string, SkillDef>();
  for (const p of arr(index, 'skills', 'data/index.json')) {
    const s = parseSkill(await read(String(p)), String(p));
    if (skills.has(s.id)) fail(String(p), `duplicate skill id ${s.id}`);
    skills.set(s.id, s);
  }
  for (const c of characters.values()) {
    for (const id of [...c.skills, ...c.start]) if (!skills.has(id)) fail(`character ${c.id}`, `unknown skill ${id}`);
  }
  return { rules, characters, skills };
}

/**
 * Skill definition resolved for the run's variant (icon, i18n, ranks overridden).
 * @example const { icon } = resolveSkill(rt, 'build-levee');
 */
export function resolveSkill(rt: SkillRuntime, id: string): SkillDef {
  const def = rt.data.skills.get(id);
  if (!def) throw new Error(`unknown skill ${id}`);
  const v = rt.variant === null ? undefined : def.variants[rt.variant];
  return v ? { ...def, ...(v.icon ? { icon: v.icon } : {}), ...(v.i18n ? { i18n: v.i18n } : {}), ...(v.ranks ? { ranks: v.ranks } : {}) } : def;
}

function rankOps(rt: SkillRuntime, def: SkillDef): Op[] {
  const rank = rt.owned.get(def.id) ?? 1;
  return def.ranks[Math.min(rank, def.ranks.length) - 1].ops;
}

/**
 * Create run state: common skills + the character's start skills are owned, passives applied.
 * Start skills give no axis score (they are not picks); `acquireSkill` does.
 * @example const rt = createSkillRuntime(data, 'dike-keeper', state, null);
 */
export function createSkillRuntime(data: SkillData, characterId: string, state: SimState, variant: string | null = null): SkillRuntime {
  const character = data.characters.get(characterId);
  if (!character) throw new Error(`unknown character ${characterId}`);
  const rt: SkillRuntime = {
    data, character, owned: new Map(), cooldown: new Map(), gauge: 0, axis: {}, variant, env: createEffectEnv((z) => state.zones.lines[z] ?? []),
    lastBlocked: state.metrics.blocked, maxEcology: state.metrics.ecology,
  };
  for (const s of data.skills.values()) if (s.slot === 'common') rt.owned.set(s.id, 1);
  for (const id of character.start) {
    rt.owned.set(id, 1);
    applyPassive(rt, state, id);
  }
  return rt;
}

function applyPassive(rt: SkillRuntime, state: SimState, id: string): void {
  const def = resolveSkill(rt, id);
  if (def.slot === 'passive') runOps(state, rt.env, rankOps(rt, def), { zone: -1, cells: [] });
}

const addAxis = (rt: SkillRuntime, def: SkillDef, amount: number): void => {
  if (def.axis !== null && def.slot !== 'common') rt.axis[def.axis] = (rt.axis[def.axis] ?? 0) + amount;
};

/**
 * Gain a new skill at rank 1: axis +acquire, passives take effect (hook for Story 005).
 * @returns false when already owned or unknown.
 * @example acquireSkill(rt, state, 'sandbag');
 */
export function acquireSkill(rt: SkillRuntime, state: SimState, id: string): boolean {
  const def = rt.data.skills.get(id);
  if (!def || rt.owned.has(id)) return false;
  rt.owned.set(id, 1);
  addAxis(rt, def, rt.data.rules.axis.acquire);
  applyPassive(rt, state, id);
  return true;
}

/**
 * Raise a skill one rank: axis +rankUp, passives re-applied (hook for Story 005).
 * @returns false when not owned or at max rank.
 * @example upgradeSkill(rt, state, 'build-levee');
 */
export function upgradeSkill(rt: SkillRuntime, state: SimState, id: string): boolean {
  const def = rt.data.skills.get(id);
  const rank = rt.owned.get(id);
  if (!def || rank === undefined || rank >= def.ranks.length) return false;
  rt.owned.set(id, rank + 1);
  addAxis(rt, def, rt.data.rules.axis.rankUp);
  applyPassive(rt, state, id);
  return true;
}

/**
 * Skills for the bar: owned common skills, then the character's owned actives in slot order.
 * @example for (const def of barSkills(rt)) addButton(def);
 */
export function barSkills(rt: SkillRuntime): SkillDef[] {
  const pick = (slots: readonly string[]): SkillDef[] =>
    [...rt.data.skills.values()].filter((s) => rt.owned.has(s.id) && slots.includes(s.slot)).map((s) => resolveSkill(rt, s.id));
  const own = pick(['basic', 'tactical', 'ultimate']).sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
  return [...pick(['common']), ...own];
}

/** Whether `def` can target zone `zone` of the map (zone type match). */
export function zoneAllowed(def: SkillDef, state: SimState, zone: number): boolean {
  const code = zoneType(state, zone);
  if (def.zoneTypes.includes('all')) return code !== ZONE.none && code !== ZONE.inlet && code !== ZONE.outlet && code !== ZONE.base;
  return def.zoneTypes.some((n) => ZONE[n as keyof typeof ZONE] === code);
}

/**
 * Check whether a skill can be used (spec 6.6). Without `target` it answers for the
 * button (owned, pause, cooldown, gauge, cash, a valid target exists); with a zone or
 * swipe cells it also checks that target. Check order: NOT_OWNED, PAUSED, COOLDOWN,
 * NO_GAUGE, NO_CASH, NO_TARGET_IN_MAP, BAD_TARGET, ALREADY_DONE.
 * @example const r = canUse(rt, state, 'build-levee', { cash, paused }, { zone: 27 });
 */
export function canUse(rt: SkillRuntime, state: SimState, id: string, ctx: UseContext, target?: UseTarget): CanUse {
  const def = rt.data.skills.get(id) && resolveSkill(rt, id);
  if (!def || !rt.owned.has(id) || def.slot === 'passive') return bad('NOT_OWNED');
  if (ctx.paused) return bad('PAUSED');
  if (def.slot === 'ultimate') {
    if (rt.gauge < rt.data.rules.gaugeMax) return bad('NO_GAUGE');
  } else if ((rt.cooldown.get(id) ?? 0) > 0) return bad('COOLDOWN');
  if (ctx.cash < targetCost(rt, state, def, target)) return bad('NO_CASH');
  if (def.target === 'zone') {
    let any = false;
    for (let z = 0; z < state.zones.count && !any; z++) any = zoneAllowed(def, state, z);
    if (!any) return bad('NO_TARGET_IN_MAP');
    if (target?.zone !== undefined) {
      if (target.zone < 0 || target.zone >= state.zones.count || !zoneAllowed(def, state, target.zone)) return bad('BAD_TARGET');
      if (isRedundant(state, rt.env, rankOps(rt, def), target.zone)) return bad('ALREADY_DONE');
    }
  } else if (def.target === 'pump' && state.pumps.length === 0) return bad('NO_TARGET_IN_MAP');
  else if (def.target === 'swipe' && target?.cells !== undefined) {
    const op = rankOps(rt, def).find((o) => o.op === 'tempWallPath');
    if (!op || swipeCells(state, target.cells, op).length === 0) return bad('BAD_TARGET');
  }
  return { ok: true };
}

/** Cash cost of using `def` on the target: re-freezing a melting ice line is cheaper (`refreezeCost`). */
function targetCost(rt: SkillRuntime, state: SimState, def: SkillDef, target?: UseTarget): number {
  const z = target?.zone;
  if (def.target !== 'zone' || z === undefined || z < 0 || z >= state.zones.count) return def.cost;
  return useCost(state, rt.env, rankOps(rt, def), z, def.cost);
}

/**
 * Use a skill: validates with `canUse`, runs the rank's ops, starts the cooldown, resets
 * the gauge for ultimates, and adds the axis score. The caller deducts `spent` from cash.
 * The `pump` skill (button) stops all pumps.
 * @example const r = useSkill(rt, state, 'sandbag', ctx, { cells }); if (r.ok) cash -= r.spent;
 */
export function useSkill(rt: SkillRuntime, state: SimState, id: string, ctx: UseContext, target: UseTarget = {}): UseResult {
  const chk = canUse(rt, state, id, ctx, target);
  if (!chk.ok) return chk;
  const def = resolveSkill(rt, id);
  const spent = targetCost(rt, state, def, target);
  if (def.target === 'pump') for (const p of state.pumps) p.on = false;
  else runOps(state, rt.env, rankOps(rt, def), { zone: target.zone ?? -1, cells: target.cells ?? [] });
  if (def.cooldown > 0) rt.cooldown.set(id, Math.round(def.cooldown * TICKS_PER_SEC));
  if (def.slot === 'ultimate') rt.gauge = 0;
  const ax = rt.data.rules.axis;
  if (def.cooldown > 0) addAxis(rt, def, def.cooldown / ax.cooldownDivisor);
  else if (def.cost > 0) addAxis(rt, def, ax.costOnlyUse);
  return { ok: true, spent };
}

/**
 * Toggle pump `index` (tap on a pump object). Turning off always works; turning on needs
 * not paused, cash > 0 and fewer than `maxConcurrent` running pumps (else BAD_TARGET with
 * the `toast.pumpLimit` toast).
 * @example const r = togglePump(rt, state, 0, ctx);
 */
export function togglePump(rt: SkillRuntime, state: SimState, index: number, ctx: UseContext): CanUse {
  const p = state.pumps[index];
  if (!p) return bad('BAD_TARGET');
  const def = rt.data.skills.get('pump');
  if (!def?.pump || !rt.owned.has('pump')) return bad('NOT_OWNED');
  if (p.on) {
    p.on = false;
    return { ok: true };
  }
  if (ctx.paused) return bad('PAUSED');
  if (ctx.cash <= 0) return bad('NO_CASH');
  if (state.pumps.filter((q) => q.on).length >= def.pump.maxConcurrent) return bad('BAD_TARGET', PUMP_LIMIT_TOAST);
  p.on = true;
  return { ok: true };
}

/**
 * Per-tick pump upkeep: running pumps cost `costPerSec` each; at 0 cash all stop.
 * @returns the new cash.
 * @example cash = pumpUpkeep(rt, state, cash);
 */
export function pumpUpkeep(rt: SkillRuntime, state: SimState, cash: number): number {
  const cost = rt.data.skills.get('pump')?.pump?.costPerSec ?? 0;
  const running = state.pumps.filter((p) => p.on).length;
  if (running === 0) return cash;
  const left = Math.max(0, cash - (running * cost) / TICKS_PER_SEC);
  if (left === 0) for (const p of state.pumps) p.on = false;
  return left;
}

/**
 * Advance one sim tick after `step()`: cooldowns decrease only in the wave phase (spec 6.7),
 * scheduled effects fire, the ultimate gauge charges (spec 4.8).
 * @example advanceSkills(rt, state, phase);
 */
export function advanceSkills(rt: SkillRuntime, state: SimState, phase: 'wave' | 'prep' | 'over'): void {
  if (phase === 'wave') {
    for (const [id, t] of rt.cooldown) if (t > 0) rt.cooldown.set(id, t - 1);
  }
  advanceEffects(state, rt.env);
  const { gauge } = rt.character;
  let gain = 0;
  if (gauge.source === 'blocked') {
    gain = ((state.metrics.blocked - rt.lastBlocked) / gauge.perUnit) * gauge.gain;
    rt.lastBlocked = state.metrics.blocked;
  } else if (state.metrics.ecology > rt.maxEcology) {
    gain = ((state.metrics.ecology - rt.maxEcology) / gauge.perUnit) * gauge.gain;
    rt.maxEcology = state.metrics.ecology;
  }
  if (gain > 0) rt.gauge = Math.min(rt.data.rules.gaugeMax, rt.gauge + gain);
}

/**
 * Wave end hook: revert temporary levee boosts, passives held add axis score.
 * @example onWaveEnd(rt, state);
 */
export function onWaveEnd(rt: SkillRuntime, state: SimState): void {
  endWaveEffects(state, rt.env);
  for (const id of rt.owned.keys()) {
    const def = rt.data.skills.get(id);
    if (def?.slot === 'passive') addAxis(rt, def, rt.data.rules.axis.passivePerWave);
  }
}
