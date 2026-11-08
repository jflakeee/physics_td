import type { SkillView } from '../input/targeting.ts';

/**
 * Skill buttons shown on the play screen until story 003 supplies owned skills from
 * `data/skills/*.json`. Targets follow DETAILED_DESIGN_V2 §6.2.
 */
export const FREEZE: SkillView = { id: 'freeze', slot: 'common', target: 'zone', zoneTypes: [], icon: '🧊', i18n: 'skill.freeze' };

/** 둑지기 Lv1~ actives; the 4th slot stays empty until a level-up card fills it (story 005). */
export const DIKE_KEEPER_ACTIVE: SkillView[] = [
  { id: 'build-levee', slot: 'basic', target: 'zone', zoneTypes: ['plain'], icon: '🧱', i18n: 'skill.buildLevee' },
  { id: 'sandbag', slot: 'tactical', target: 'swipe', zoneTypes: [], icon: '🛍', i18n: 'skill.sandbag' },
  { id: 'night-repair', slot: 'ultimate', target: 'global', zoneTypes: [], icon: '🌙', i18n: 'skill.nightRepair' },
];
