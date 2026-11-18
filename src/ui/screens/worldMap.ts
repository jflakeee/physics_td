import type { MapData } from '../../game/maps.ts';
import type { RegionDef } from '../../rules/memory.ts';
import type { Progress } from '../../save/storage.ts';
import { el } from '../dom.ts';
import type { Translate } from '../i18n.ts';
import { mountMapSelect } from './mapSelect.ts';
import type { ResumeCard } from './mapSelect.ts';

/** Inputs to the world map. */
export interface WorldMapOptions {
  t: Translate;
  /** data/story/world.json regions (home, frontier, far silhouettes). */
  regions: readonly RegionDef[];
  maps: readonly MapData[];
  progress: Progress;
  /** Ids of regions open for play (`openRegions`). */
  open: ReadonlySet<string>;
  resume: ResumeCard | null;
  showBadge: boolean;
  /** Prologue briefing lines (i18n keys) shown once as a card, or null. */
  briefing: readonly string[] | null;
  onBriefingDone(): void;
  onPick(map: MapData): void;
  onCodex(): void;
}

/**
 * World map (docs/STORY_WORLD_EXPANSION.md 3.3, launch teaser): the river-basin home territory as
 * hex tiles (one per cleared map, tap = record caption), the glacier border (locked / open) and
 * silhouettes of the regions beyond. [맵 고르기] opens the map list inside (locked maps disabled,
 * "여기부터" badge and resume card kept); [도감] opens the codex. Fixed one-screen layout.
 * @example mountWorldMap(root, { t, regions, maps, progress, open, resume, showBadge, briefing, ... });
 */
export function mountWorldMap(root: HTMLElement, o: WorldMapOptions): void {
  const { t, progress: p } = o;
  const lockedMaps = new Set(o.maps.filter((m) => !o.open.has(m.region)).map((m) => m.id));
  root.textContent = '';
  const box = el('main', 'world');
  box.appendChild(el('h1', 'wm-title', t('world.title')));

  const map = el('div', 'wm-map');
  map.setAttribute('role', 'group');
  map.setAttribute('aria-label', t('world.map.label'));
  const caption = el('p', 'wm-caption', t('world.caption.none'));
  caption.setAttribute('aria-live', 'polite');

  const frontier = o.regions.find((r) => r.kind === 'frontier');
  if (frontier) {
    const isOpen = o.open.has(frontier.id);
    const f = el('div', `wm-frontier${isOpen ? ' open' : ''}`, `${frontier.icon} ${t(isOpen ? 'world.glacier.open' : 'world.glacier.locked')}`);
    map.appendChild(f);
  }

  const home = el('div', 'wm-home');
  home.appendChild(el('span', 'hex base', t('world.base')));
  o.maps.forEach((m) => {
    const done = p.tiles.includes(m.id);
    if (!done) {
      const e = el('span', 'hex empty', '⬡');
      e.setAttribute('aria-label', t('world.slot.empty'));
      home.appendChild(e);
      return;
    }
    const text = t('world.slot.tile', { map: t(`${m.i18n}.name`), n: p.maps[m.id]?.stars ?? 0 });
    const b = el('button', 'hex', `${p.maps[m.id]?.stars ?? 0}★`);
    b.dataset.tile = m.id;
    b.setAttribute('aria-label', text);
    b.addEventListener('click', () => {
      home.querySelectorAll('.sel').forEach((n) => n.classList.remove('sel'));
      b.classList.add('sel');
      caption.textContent = text;
    });
    home.appendChild(b);
  });
  map.appendChild(home);

  const far = el('div', 'wm-far');
  for (const r of o.regions.filter((x) => x.kind === 'far')) {
    const s = el('span', '', r.icon);
    s.setAttribute('role', 'img');
    s.setAttribute('aria-label', t(r.i18n));
    far.appendChild(s);
  }
  map.appendChild(far);
  box.append(map, caption);

  const actions = el('div', 'wm-actions');
  if (o.resume) {
    const r = el('button', 'resume', o.resume.label);
    r.addEventListener('click', o.resume.onResume);
    actions.appendChild(r);
  }
  const pick = el('button', 'wm-pick', t('world.pickMap'));
  pick.addEventListener('click', () => mountMapSelect(root, o.maps, t, o.showBadge, o.onPick, o.resume, { locked: lockedMaps, onBack: () => mountWorldMap(root, { ...o, briefing: null }) }));
  const codex = el('button', 'wm-codex', t('world.codex'));
  codex.addEventListener('click', o.onCodex);
  actions.append(pick, codex);
  box.appendChild(actions);
  root.appendChild(box);

  if (o.briefing) {
    const card = el('section', 'wm-brief');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', t('world.briefing.title'));
    card.appendChild(el('h2', '', t('world.briefing.title')));
    for (const k of o.briefing) card.appendChild(el('p', '', t(k)));
    const ok = el('button', 'wm-brief-ok', t('world.briefing.ok'));
    ok.addEventListener('click', () => {
      card.remove();
      o.onBriefingDone();
    });
    card.appendChild(ok);
    root.appendChild(card);
    ok.focus();
  }
}
