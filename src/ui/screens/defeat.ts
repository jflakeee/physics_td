import type { T } from '../i18n.ts';

/** One flood source and its share of this wave's base damage. */
export interface CauseShare { label: string; share: number; kind: 'inlet' | 'rain' | 'ice'; }

/**
 * Defeat screen (DETAILED §15.5): flood cause — share of this wave's base damage per inlet
 * direction, rain and ice (bars + numbers, largest first) — then [이 웨이브부터] [처음부터] [맵 선택].
 */
export function renderDefeat(host: HTMLElement, t: T, act: { retry(): void; restart(): void; mapSelect(): void }, causes: CauseShare[] = []): void {
  host.textContent = '';
  host.className = 'overlay';
  host.hidden = false;
  const h = document.createElement('h2');
  h.textContent = t('defeat.title');
  host.append(h);
  const shown = causes.filter(c => c.share >= 0.01).sort((a, b) => b.share - a.share);
  if (shown.length) {
    const box = document.createElement('section');
    box.className = 'causes';
    const cap = document.createElement('h3');
    cap.textContent = t('cause.title');
    box.append(cap);
    for (const c of shown) {
      const row = document.createElement('div');
      row.className = 'cause';
      const name = document.createElement('span'); name.textContent = c.label;
      const bar = document.createElement('span'); bar.className = 'cause-bar'; bar.style.setProperty('--w', Math.round(c.share * 100) + '%');
      const pct = document.createElement('b'); pct.textContent = Math.round(c.share * 100) + '%';
      row.append(name, bar, pct);
      box.append(row);
    }
    const hint = document.createElement('p');
    hint.className = 'cause-hint';
    const top = shown[0];
    hint.textContent = top.kind === 'rain' ? t('cause.hintRain') : top.kind === 'ice' ? t('cause.hintIce') : t('cause.hint', { src: top.label });
    box.append(hint);
    host.append(box);
  }
  const b = (label: string, fn: () => void, cls = '') => {
    const x = document.createElement('button');
    x.textContent = label; if (cls) x.className = cls;
    x.addEventListener('click', fn); host.append(x);
  };
  b(t('defeat.retry'), act.retry, 'primary');
  b(t('defeat.restart'), act.restart);
  b(t('common.mapSelect'), act.mapSelect);
}
