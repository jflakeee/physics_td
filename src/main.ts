import dikeVillage from '../data/maps/dike-village.json' with { type: 'json' };
import ko from '../i18n/ko.json' with { type: 'json' };
import { loadMap } from './game/map.ts';
import type { MapData } from './game/map.ts';
import { createT } from './ui/i18n.ts';
import { mountPlay } from './ui/screens/play.ts';
import { DIKE_KEEPER_ACTIVE, FREEZE } from './ui/skillViews.ts';

/**
 * v2 bootstrap. Map select / briefing arrive with later stories; this boots straight into
 * 둑마을 with the 둑지기 skill bar. `?dev=1` exposes frame timings for e2e checks (§26).
 */
const t = createT(ko);
document.title = t('app.title');
const root = document.getElementById('app') as HTMLElement;
const map = loadMap(dikeVillage as unknown as MapData);
const dev = new URLSearchParams(location.search).has('dev');
const frames: number[] = [];
const screen = mountPlay({
  root, map, t, common: [FREEZE], active: DIKE_KEEPER_ACTIVE,
  onFrame: dev ? ms => { frames.push(ms); if (frames.length > 600) frames.shift(); } : undefined,
});
if (dev) (globalThis as Record<string, unknown>).__ptd = { play: screen.play, target: screen.target, zones: map.zones.zones, frames };
