import type { MapData } from '../../game/map.ts';
import { affinityOf } from '../../game/result.ts';
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
  /** Best stars per map (0–3), from the save. */
  stars?: Record<string, number>;
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
  const desc = el('p', 'char-desc');
  desc.setAttribute('aria-live', 'polite');
  const metaEls: { el: HTMLElement; style?: string }[] = [];
  const sync = () => {
    chipBtns.forEach(b => b.setAttribute('aria-checked', String(b.dataset.char === charId)));
    const c = o.chars.find(x => x.id === charId);
    desc.textContent = c ? t(c.i18n + '.desc') : '';
    // style + 정석/도전/중립 for the selected character (GD §4.2)
    for (const m of metaEls) {
      const aff = c ? affinityOf(c, m.style, o.chars) : 'neutral';
      m.el.textContent = '';
      if (m.style) m.el.append(t('style.' + m.style) + ' · ');
      const a = el('span', 'aff-' + aff, t('affinity.' + aff));
      m.el.append(a);
    }
  };
  root.append(chips, desc);

  const list = el('div', 'maps');
  const first = [...o.maps].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0];
  for (const region of [...new Set(o.maps.map(m => m.region ?? 'river'))].filter(r => !o.region || r === o.region)) {
    list.append(el('h2', 'region', t('region.' + region)));
    for (const m of o.maps.filter(x => (x.region ?? 'river') === region).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
      const card = el('button', 'map-card') as HTMLButtonElement;
      card.dataset.map = m.id;
      const nameBox = el('span', 'name', t((m.name ?? 'map.' + m.id) + '.name'));
      const meta = el('span', 'meta');
      nameBox.append(meta); metaEls.push({ el: meta, style: m.style });
      card.append(nameBox);
      if (o.firstRun && m.id === first.id) card.append(el('span', 'badge here', t('mapSelect.startHere')));
      const st = o.stars?.[m.id] ?? 0;
      if (st > 0) { const s = el('span', 'stars', '★'.repeat(st) + '☆'.repeat(Math.max(0, 3 - st))); s.setAttribute('aria-label', t('mapSelect.stars', { n: st })); card.append(s); }
      else if (o.cleared[m.id]) card.append(el('span', 'badge done', '⭐ ' + t('mapSelect.cleared')));
      card.addEventListener('click', () => o.onPick(m.id, charId));
      list.append(card);
    }
  }
  root.append(list);
  sync();
  return { dispose() { root.textContent = ''; } };
}
