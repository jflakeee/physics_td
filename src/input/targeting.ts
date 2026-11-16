import type { Hit } from './hit.ts';

/** What the targeting state machine needs to know about a skill. */
export interface TargetSkill {
  id: string;
  /** `zone`: pick a zone on the board; `global`: runs without a target. */
  target: 'zone' | 'global';
  /** Ultimates run only on a button long press (spec 14.3). */
  ultimate: boolean;
}

/** `skill === null` is idle; otherwise selecting a target for `skill`. `zone` = highlighted zone (-1 none). */
export interface TargetingState {
  skill: TargetSkill | null;
  zone: number;
}

/** Outcome of an input event; the screen turns it into commands, toasts and haptics. */
export type TargetEvent =
  | { t: 'select'; zone: number }
  | { t: 'deselect' }
  | { t: 'arm'; skill: TargetSkill }
  | { t: 'cancel' }
  | { t: 'run'; skill: TargetSkill; zone: number }
  | { t: 'toggle'; pump: number }
  | { t: 'gate'; gate: number }
  | { t: 'needLongPress'; skill: TargetSkill };

/**
 * Fresh idle targeting state.
 * @example const tg = createTargeting();
 */
export function createTargeting(): TargetingState {
  return { skill: null, zone: -1 };
}

/**
 * Skill button tap (spec 14.3): same button cancels, ultimate asks for a long press,
 * global runs at once, zone skills enter selecting.
 * @example handle(skillTap(tg, levee));
 */
export function skillTap(s: TargetingState, skill: TargetSkill): TargetEvent {
  if (s.skill === skill) return cancelTargeting(s);
  if (skill.ultimate) return { t: 'needLongPress', skill };
  if (skill.target === 'global') {
    s.skill = null;
    return { t: 'run', skill, zone: -1 };
  }
  s.skill = skill;
  return { t: 'arm', skill };
}

/**
 * Skill button long press: runs an ultimate, otherwise behaves like a tap.
 * @example handle(skillLongPress(tg, nightRepair));
 */
export function skillLongPress(s: TargetingState, skill: TargetSkill): TargetEvent {
  if (!skill.ultimate) return skillTap(s, skill);
  s.skill = null;
  return { t: 'run', skill, zone: -1 };
}

/**
 * Board tap. Selecting: a valid zone runs the skill, anything else cancels.
 * Idle: pump toggles, then a gate toggles, then a zone is highlighted, empty space clears the highlight.
 * @param canTarget Whether the armed skill may target the zone.
 * @example handle(boardTap(tg, hitTest(state, cell), (sk, z) => valid(sk, z)));
 */
export function boardTap(
  s: TargetingState,
  hit: Readonly<Hit>,
  canTarget: (skill: TargetSkill, zone: number) => boolean,
): TargetEvent {
  const armed = s.skill;
  if (armed !== null) {
    if (hit.zone >= 0 && canTarget(armed, hit.zone)) {
      s.skill = null;
      s.zone = hit.zone;
      return { t: 'run', skill: armed, zone: hit.zone };
    }
    return cancelTargeting(s);
  }
  if (hit.pump >= 0) return { t: 'toggle', pump: hit.pump };
  if (hit.gate >= 0) return { t: 'gate', gate: hit.gate };
  s.zone = hit.zone;
  return hit.zone >= 0 ? { t: 'select', zone: hit.zone } : { t: 'deselect' };
}

/**
 * Leave selecting mode (Esc, wave end, invalid tap).
 * @example cancelTargeting(tg);
 */
export function cancelTargeting(s: TargetingState): TargetEvent {
  s.skill = null;
  return { t: 'cancel' };
}
