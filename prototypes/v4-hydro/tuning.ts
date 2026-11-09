/** V4 hydro prototype numbers (docs/REDESIGN_V4_HYDRO.md). Prototype: one place to tune. */
export const T = {
  tps: 30,
  K: 0.2,
  /** Water entering at the top per tick at weather ×1. */
  baseInflow: 0.07,
  /** Power per tick = powerScale · η · Q · H · (1 − drown). */
  powerScale: 6,
  eta: 0.8,
  /** River depth where a turbine starts to drown, and where it is fully under. */
  drownFrom: 0.5, drownTo: 0.8,
  /** Plant health lost per tick while drowning (fully under = 1). 0 → broken. */
  plantWear: 1 / (30 * 25),
  repairCost: 30,
  /** Village demand in power per second (+demandGrow each second: the village grows); coins per second while met. */
  demand: 2.4, demandGrow: 0.025, coinPerSec: 2,
  /** Seconds of blackout before a heart is lost. */
  blackoutSeconds: 8,
  /** Water in the village cells that costs a heart; at most one flood heart per cooldown. */
  villageFloodLimit: 6, floodCooldownSeconds: 12,
  /** Villagers pump flood water out of each village cell per tick (it leaves the board). */
  villagePump: 0.00005,
  hearts: 3,
  startCoins: 80,
  cost: { wheel: 60, reservoir: 70, wall: 40 },
  /** XP needed for level L → L+1: xpBase · xpGrowth^(L−1). */
  xpBase: 120, xpGrowth: 1.3,
  /** Seconds before a weather change that the forecast shows it. */
  forecastSeconds: 12,
  /** Bottom edge drains whatever reaches it. */
  outletRate: 0.6,
  /** Auto skills (Lv 1..5). */
  sand: { every: [14, 12, 10, 8, 6], cells: [8, 10, 12, 14, 16], height: 0.45, seconds: 22 },
  ice: { every: [16, 14, 12, 10, 8], frac: [0.35, 0.42, 0.5, 0.58, 0.66], cells: [30, 40, 50, 60, 70], droughtMelt: 0.004 },
  iceMelt: 0.0008,
  /** Bonus spirits unlocked by clearing stages (Lv 1..5). Rain adds water from the sky in a drought;
   *  sun evaporates flood water off the river in high water (it leaves the board as vapour). */
  rain: { every: [12, 11, 10, 9, 8], amount: [6, 8, 10, 12, 14] },
  sun: { every: [12, 11, 10, 9, 8], amount: [4, 6, 8, 10, 12] },
  /** Look-ahead used by the spirits and the recommended build spot. */
  horizon: 90,
} as const;

/**
 * Weather by season: from second `t`, inflow is multiplied by `mul` (linear ramp over `ramp` s).
 * `freeze` (winter) turns that much river water to ice per cell per tick and stops melting.
 */
export interface Weather { t: number; mul: number; kind: 'clear' | 'rain' | 'drought' | 'thaw' | 'storm' | 'freeze'; ramp?: number; boss?: boolean; freeze?: number }
export interface Season { name: string; seconds: number; weather: Weather[] }
const SPRING: Season = { name: '봄', seconds: 120, weather: [
    { t: 0, mul: 1, kind: 'clear' },
    { t: 28, mul: 1.8, kind: 'thaw', ramp: 10 },
    { t: 55, mul: 1, kind: 'clear', ramp: 6 },
    { t: 72, mul: 0.3, kind: 'drought', ramp: 4 },
    { t: 98, mul: 2.6, kind: 'thaw', ramp: 6, boss: true },
] };
const SUMMER: Season = { name: '여름', seconds: 120, weather: [
    { t: 0, mul: 1, kind: 'clear', ramp: 6 },
    { t: 18, mul: 2.3, kind: 'rain', ramp: 4 },
    { t: 42, mul: 0.25, kind: 'drought', ramp: 4 },
    { t: 70, mul: 1, kind: 'clear', ramp: 4 },
    { t: 88, mul: 3.2, kind: 'storm', ramp: 4, boss: true },
] };
const AUTUMN: Season = { name: '가을', seconds: 120, weather: [
  { t: 0, mul: 0.9, kind: 'clear', ramp: 6 },
  { t: 16, mul: 0.25, kind: 'drought', ramp: 6 },
  { t: 50, mul: 1.8, kind: 'rain', ramp: 4 },
  { t: 72, mul: 0.6, kind: 'clear', ramp: 6 },
  { t: 90, mul: 3.0, kind: 'storm', ramp: 4, boss: true },
] };
const WINTER: Season = { name: '겨울', seconds: 120, weather: [
  { t: 0, mul: 0.8, kind: 'clear', ramp: 6 },
  { t: 14, mul: 0.6, kind: 'freeze', ramp: 6, freeze: 0.0016 },
  { t: 46, mul: 1.6, kind: 'thaw', ramp: 6 },
  { t: 66, mul: 0.5, kind: 'freeze', ramp: 4, freeze: 0.0024 },
  { t: 92, mul: 0.35, kind: 'freeze', ramp: 4, freeze: 0.0032, boss: true },
] };
/** Stage 1 seasons (kept for code that has no stage in hand). */
export const SEASONS: Season[] = [SPRING, SUMMER];

export type CardId = 'sand' | 'ice' | 'eta' | 'tough' | 'coins' | 'cheap' | 'rain' | 'sun';
export type CharId = 'miller' | 'granny' | 'frost';
export type PowerupId = 'turbine' | 'purse' | 'builder' | 'heart';

/** Stages: two seasons each. Clearing one unlocks its bonus skill (a new level-up card) and character. */
export interface Stage { id: string; name: string; seasons: Season[]; demandMul: number; bonusSkill: CardId | null; unlockChar: CharId | null }
export const STAGES: Stage[] = [
  { id: 'valley-1', name: '작은 계곡', seasons: [SPRING, SUMMER], demandMul: 1, bonusSkill: 'rain', unlockChar: 'granny' },
  { id: 'valley-2', name: '가을 계곡', seasons: [SUMMER, AUTUMN], demandMul: 1.15, bonusSkill: 'sun', unlockChar: 'frost' },
  { id: 'valley-3', name: '겨울 계곡', seasons: [AUTUMN, WINTER], demandMul: 1.3, bonusSkill: null, unlockChar: null },
];

/** Characters (pick one per run). Their start bonus applies on top of the power-ups. */
export interface CharDef { id: CharId; name: string; desc: string; eta: number; startSkill: CardId | null; costMul: { wheel: number; reservoir: number; wall: number } }
export const CHARS: CharDef[] = [
  { id: 'miller', name: '물레방아 장인', desc: '물레방아 전기 +10%', eta: 0.1, startSkill: null, costMul: { wheel: 1, reservoir: 1, wall: 1 } },
  { id: 'granny', name: '둑 쌓는 할머니', desc: '모래 정령과 시작 · 둑 25% 싸게', eta: 0, startSkill: 'sand', costMul: { wheel: 1, reservoir: 1, wall: 0.75 } },
  { id: 'frost', name: '얼음 마법사', desc: '얼음 정령과 시작 · 저수지 25% 싸게', eta: 0, startSkill: 'ice', costMul: { wheel: 1, reservoir: 0.75, wall: 1 } },
];

/** Power-ups bought with gems between runs (permanent). `cost[r]` buys rank r+1. */
export interface PowerupDef { id: PowerupId; name: string; desc: string; cost: number[] }
export const POWERUPS: PowerupDef[] = [
  { id: 'turbine', name: '튼튼한 터빈', desc: '전기 +5% (단계마다)', cost: [30, 60, 90] },
  { id: 'purse', name: '코인 주머니', desc: '시작 코인 +20 (단계마다)', cost: [20, 40, 60] },
  { id: 'builder', name: '일꾼 연장', desc: '짓는 값 -5% (단계마다)', cost: [25, 50, 75] },
  { id: 'heart', name: '마을 수호', desc: '하트 +1', cost: [120] },
];
/** Gems earned per run: power made / gemPerPower, plus per star on a clear. */
export const GEMS = { perPower: 60, perStar: 15 } as const;
