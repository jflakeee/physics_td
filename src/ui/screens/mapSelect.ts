import type { MapData } from '../../game/maps.ts';
import { el } from '../dom.ts';
import type { Translate } from '../i18n.ts';

/** The "continue" card shown above the list when a saved run exists. */
export interface ResumeCard { label: string; onResume(): void }

/**
 * Map select list (spec 15.1 subset; the world map is Story 007): one button per map with
 * name, region and blurb; `startHere` maps get the "여기부터" badge while `showBadge`.
 * `resume` adds the 이어하기 card on top (Story 006).
 * @example mountMapSelect(root, maps, t, !getFlag('firstRunDone'), (m) => start(m), null);
 */
export function mountMapSelect(root: HTMLElement, maps: readonly MapData[], t: Translate, showBadge: boolean, onPick: (map: MapData) => void, resume: ResumeCard | null = null): void {
  root.textContent = '';
  const box = el('main', 'map-select');
  box.appendChild(el('h1', '', t('mapSelect.title')));
  if (resume) {
    const r = el('button', 'map-item resume', resume.label);
    r.addEventListener('click', resume.onResume);
    box.appendChild(r);
  }
  const list = el('ul', 'map-list');
  for (const m of maps) {
    const li = el('li');
    const b = el('button', 'map-item');
    b.dataset.map = m.id;
    b.append(el('b', '', t(`${m.i18n}.name`)), el('span', 'region', t(`region.${m.region}`)), el('span', 'blurb', t(`${m.i18n}.blurb`)));
    if (showBadge && m.startHere) b.appendChild(el('span', 'badge', t('mapSelect.startHere')));
    b.addEventListener('click', () => onPick(m));
    li.appendChild(b);
    list.appendChild(li);
  }
  box.appendChild(list);
  root.appendChild(box);
}
