import type { MemoriesDef } from '../../rules/story.ts';
import { openRecalls } from '../../rules/story.ts';
import type { T } from '../i18n.ts';

/** Codex (도감): endings · fusions · memories tabs. Unknown entries are silhouettes + hints. */
export interface CodexOptions {
  root: HTMLElement;
  t: T;
  endings: { id: string; i18n: string }[];
  fusions: { id: string; i18n: string }[];
  memories: MemoriesDef;
  have: { endings: string[]; fusions: string[]; memories: string[] };
  tab?: 'endings' | 'fusions' | 'memories';
  onBack: () => void;
}

export function mountCodex(o: CodexOptions): { dispose(): void } {
  const { root, t } = o;
  root.textContent = '';
  root.className = 'codex';
  const mk = (tag: string, cls = '', text = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
  const head = mk('header');
  const back = mk('button', 'back', t('codex.back'));
  back.addEventListener('click', o.onBack);
  head.append(back, mk('h1', '', t('codex.title')));
  const tabs = mk('div', 'tabs');
  tabs.setAttribute('role', 'tablist');
  const body = mk('div', 'tab-body');
  body.setAttribute('role', 'tabpanel');
  const names = ['endings', 'fusions', 'memories'] as const;
  const btns = names.map(n => {
    const b = mk('button', 'tab', t('codex.tab.' + n));
    b.setAttribute('role', 'tab'); b.dataset.tab = n;
    b.addEventListener('click', () => show(n));
    tabs.append(b);
    return b;
  });
  const entry = (known: boolean, title: string, text: string, cls = '') => {
    const e = mk('div', 'entry ' + (known ? 'known ' : 'unknown ') + cls);
    e.append(mk('strong', '', known ? title : t('codex.unknown')), mk('p', '', text));
    return e;
  };
  const show = (n: typeof names[number]) => {
    btns.forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === n)));
    body.textContent = '';
    if (n === 'endings') for (const e of o.endings) body.append(entry(o.have.endings.includes(e.id), t(e.i18n + '.name'), o.have.endings.includes(e.id) ? t(e.i18n + '.gain') : ''));
    if (n === 'fusions') for (const f of o.fusions) body.append(entry(o.have.fusions.includes(f.id), t(f.i18n + '.name'), o.have.fusions.includes(f.id) ? t(f.i18n + '.desc') : t('fusion.hint')));
    if (n === 'memories') {
      const recalls = openRecalls(o.memories, o.have.memories);
      for (const p of o.memories.philosophies) {
        const sec = mk('section', 'philosophy');
        sec.append(mk('h2', '', `${p.icon} ${t(p.i18n + '.name')}`));
        for (const f of o.memories.fragments.filter(x => x.philosophy === p.id)) {
          const got = o.have.memories.includes(f.id);
          sec.append(entry(got, '🌊', got ? t(`memory.${f.id}.text`) : t(`memory.${f.id}.hint`), 'fragment'));
        }
        const rc = mk('div', 'recall ' + (recalls.includes(p.id) ? 'open' : 'closed'));
        rc.append(mk('span', 'label', t('codex.recall')), mk('p', '', recalls.includes(p.id) ? t('recall.' + p.id) : t('codex.recallLocked', { n: o.memories.recallAt })));
        sec.append(rc);
        body.append(sec);
      }
    }
  };
  root.append(head, tabs, body);
  show(o.tab ?? 'endings');
  return { dispose() { root.textContent = ''; } };
}
