import type { RunResult } from '../../game/result.ts';
import type { T } from '../i18n.ts';

/**
 * Result screen (DETAILED §15.5, GD §9.5): ending title → epilogue 2 cards (얻은 것 / 잃은 것,
 * tap to advance) → itemised score (zero items hidden) → stars → next goal card.
 * [같은 맵 다시] is the top button. Display only; actions are callbacks.
 */
export interface ResultActions { again(): void; otherChar(): void; nextMap(): void; mapSelect(): void; }

export function renderResult(host: HTMLElement, r: RunResult, t: T, codex: { n: number; max: number }, act: ResultActions, hasNext: boolean, extras: string[] = []): void {
  const mk = (tag: string, cls = '', text = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
  host.textContent = '';
  host.className = 'result-screen';
  host.hidden = false;
  host.setAttribute('role', 'dialog');
  const title = mk('h2', 'ending-title', t(r.ending.i18n + '.name'));
  const pages = [
    { cls: 'gain', label: t('result.gain'), text: t(r.ending.i18n + '.gain') },
    { cls: 'loss', label: t('result.loss'), text: t(r.ending.i18n + '.loss') },
  ];
  let page = 0;
  const card = mk('button', 'epilogue') as HTMLButtonElement;
  const showPage = () => {
    card.textContent = '';
    card.className = 'epilogue ' + pages[page].cls;
    card.append(mk('span', 'label', pages[page].label), mk('p', '', pages[page].text), mk('span', 'hint', t('result.tapNext')));
  };
  showPage();
  card.addEventListener('click', () => { if (page < pages.length - 1) { page++; showPage(); } else summary(); });
  host.append(title, card);

  const summary = () => {
    host.textContent = '';
    const btns = mk('div', 'result-actions');
    const b = (label: string, fn: () => void, cls = '') => { const x = mk('button', cls, label); x.addEventListener('click', fn); btns.append(x); };
    b(t('result.again'), act.again, 'primary');
    b(t('result.otherChar'), act.otherChar);
    if (hasNext) b(t('result.nextMap'), act.nextMap);
    b(t('common.mapSelect'), act.mapSelect);
    host.append(btns, mk('h2', 'ending-title', t(r.ending.i18n + '.name')));
    const table = mk('table', 'score-table');
    const cap = mk('caption', '', t('result.score'));
    table.append(cap);
    for (const it of r.items) {
      if (it.value === 0) continue;
      const tr = mk('tr');
      tr.append(mk('th', '', t('score.' + it.key, { type: t('build.' + r.build) })), mk('td', '', String(it.value)));
      table.append(tr);
    }
    const tot = mk('tr', 'total');
    tot.append(mk('th', '', t('result.total')), mk('td', '', String(r.total)));
    table.append(tot);
    const st = mk('div', 'stars', '⭐'.repeat(r.stars) + '☆'.repeat(3 - r.stars));
    st.setAttribute('aria-label', t('result.stars', { n: r.stars }));
    const goal = mk('div', 'goal');
    goal.append(mk('span', 'label', t('goal.title')), mk('p', '', t(r.goal.key, r.goal.params)));
    host.append(table, st, goal);
    for (const x of extras) host.append(mk('p', 'memory-got', x));
    host.append(mk('p', 'codex', t('codex.endings', codex)));
  };
}
