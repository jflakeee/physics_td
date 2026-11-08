import type { Zone, ZoneType } from '../sim/zones.ts';
import type { Hit } from './hit.ts';

/**
 * Target-selection mode (DETAILED_DESIGN_V2 §14.3, GD §9.3).
 * idle: skill tap → none/global runs at once, else `selecting`; pump/gate tap → toggle;
 *       zone tap → its single basic skill runs, otherwise the zone is highlighted.
 * selecting: valid zone → run; invalid tap / same button / wave end → cancel.
 * Ultimates run only from a long press on their button.
 */

export type SkillTarget = 'zone' | 'gate' | 'swipe' | 'global' | 'none';
export type SkillSlot = 'common' | 'passive' | 'basic' | 'tactical' | 'ultimate';

/** What the UI needs to know about a skill. */
export interface SkillView {
  id: string;
  slot: SkillSlot;
  target: SkillTarget;
  /** Allowed zone types; empty = any non-base zone. */
  zoneTypes: ZoneType[];
  icon: string;
  i18n: string;
  /** Extra per-zone check from the rules layer (levee lines, already opened, …). */
  canTarget?: (zoneId: number) => boolean;
}

export type TargetState = { mode: 'idle'; highlight: number } | { mode: 'selecting'; skill: string };

/** Side effects the state machine asks for. */
export type TargetAction =
  | { t: 'use'; skill: string; zone?: number; path?: [number, number][] }
  | { t: 'toggle'; kind: 'pump' | 'gate'; id: number }
  | { t: 'info'; zone: number }
  | { t: 'cancel' }
  | { t: 'needLongPress'; skill: string };

/** Zones a skill may target. */
export function validZone(s: SkillView, z: Zone): boolean {
  if (z.type === 'base') return false;
  if (s.canTarget) return s.canTarget(z.id);
  return s.zoneTypes.length === 0 || s.zoneTypes.includes(z.type);
}

export const IDLE: TargetState = { mode: 'idle', highlight: 0 };

/** Skill button tapped (or long-pressed). */
export function onSkillButton(st: TargetState, s: SkillView, long: boolean): [TargetState, TargetAction | null] {
  if (s.slot === 'ultimate') return long ? [IDLE, { t: 'use', skill: s.id }] : [st, { t: 'needLongPress', skill: s.id }];
  if (st.mode === 'selecting' && st.skill === s.id) return [IDLE, { t: 'cancel' }];
  if (s.target === 'global' || s.target === 'none') return [IDLE, { t: 'use', skill: s.id }];
  return [{ mode: 'selecting', skill: s.id }, null];
}

/** Board tapped on `hit`. `skills` = the player's active skills; `zones` indexed by id − 1. */
export function onBoardTap(st: TargetState, hit: Hit, skills: SkillView[], zones: Zone[]): [TargetState, TargetAction | null] {
  if (st.mode === 'selecting') {
    const s = skills.find(k => k.id === st.skill);
    if (s && hit.t === 'zone' && validZone(s, zones[hit.id - 1])) return [IDLE, { t: 'use', skill: s.id, zone: hit.id }];
    if (s && hit.t === 'gate' && s.target === 'gate') return [IDLE, { t: 'use', skill: s.id, zone: hit.id }];
    return [IDLE, { t: 'cancel' }];
  }
  if (hit.t === 'pump' || hit.t === 'gate') return [IDLE, { t: 'toggle', kind: hit.t, id: hit.id }];
  if (hit.t === 'zone') {
    const z = zones[hit.id - 1];
    const basics = skills.filter(k => k.slot === 'basic' && k.target === 'zone' && validZone(k, z));
    if (basics.length === 1) return [{ mode: 'idle', highlight: hit.id }, { t: 'use', skill: basics[0].id, zone: hit.id }];
    return [{ mode: 'idle', highlight: hit.id }, { t: 'info', zone: hit.id }];
  }
  return [IDLE, null];
}

/** Board swiped along `cells`: runs a selected swipe skill, otherwise ignored. */
export function onBoardSwipe(st: TargetState, cells: [number, number][], skills: SkillView[]): [TargetState, TargetAction | null] {
  if (st.mode !== 'selecting') return [st, null];
  const s = skills.find(k => k.id === st.skill);
  if (s?.target === 'swipe' && cells.length > 0) return [IDLE, { t: 'use', skill: s.id, path: cells }];
  return [IDLE, { t: 'cancel' }];
}

/** Which zones to draw bright for the current state (Uint8 per zone id, 1 = bright). */
export function brightZones(st: TargetState, skills: SkillView[], zones: Zone[]): Set<number> | null {
  if (st.mode !== 'selecting') return null;
  const s = skills.find(k => k.id === st.skill);
  const out = new Set<number>();
  if (s && s.target === 'zone') for (const z of zones) if (validZone(s, z)) out.add(z.id);
  return out;
}
