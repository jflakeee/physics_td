import { attachGestures } from '../../input/gestures.ts';
import type { Translate } from '../i18n.ts';
import { el } from '../dom.ts';

/** What the skill bar shows for one skill. */
export interface SkillButtonSpec {
  id: string;
  /** i18n key prefix: `{i18n}.name`, `{i18n}.desc`. */
  i18n: string;
  icon: string;
  /** Button edge in px: 48 for common skills, 56 for actives (spec 15.3). */
  size: 48 | 56;
  ultimate: boolean;
}

/** Skill bar handle. */
export interface SkillBar {
  /** Mark the skill being targeted (aria-pressed), null for none. */
  setArmed(id: string | null): void;
  /** Disable a button (e.g. no valid target on the map). */
  setDisabled(id: string, disabled: boolean): void;
}

/**
 * Build the skill bar. Pointer input goes through the gesture recogniser (tap / long
 * press); keyboard activation (click with detail 0) counts as a tap.
 * @example const bar = createSkillBar(nav, skills, t, { onTap, onLongPress });
 */
export function createSkillBar<S extends SkillButtonSpec>(
  root: HTMLElement,
  skills: readonly S[],
  t: Translate,
  on: { onTap(skill: S): void; onLongPress(skill: S): void },
): SkillBar {
  const buttons = new Map<string, HTMLButtonElement>();
  for (const sk of skills) {
    const b = el('button', `skill s${sk.size}${sk.ultimate ? ' ult' : ''}`);
    const name = t(`${sk.i18n}.name`);
    b.setAttribute('aria-label', `${name}. ${t(`${sk.i18n}.desc`)}${sk.ultimate ? `. ${t('skill.ultimateHint')}` : ''}`);
    b.setAttribute('aria-pressed', 'false');
    b.dataset.skill = sk.id;
    b.append(el('span', 'ic', sk.icon), el('span', 'nm', name));
    if (sk.ultimate) b.appendChild(el('span', 'hint', t('skill.ultimateShort')));
    attachGestures(b, { onTap: () => on.onTap(sk), onLongPress: () => on.onLongPress(sk) });
    b.addEventListener('click', (e) => {
      if (e.detail === 0) on.onTap(sk);
    });
    buttons.set(sk.id, b);
    root.appendChild(b);
  }
  let armed: string | null = null;
  return {
    setArmed(id: string | null): void {
      if (id === armed) return;
      if (armed) buttons.get(armed)?.setAttribute('aria-pressed', 'false');
      if (id) buttons.get(id)?.setAttribute('aria-pressed', 'true');
      armed = id;
    },
    setDisabled(id: string, disabled: boolean): void {
      const b = buttons.get(id);
      if (b && b.disabled !== disabled) b.disabled = disabled;
    },
  };
}
