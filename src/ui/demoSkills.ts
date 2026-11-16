import type { SimState } from '../core/types.ts';
import { LEVEE_HEIGHTS, SANDBAG_HEIGHT, TICKS_PER_SEC, ZONE } from '../sim/constants.ts';
import { freezeCells } from '../sim/ice.ts';
import { buildLevee, placeTempWall } from '../sim/structures.ts';
import { isSelectableType, zoneCells, zoneCenterCell, zoneOfCell, zonePerimeter, zoneType } from '../input/hit.ts';
import type { TargetSkill } from '../input/targeting.ts';
import type { SkillButtonSpec } from './widgets/skillBar.ts';

/**
 * PLACEHOLDER skill slots for Story 002 (targeting demo only). Story 003 replaces this
 * file with data/skills/*.json + rules/effects.ts; costs, cooldowns and gauges are not
 * modelled here. Each slot calls a sim function that already exists.
 */
export interface DemoSkill extends TargetSkill, SkillButtonSpec {
  /** Whether the skill may target this zone right now. */
  canTarget(state: SimState, zone: number): boolean;
  /** Apply the placeholder effect (zone = -1 for global skills). */
  apply(state: SimState, zone: number): void;
}

/** Placeholder magnitudes (Story 003 moves them to skill data). */
const DEMO_FREEZE_THICKNESS = 0.3;
const DEMO_SANDBAG_SEC = 8;

const LAND = new Set<number>([ZONE.plain, ZONE.forest, ZONE.hill, ZONE.field, ZONE.wetland, ZONE.reservoir]);
const isLand = (s: SimState, z: number): boolean => LAND.has(zoneType(s.grid, z));

/** The five demo slots: 2 common (48px) + basic, tactical, ultimate (56px). */
export const DEMO_SKILLS: readonly DemoSkill[] = [
  {
    id: 'pump', i18n: 'skill.pump', icon: '⚙', size: 48, target: 'zone', ultimate: false,
    canTarget: (s, z) => isLand(s, z) && !s.pumps.some((p) => zoneOfCell(p.cell) === z),
    apply(s, z) {
      s.pumps.push({ id: s.pumps.reduce((m, p) => Math.max(m, p.id), 0) + 1, cell: zoneCenterCell(z), on: true });
    },
  },
  {
    id: 'freeze', i18n: 'skill.freeze', icon: '❄', size: 48, target: 'zone', ultimate: false,
    canTarget: (s, z) => isSelectableType(zoneType(s.grid, z)) && zoneType(s.grid, z) !== ZONE.base,
    apply(s, z) {
      freezeCells(s.grid, zoneCells(z), DEMO_FREEZE_THICKNESS);
    },
  },
  {
    id: 'build-levee', i18n: 'skill.buildLevee', icon: '\u{1F9F1}', size: 56, target: 'zone', ultimate: false,
    canTarget: (s, z) => zoneType(s.grid, z) === ZONE.plain,
    apply(s, z) {
      buildLevee(s.grid, zonePerimeter(z), LEVEE_HEIGHTS[0]);
    },
  },
  {
    id: 'sandbag', i18n: 'skill.sandbag', icon: '\u{1F45C}', size: 56, target: 'zone', ultimate: false,
    canTarget: isLand,
    apply(s, z) {
      placeTempWall(s.grid, zonePerimeter(z), SANDBAG_HEIGHT, DEMO_SANDBAG_SEC * TICKS_PER_SEC);
    },
  },
  {
    id: 'night-repair', i18n: 'skill.nightRepair', icon: '\u{1F319}', size: 56, target: 'global', ultimate: true,
    canTarget: () => true,
    apply(s) {
      const g = s.grid;
      for (let i = 0; i < g.wall.length; i++) if (g.wall[i] > 0) buildLevee(g, [i], g.wall[i]);
    },
  },
];

