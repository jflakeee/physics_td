import type { SkillView } from '../input/targeting.ts';
import type { RulesState } from '../rules/skills.ts';
import { regional, zoneTargetable } from '../rules/skills.ts';
import type { SkillDef } from '../rules/types.ts';

/**
 * Skill buttons from the rules state: common skills with a button (freeze), then owned
 * actives in slot order (basic, tactical, ultimate), regional presentation applied.
 */
const ORDER: Record<string, number> = { basic: 0, tactical: 1, ultimate: 2 };

export function viewOf(def: SkillDef, rs: RulesState): SkillView {
  const r = regional(def, rs.region);
  return {
    id: def.id, slot: def.slot, target: def.target === 'pump' ? 'none' : def.target, zoneTypes: def.zoneTypes,
    icon: r.icon, i18n: r.i18n, canTarget: z => zoneTargetable(rs, def.id, z),
  };
}

/** [common buttons, active buttons (max 4)]. */
export function skillViews(rs: RulesState): [SkillView[], SkillView[]] {
  const common = [...rs.defs.values()].filter(d => d.slot === 'common' && d.target === 'zone').map(d => viewOf(d, rs));
  const active = rs.owned
    .map(o => rs.defs.get(o.id)!)
    .filter(d => d.slot !== 'passive' && d.slot !== 'common')
    .sort((a, b) => ORDER[a.slot] - ORDER[b.slot])
    .slice(0, 4)
    .map(d => viewOf(d, rs));
  return [common, active];
}
