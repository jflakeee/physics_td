import type { SaveV1 } from '../../save/storage.ts';
import type { T } from '../i18n.ts';

/** Settings (DETAILED §15.6, GD §18): haptics, reduced motion, left-hand mode, tutorial replay. */
export interface SettingsOptions {
  root: HTMLElement;
  t: T;
  settings: SaveV1['settings'];
  onChange: (s: SaveV1['settings']) => void;
  onReplayTutorial: () => void;
  onBack: () => void;
  legacyHref: string;
}

export function mountSettings(o: SettingsOptions): { dispose(): void } {
  const { root, t } = o;
  root.textContent = '';
  root.className = 'settings';
  const s = { ...o.settings };
  const mk = (tag: string, cls = '', text = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
  const head = mk('header');
  const back = mk('button', 'back', t('codex.back'));
  back.addEventListener('click', o.onBack);
  head.append(back, mk('h1', '', t('settings.title')));
  root.append(head);
  const toggle = (key: 'haptics' | 'leftHand', label: string) => {
    const b = mk('button', 'row') as HTMLButtonElement;
    b.setAttribute('role', 'switch');
    const sync = () => { b.setAttribute('aria-checked', String(s[key])); b.textContent = `${label} · ${t(s[key] ? 'common.on' : 'common.off')}`; };
    b.addEventListener('click', () => { s[key] = !s[key]; sync(); o.onChange({ ...s }); });
    sync(); root.append(b);
  };
  toggle('haptics', t('settings.haptics'));
  toggle('leftHand', t('settings.leftHand'));
  const motion = mk('div', 'row-group');
  motion.setAttribute('role', 'radiogroup');
  motion.setAttribute('aria-label', t('settings.motion'));
  motion.append(mk('span', 'label', t('settings.motion')));
  const opts = ['auto', 'on', 'off'] as const;
  const mbtns = opts.map(v => {
    const b = mk('button', 'seg', t('settings.motion.' + v));
    b.setAttribute('role', 'radio');
    b.addEventListener('click', () => { s.reducedMotion = v; sync(); o.onChange({ ...s }); });
    motion.append(b);
    return b;
  });
  const sync = () => mbtns.forEach((b, i) => b.setAttribute('aria-checked', String(opts[i] === s.reducedMotion)));
  sync();
  root.append(motion);
  const replay = mk('button', 'row', t('settings.tutorial'));
  const msg = mk('p', 'hint');
  msg.setAttribute('role', 'status');
  replay.addEventListener('click', () => { o.onReplayTutorial(); msg.textContent = t('settings.tutorialDone'); });
  const legacy = mk('a', 'row link', t('settings.legacy')) as HTMLAnchorElement;
  legacy.href = o.legacyHref;
  root.append(replay, msg, legacy);
  return { dispose() { root.textContent = ''; } };
}
