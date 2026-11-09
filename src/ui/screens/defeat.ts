import type { T } from '../i18n.ts';

/** Defeat screen (DETAILED §15.5): [이 웨이브부터] [처음부터] [맵 선택]. */
export function renderDefeat(host: HTMLElement, t: T, act: { retry(): void; restart(): void; mapSelect(): void }): void {
  host.textContent = '';
  host.className = 'overlay';
  host.hidden = false;
  const h = document.createElement('h2');
  h.textContent = t('defeat.title');
  host.append(h);
  const b = (label: string, fn: () => void, cls = '') => {
    const x = document.createElement('button');
    x.textContent = label; if (cls) x.className = cls;
    x.addEventListener('click', fn); host.append(x);
  };
  b(t('defeat.retry'), act.retry, 'primary');
  b(t('defeat.restart'), act.restart);
  b(t('common.mapSelect'), act.mapSelect);
}
