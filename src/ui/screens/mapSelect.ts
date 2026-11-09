import type { MapData } from '../../game/map.ts';
import type { CharacterDef } from '../../rules/types.ts';
import type { T } from '../i18n.ts';

/**
 * Map list (DETAILED §15.1 subset; the world map is story 007). Maps grouped by region in
 * data order; "여기부터" badge on the first map on a first run; character chips.
 */
export interface MapSelectOptions {
  root: HTMLElement;
  t: T;
  maps: readonly MapData[];
  chars: readonly CharacterDef[];
  charId: string;
  cleared: Record<string, boolean>;
  firstRun: boolean;
  /** Saved run to continue, if any. */
  resume?: { label: string; go: () => void } | null;
  /** One-time notices (save problems). */
  notices?: string[];
  /** Only this region's maps (from the world map), with a back button. */
  region?: string;
  onBack?: () => void;
  onPick: (mapId: string, charId: string) => void;
}

export function mountMapSelect(o: MapSelectOptions): { dispose(): void } {
  const { t, root } = o;
  root.textContent = '';
  root.className = 'map-select';
  let charId = o.charId;
  const el = (tag: string, cls = '', text = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };

  if (o.onBack) {
    const back = el('button', 'back', t('mapSelect.back')) as HTMLButtonElement;
    back.addEventListener('click', o.onBack);
    root.append(back);
  }
  root.append(el('h1', '', t('mapSelect.title')));
  if (o.notices?.length) {
    const n = el('div', 'notice');
    n.setAttribute('role', 'status');
    n.textContent = o.notices.join(' · ');
    root.append(n);
  }
  if (o.resume) {
    const r = el('button', 'resume', '▶ ' + o.resume.label) as HTMLButtonElement;
    r.addEventListener('click', o.resume.go);
    root.append(r);
  }
  const chips = el('div', 'chips');
  chips.setAttribute('role', 'radiogroup');
  chips.setAttribute('aria-label', t('mapSelect.character'));
  const chipBtns: HTMLButtonElement[] = [];
  for (const c of o.chars) {
    const b = el('button', 'chip', `${c.icon} ${t(c.i18n + '.name')}`) as HTMLButtonElement;
    b.setAttribute('role', 'radio');
    b.dataset.char = c.id;
    b.addEventListener('click', () => { charId = c.id; sync(); });
    chipBtns.push(b); chips.append(b);
  }
  const sync = () => chipBtns.forEach(b => b.setAttribute('aria-checked', String(b.dataset.char === charId)));
  sync();
  root.append(chips);

  const list = el('div', 'maps');
  const first = [...o.maps].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0];
  for (const region of [...new Set(o.maps.map(m => m.region ?? 'river'))].filter(r => !o.region || r === o.region)) {
    list.append(el('h2', 'region', t('region.' + region)));
    for (const m of o.maps.filter(x => (x.region ?? 'river') === region).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
      const card = el('button', 'map-card') as HTMLButtonElement;
      card.dataset.map = m.id;
      card.append(el('span', 'name', t((m.name ?? 'map.' + m.id) + '.name')));
      if (o.firstRun && m.id === first.id) card.append(el('span', 'badge here', t('mapSelect.startHere')));
      if (o.cleared[m.id]) card.append(el('span', 'badge done', '⭐ ' + t('mapSelect.cleared')));
      card.addEventListener('click', () => o.onPick(m.id, charId));
      list.append(card);
    }
  }
  root.append(list);
  return { dispose() { root.textContent = ''; } };
}
