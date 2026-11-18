import type { MapData } from '../../game/maps.ts';
import { el } from '../dom.ts';
import type { Translate } from '../i18n.ts';

/** The "continue" card shown above the list when a saved run exists. */
export interface ResumeCard { label: string; onResume(): void }

/** Story 007 extras: maps still locked (shown disabled with the reason) and a back button to the world map. */
export interface MapSelectExtras { locked?: ReadonlySet<string>; onBack?: () => void }

/**
 * Map select list (spec 15.1 subset; the list inside the world map, Story 007): one button per map
 * with name, region and blurb; `startHere` maps get the "여기부터" badge while `showBadge`; maps in
 * `extras.locked` are disabled. `resume` adds the 이어하기 card on top (Story 006).
 * @example mountMapSelect(root, maps, t, !getFlag('firstRunDone'), (m) => start(m), null);
 */
export function mountMapSelect(root: HTMLElement, maps: readonly MapData[], t: Translate, showBadge: boolean, onPick: (map: MapData) => void, resume: ResumeCard | null = null, extras: MapSelectExtras = {}): void {
  root.textContent = '';
  const box = el('main', 'map-select');
  if (extras.onBack) {
    const back = el('button', 'map-back', `◀ ${t('mapSelect.back')}`);
    back.addEventListener('click', extras.onBack);
    box.appendChild(back);
  }
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
    if (extras.locked?.has(m.id)) {
      b.disabled = true;
      b.appendChild(el('span', 'blurb', `🔒 ${t('mapSelect.locked')}`));
    } else if (showBadge && m.startHere) b.appendChild(el('span', 'badge', t('mapSelect.startHere')));
    b.addEventListener('click', () => onPick(m));
    li.appendChild(b);
    list.appendChild(li);
  }
  box.appendChild(list);
  root.appendChild(box);
}
