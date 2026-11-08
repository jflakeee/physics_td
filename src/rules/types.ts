import type { ZoneType } from '../sim/zones.ts';

/** Skill and character data shapes (DETAILED_DESIGN_V2 §6.1). */
export type Axis = 'safety' | 'conquest' | 'harmony' | 'harvest';
export type Slot = 'common' | 'passive' | 'basic' | 'tactical' | 'ultimate';
export type Target = 'zone' | 'pump' | 'swipe' | 'global' | 'none';

export type Op =
  | { op: 'buildLevee'; height: number; raise: number; cap: number }
  | { op: 'iceLevee'; height: number }
  | { op: 'tempWallPath'; height: number; ttlSec: number; maxCells: number; width: number; keepOut: number }
  | { op: 'repairAll'; addHeight: number }
  | { op: 'lowerZone'; dh: number }
  | { op: 'convertZone'; to: ZoneType; ttlSec: number; dh: number }
  | { op: 'modifier'; key: ModKey; value: number; mode: 'set' | 'mul' | 'add'; ttlSec?: number }
  | { op: 'freezeZone'; ratio: number }
  | { op: 'iceWall'; height: number; fallbackRatio: number };

export type ModKey = 'wallDurabilityMul' | 'absorbMul' | 'greenLevee';

export interface RankDef { ops: Op[]; }

export interface SkillDef {
  id: string;
  owner: string;
  slot: Slot;
  axis: Axis | null;
  target: Target;
  zoneTypes: ZoneType[];
  /** Seconds (converted to ticks at runtime). */
  cooldown: number;
  cost: number;
  borrowable: boolean;
  /** Extra target requirement checked by `canUse`. */
  needs?: 'leveeLine' | 'notOpened' | 'notConverting';
  params?: Record<string, number>;
  ranks: RankDef[];
  icon: string;
  i18n: string;
  /** Regional presentation (and optionally ops) overrides, e.g. glacier → 얼음 둑. */
  regions?: Record<string, { icon?: string; i18n?: string; ranks?: RankDef[] }>;
}

export interface CharacterDef {
  id: string;
  axis: Axis;
  color: string;
  icon: string;
  i18n: string;
  skills: { passive: string; basic: string; tactical: string; ultimate: string };
  start: string[];
  gauge: { source: 'blocked' | 'ecologyBest'; per: number };
  /** Map styles where this character is the 정석 (home) pick (GD §4.2). */
  homeStyles: string[];
}

/** A fusion (DETAILED §7.4). */
export interface FusionDef { id: string; requires: string[]; ops: Op[]; hidden: boolean; icon: string; i18n: string; }

export interface EconomyDef {
  waveClear: number; fieldIncome: number; fieldFloodDepth: number;
  axisOnGain: number; axisOnRankUp: number; axisPerPassiveWave: number; axisPerCostUse: number; axisCooldownDiv: number;
  gaugeMax: number;
  score: { drainedPer: number; noDamageWave: number; blockedPer: number; ecologyPer: number; waveClear: number };
  xp: { base: number; growth: number; lateLevelScore: number };
  draft: {
    rarity: { common: number; rare: number; legendary: number }; skipCash: number; rerolls: number; fusionCeiling: number;
    homeWeight: number; spike: { tactical: number; ultimate: number }; rareRankGain: number; rareNewRank: number;
  };
  substitutes: { supply: { cash: number }; repair: { hp: number; maxHp: number }; maintenance: { commonCdMul: number; maxStacks: number } };
}

/** Why a skill can't be used (§6.6). */
export type Refusal = 'NOT_OWNED' | 'COOLDOWN' | 'NO_CASH' | 'NO_GAUGE' | 'BAD_TARGET' | 'NO_TARGET_IN_MAP' | 'PAUSED' | 'ALREADY_DONE';

/** Toast key per refusal (`NOT_OWNED` has no button, so no toast). */
export const REFUSAL_TOAST: Readonly<Record<Refusal, string | null>> = Object.freeze({
  NOT_OWNED: null, COOLDOWN: 'toast.cooldown', NO_CASH: 'toast.noCash', NO_GAUGE: 'toast.noGauge',
  BAD_TARGET: 'toast.badTarget', NO_TARGET_IN_MAP: 'toast.noTargetInMap', PAUSED: 'toast.paused', ALREADY_DONE: 'toast.alreadyDone',
});
