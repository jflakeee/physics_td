import type { SimWorld } from '../core/types.ts';
import type { LoadedMap } from '../game/map.ts';
import type { Zone, ZoneType } from '../sim/zones.ts';
import { applyOp, tickConversions } from './effects.ts';
import type { Axis, CharacterDef, EconomyDef, ModKey, Op, Refusal, SkillDef } from './types.ts';

/**
 * Skill system (DETAILED_DESIGN_V2 §6, GD §5, §8.1, §15). No DOM.
 * - Cooldowns are ticks and only fall during wave ticks (§6.7).
 * - Gauge: own character only; 100 = ready, using the ultimate resets it to 0.
 * - Axes: gain +3, rank up +1, active use +cooldown/10 (cost-type / ultimate +1),
 *   each owned passive +1 per wave end.
 */

export interface OwnedSkill { id: string; rank: number; borrowed: boolean; cd: number; }

export interface ZoneRuntime { opened: boolean; convertTtl: number; convertTo?: ZoneType; convertDh: number; }

export interface RulesState {
  map: LoadedMap;
  world: SimWorld;
  defs: ReadonlyMap<string, SkillDef>;
  char: CharacterDef;
  eco: EconomyDef;
  region: string;
  owned: OwnedSkill[];
  /** Cooldowns (ticks) of common skills, which occupy no slot. */
  commonCd: Record<string, number>;
  gauge: number;
  axes: Record<Axis, number>;
  zones: ZoneRuntime[];
  builtLines: Set<number>;
  baseMods: Record<ModKey, number>;
  timedMods: { key: ModKey; value: number; mode: 'set' | 'mul' | 'add'; ttl: number }[];
  /** Night-repair height to undo at wave end: [cell, added]. */
  waveRestore: [number, number][];
  /** Sum of depth over field cells this wave, per zone (field income). */
  fieldDepth: number[];
  waveTicks: number;
  lastBlocked: number;
  lastEcoBest: number;
  /** Set when a zone's type or height changed (terrain layer must redraw). */
  zoneChanged: boolean;
  phaseIsWave(): boolean;
  refreshMods(): void;
}

const MOD_DEFAULT: Record<ModKey, number> = { wallDurabilityMul: 1, absorbMul: 0 };

/** Create rules state for a run and grant the character's starting skills. */
export function createRules(map: LoadedMap, defs: readonly SkillDef[], char: CharacterDef, eco: EconomyDef, isWave: () => boolean, start = char.start): RulesState {
  const world = map.world;
  const rs: RulesState = {
    map, world, defs: new Map(defs.map(d => [d.id, d])), char, eco, region: map.data.region ?? 'river',
    owned: [], commonCd: {}, gauge: 0, axes: { safety: 0, conquest: 0, harmony: 0, harvest: 0 },
    zones: map.zones.zones.map(() => ({ opened: false, convertTtl: 0, convertDh: 0 })),
    builtLines: new Set(), baseMods: { ...MOD_DEFAULT }, timedMods: [], waveRestore: [],
    fieldDepth: map.zones.zones.map(() => 0), waveTicks: 0,
    lastBlocked: world.metrics.blocked, lastEcoBest: world.metrics.ecologyBest, zoneChanged: false,
    phaseIsWave: isWave,
    refreshMods() {
      const m = { ...rs.baseMods };
      for (const t of rs.timedMods) m[t.key] = t.mode === 'set' ? t.value : t.mode === 'mul' ? m[t.key] * t.value : m[t.key] + t.value;
      world.mods.wallDurabilityMul = m.wallDurabilityMul;
      world.mods.absorbMul = m.absorbMul;
    },
  };
  applyPumpParams(rs);
  for (const id of start) grant(rs, id);
  return rs;
}

/** Pump numbers come from `data/skills/pump.json` (GD §3.0 / §5.1). */
function applyPumpParams(rs: RulesState): void {
  const p = rs.defs.get('pump')?.params;
  if (!p) return;
  const cfg = rs.world.cfg;
  cfg.pumpCashPerTick = p.costPerSecond / cfg.tps;
  cfg.pumpRadius = p.radius; cfg.pumpRate = p.ratePerCell; cfg.pumpCapFrac = p.capFrac; cfg.pumpMaxOn = p.maxOn;
}

/** Skill def with the map region's overrides applied (icon, i18n, ops). */
export function regional(def: SkillDef, region: string): SkillDef {
  const r = def.regions?.[region];
  return r ? { ...def, icon: r.icon ?? def.icon, i18n: r.i18n ?? def.i18n, ranks: r.ranks ?? def.ranks } : def;
}

/** Add a skill (or rank it up). Passives apply their modifiers at once. */
export function grant(rs: RulesState, id: string, borrowed = false): void {
  const def = rs.defs.get(id);
  if (!def) throw new Error(`unknown skill ${id}`);
  const have = rs.owned.find(o => o.id === id);
  if (have) { have.rank = Math.min(def.ranks.length, have.rank + 1); if (def.axis) rs.axes[def.axis] += rs.eco.axisOnRankUp; }
  else { rs.owned.push({ id, rank: 1, borrowed, cd: 0 }); if (def.axis) rs.axes[def.axis] += rs.eco.axisOnGain; }
  if (def.slot === 'passive') runOps(rs, ops(rs, def, rankOf(rs, id)), {});
}

const rankOf = (rs: RulesState, id: string) => rs.owned.find(o => o.id === id)?.rank ?? 1;
const ops = (rs: RulesState, def: SkillDef, rank: number): Op[] => regional(def, rs.region).ranks[Math.min(rank, def.ranks.length) - 1].ops;
function runOps(rs: RulesState, list: Op[], t: { zone?: Zone; path?: [number, number][] }): boolean {
  let any = false;
  for (const op of list) any = applyOp(op, { rs, world: rs.world, zone: t.zone, path: t.path }) || any;
  return any;
}

/** Is any zone of the map a valid target for `def`? */
function mapHasTarget(rs: RulesState, def: SkillDef): boolean {
  return rs.map.zones.zones.some(z => zoneOk(rs, def, z) === null);
}

/** Zone-level validity: type match plus the skill's `needs`. */
function zoneOk(rs: RulesState, def: SkillDef, z: Zone): Refusal | null {
  if (z.type === 'base') return 'BAD_TARGET';
  if (def.zoneTypes.length && !def.zoneTypes.includes(z.type)) return 'BAD_TARGET';
  const st = rs.zones[z.id - 1];
  if (def.needs === 'leveeLine' && rs.map.leveeLines[z.id - 1].length === 0) return 'BAD_TARGET';
  if (def.needs === 'notOpened' && st.opened) return 'ALREADY_DONE';
  if (def.needs === 'notConverting' && st.convertTtl > 0) return 'ALREADY_DONE';
  return null;
}

/** Can the target of `def` be this zone? (for target highlighting) */
export function zoneTargetable(rs: RulesState, id: string, zoneId: number): boolean {
  const def = rs.defs.get(id);
  return !!def && zoneOk(rs, def, rs.map.zones.zones[zoneId - 1]) === null;
}

/**
 * Validate a use (§6.6). Order: NOT_OWNED → PAUSED → COOLDOWN → NO_GAUGE → NO_CASH →
 * NO_TARGET_IN_MAP → BAD_TARGET / ALREADY_DONE. `zone` omitted = button-level check.
 */
export function canUse(rs: RulesState, id: string, paused: boolean, zone?: number, path?: [number, number][]): Refusal | null {
  const def = rs.defs.get(id);
  const own = rs.owned.find(o => o.id === id);
  if (!def || (!own && def.slot !== 'common')) return 'NOT_OWNED';
  if (paused) return 'PAUSED';
  if (cdOf(rs, id) > 0) return 'COOLDOWN';
  if (def.slot === 'ultimate' && rs.gauge < rs.eco.gaugeMax) return 'NO_GAUGE';
  const cash = rs.world.cash;
  if (def.cost > 0 && cash !== null && cash < def.cost) return 'NO_CASH';
  if (def.target === 'zone') {
    if (!mapHasTarget(rs, def)) return 'NO_TARGET_IN_MAP';
    if (zone !== undefined) {
      const z = rs.map.zones.zones[zone - 1];
      if (!z) return 'BAD_TARGET';
      const r = zoneOk(rs, def, z);
      if (r) return r;
    }
  }
  if (def.target === 'swipe' && path !== undefined && path.length === 0) return 'BAD_TARGET';
  return null;
}

function cdOf(rs: RulesState, id: string): number {
  return rs.owned.find(o => o.id === id)?.cd ?? rs.commonCd[id] ?? 0;
}
function setCd(rs: RulesState, id: string, v: number): void {
  const own = rs.owned.find(o => o.id === id);
  if (own) own.cd = v; else rs.commonCd[id] = v;
}

/** Remaining cooldown in ticks (UI). */
export function cooldownTicks(rs: RulesState, id: string): number { return cdOf(rs, id); }

/** Use a skill. Returns a refusal or null after applying effects, cost, cooldown, axis, gauge. */
export function useSkill(rs: RulesState, id: string, paused: boolean, zone?: number, path?: [number, number][]): Refusal | null {
  const r = canUse(rs, id, paused, zone, path);
  if (r) return r;
  const def = rs.defs.get(id)!;
  const z = zone !== undefined ? rs.map.zones.zones[zone - 1] : undefined;
  if (!runOps(rs, ops(rs, def, rankOf(rs, id)), { zone: z, path })) return 'BAD_TARGET';
  if (def.cost > 0 && rs.world.cash !== null) rs.world.cash -= def.cost;
  if (def.cooldown > 0) setCd(rs, id, Math.round(def.cooldown * rs.world.cfg.tps));
  if (def.slot === 'ultimate') rs.gauge = 0;
  if (def.axis) rs.axes[def.axis] += def.cooldown > 0 ? def.cooldown / rs.eco.axisCooldownDiv : rs.eco.axisPerCostUse;
  return null;
}

/** Per wave tick (after the sim step): cooldowns, timed modifiers, conversions, gauge, field depth. */
export function rulesTick(rs: RulesState): void {
  for (const o of rs.owned) if (o.cd > 0) o.cd--;
  for (const k in rs.commonCd) if (rs.commonCd[k] > 0) rs.commonCd[k]--;
  if (rs.timedMods.length) {
    for (const t of rs.timedMods) t.ttl--;
    const n = rs.timedMods.length;
    rs.timedMods = rs.timedMods.filter(t => t.ttl > 0);
    if (rs.timedMods.length !== n) rs.refreshMods();
  }
  tickConversions(rs, rs.world);
  const m = rs.world.metrics, g = rs.char.gauge;
  const gain = g.source === 'blocked' ? (m.blocked - rs.lastBlocked) * g.per : (m.ecologyBest - rs.lastEcoBest) * g.per;
  rs.lastBlocked = m.blocked; rs.lastEcoBest = m.ecologyBest;
  if (gain > 0) rs.gauge = Math.min(rs.eco.gaugeMax, rs.gauge + gain);
  const w = rs.world.grid.w;
  rs.map.zones.zones.forEach((z, k) => {
    if (z.type !== 'field') return;
    let s = 0; for (const c of z.cells) s += w[c];
    rs.fieldDepth[k] += s / z.cells.length;
  });
  rs.waveTicks++;
}

/** Wave start: reset per-wave tallies. */
export function rulesWaveStart(rs: RulesState): void {
  rs.fieldDepth.fill(0); rs.waveTicks = 0;
}

/**
 * Wave end (§10 wave → prepare): income (clear + intact fields), passive axis +1,
 * undo night-repair heights. Returns the cash earned.
 */
export function rulesWaveEnd(rs: RulesState): number {
  let income = rs.eco.waveClear;
  rs.map.zones.zones.forEach((z, k) => {
    if (z.type !== 'field' || rs.zones[k].opened) return;
    const avg = rs.waveTicks ? rs.fieldDepth[k] / rs.waveTicks : 0;
    if (avg < rs.eco.fieldFloodDepth) income += rs.eco.fieldIncome;
  });
  if (rs.world.cash !== null) rs.world.cash += income;
  for (const o of rs.owned) {
    const d = rs.defs.get(o.id)!;
    if (d.slot === 'passive' && d.axis) rs.axes[d.axis] += rs.eco.axisPerPassiveWave;
  }
  const g = rs.world.grid;
  for (const [c, add] of rs.waveRestore) if (g.wall[c] > 0) g.wall[c] = Math.max(0, g.wall[c] - add);
  rs.waveRestore.length = 0;
  return income;
}
