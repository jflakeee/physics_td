import type { RulesState } from './skills.ts';
import { applyOps } from './skills.ts';
import type { FusionDef } from './types.ts';

/**
 * Fusions (DETAILED §7.4): when the owned skills include a fusion's `requires`, it fires once
 * and is recorded. Returns the ids that fired now.
 */
export function checkFusions(rs: RulesState, defs: readonly FusionDef[]): string[] {
  const owned = new Set(rs.owned.map(o => o.id));
  const fired: string[] = [];
  for (const f of defs) {
    if (rs.fusions.includes(f.id) || !f.requires.every(r => owned.has(r))) continue;
    applyOps(rs, f.ops);
    rs.fusions.push(f.id);
    fired.push(f.id);
  }
  return fired;
}

/** The unfired fusion a skill would complete given the current owned set, or null. */
export function completes(rs: RulesState, defs: readonly FusionDef[], skillId: string): string | null {
  const owned = new Set(rs.owned.map(o => o.id));
  owned.add(skillId);
  for (const f of defs) if (!rs.fusions.includes(f.id) && f.requires.includes(skillId) && f.requires.every(r => owned.has(r))) return f.id;
  return null;
}

/** An unfired fusion this skill is an ingredient of (not owned yet), or null. */
export function ingredientOf(rs: RulesState, defs: readonly FusionDef[], skillId: string): string | null {
  if (rs.owned.some(o => o.id === skillId)) return null;
  for (const f of defs) if (!rs.fusions.includes(f.id) && f.requires.includes(skillId)) return f.id;
  return null;
}
