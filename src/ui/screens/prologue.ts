import type { T } from '../i18n.ts';

/** Story scenes (서막, region unlocks): one short fable line per page, tap / button to advance. */
export function mountScenes(root: HTMLElement, t: T, keys: readonly string[], done: () => void): { dispose(): void } {
  root.textContent = '';
  root.className = 'scenes';
  let i = 0;
  const text = document.createElement('p');
  text.className = 'scene-text';
  text.setAttribute('aria-live', 'polite');
  const btn = document.createElement('button');
  btn.className = 'scene-next';
  const dots = document.createElement('div');
  dots.className = 'scene-dots';
  dots.setAttribute('aria-hidden', 'true');
  const show = () => {
    text.textContent = t(keys[i]);
    btn.textContent = t(i < keys.length - 1 ? 'prologue.next' : 'prologue.start');
    dots.textContent = keys.map((_, k) => (k === i ? '●' : '○')).join(' ');
  };
  const next = () => { if (i < keys.length - 1) { i++; show(); } else done(); };
  btn.addEventListener('click', e => { e.stopPropagation(); next(); });
  root.addEventListener('click', next);
  root.append(text, dots, btn);
  show();
  return { dispose() { root.removeEventListener('click', next); root.textContent = ''; } };
}
