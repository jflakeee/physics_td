/**
 * V3 kids prototype tuning (docs/REDESIGN_V3_KIDS.md §3–§5). Throwaway prototype:
 * every gameplay number lives here so playtests can change it in one place.
 */
export const TUNING = {
  tps: 30,
  K: 0.2,
  /** Map: 64×96, water enters at the top, the fence crosses the board above the village. */
  fenceRow: 82,
  fenceHeight: 0.5,
  /** Fence durability lost per tick per unit of water pressure (depth against it). */
  fenceWear: 0.0016,
  /** Between waves every fence cell regains this much durability (collapsed cells too). */
  fenceRepair: 0.35,
  /** Water that reaches the village rows; above this the village is flooded (defeat). */
  villageLimit: 40,
  /** Side rivers (outlets) on both edges between these rows. */
  outletRows: [28, 72] as const,
  outletRate: 0.08,
  riverDepth: 1.0,
  /** Waves: total water and length in seconds; water arrives during the first `inflowFrac`. */
  waves: [
    { water: 220, seconds: 30 },
    { water: 340, seconds: 35 },
    { water: 480, seconds: 40 },
  ],
  inflowFrac: 0.8,
  /** Warning before each wave (clouds flash), seconds. */
  warnSeconds: 3,
  /** Player walls wear slower than the fence. */
  wallWear: 0.0008,
  /** Sand: each cell holds up to `sandCap` water (porosity × bed depth), soaking `sandRate` per tick. */
  sandCap: 1.0,
  sandRate: 0.01,
  sandRaise: 0.1,
  /** Ultimate gauge fills in this many seconds of wave time. */
  ultSeconds: 45,
  /** Playable band for skills (rows), above the fence. */
  aimRows: [4, 78] as const,
} as const;

/** Skill numbers per star level (index 0 = ★1). */
export const SKILL_LEVELS = {
  wall: { cells: [16, 22, 30], height: [0.4, 0.5, 0.6], cd: 5 },
  sand: { radius: [3, 4, 5], cd: 8 },
  dig: { cells: [18, 26, 34], depth: [0.35, 0.45, 0.55], cd: 5 },
  basin: { radius: [4, 5, 6], depth: [0.7, 0.85, 1.0], cd: 10 },
  fenceUlt: { raise: 0.2 },
  canalUlt: { depth: 0.5 },
} as const;
