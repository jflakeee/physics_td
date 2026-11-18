import type { ShardData } from '../../rules/memory.ts';
import type { Progress } from '../../save/storage.ts';
import { el } from '../dom.ts';
import type { Translate } from '../i18n.ts';

/** Inputs to the codex. */
export interface CodexOptions {
  t: Translate;
  progress: Progress;
  shards: ShardData;
  /** Every ending / fusion that exists, as `{ id, i18n }` (found ones show their name). */
  endings: readonly { id: string; i18n: string }[];
  fusions: readonly { id: string; i18n: string }[];
  /** Tab to open first. */
  tab?: 'memory' | 'records';
  onBack(): void;
}

/**
 * Codex (Story 007): tab "기억" lists the memory shards per philosophy (collected: title + scene,
 * others: silhouette + hint) with the recall card of each character; tab "기록" lists the endings
 * and fusions found so far. Tab bodies scroll inside the screen, never the document.
 * @example mountCodex(root, { t, progress, shards, endings, fusions, onBack });
 */
export function mountCodex(root: HTMLElement, o: CodexOptions): void {
  const { t, progress: p, shards: sd } = o;
  root.textContent = '';
  const box = el('main', 'codex');
  const head = el('div', 'cx-head');
  head.appendChild(el('h1', '', t('codex.title')));
  const back = el('button', 'cx-back', `◀ ${t('codex.back')}`);
  back.addEventListener('click', o.onBack);
  head.appendChild(back);

  const tabs = el('div', 'cx-tabs');
  tabs.setAttribute('role', 'tablist');
  const body = el('div', 'cx-body');
  body.setAttribute('role', 'tabpanel');

  const memory = (): void => {
    for (const ph of sd.philosophies) {
      const mine = sd.shards.filter((s) => s.philosophy === ph.id);
      const got = mine.filter((s) => p.shards.includes(s.id));
      const sec = el('section', 'cx-phil');
      sec.appendChild(el('h2', '', `${t(ph.i18n)} · ${got.length}/${mine.length}`));
      if (p.recalls.includes(ph.id)) {
        const r = el('div', 'cx-recall');
        r.append(el('b', '', t(`${ph.recall}.title`)), el('p', '', t(`${ph.recall}.text`)));
        r.dataset.recall = ph.id;
        sec.appendChild(r);
      } else {
        sec.appendChild(el('div', 'cx-recall dark', t('codex.recall.locked', { n: got.length, max: sd.recallNeeds })));
      }
      for (const s of mine) {
        const have = p.shards.includes(s.id);
        const c = el('div', `cx-shard${have ? '' : ' dark'}`);
        c.dataset.shard = s.id;
        if (have) c.append(el('b', '', t(`${s.i18n}.title`)), el('span', '', t(`${s.i18n}.text`)));
        else c.append(el('b', '', `◼ ${t('codex.unknown')}`), el('span', '', t('codex.shardHint', { hint: t(`${s.i18n}.hint`) })));
        sec.appendChild(c);
      }
      body.appendChild(sec);
    }
  };
  const records = (): void => {
    const list = (title: string, items: readonly { id: string; i18n: string }[], found: readonly string[], key: string): void => {
      const sec = el('section', 'cx-phil');
      sec.appendChild(el('h2', '', title));
      const ul = el('ul', 'cx-list');
      for (const it of items) ul.appendChild(el('li', found.includes(it.id) ? '' : 'dark', found.includes(it.id) ? t(`${it.i18n}.${key}`) : t('codex.unknown')));
      sec.appendChild(ul);
      body.appendChild(sec);
    };
    list(t('codex.endings', { n: p.endings.length, max: o.endings.length }), o.endings, p.endings, 'title');
    list(t('codex.fusions', { n: p.fusions.length, max: o.fusions.length }), o.fusions, p.fusions, 'name');
  };

  const show = (tab: 'memory' | 'records'): void => {
    body.textContent = '';
    for (const b of tabs.children) b.setAttribute('aria-selected', String((b as HTMLElement).dataset.tab === tab));
    (tab === 'memory' ? memory : records)();
  };
  for (const tab of ['memory', 'records'] as const) {
    const b = el('button', '', t(`codex.tab.${tab}`));
    b.setAttribute('role', 'tab');
    b.dataset.tab = tab;
    b.addEventListener('click', () => show(tab));
    tabs.appendChild(b);
  }
  box.append(head, tabs, body);
  root.appendChild(box);
  show(o.tab ?? 'memory');
}
