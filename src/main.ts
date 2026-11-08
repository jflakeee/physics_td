import dikeVillage from '../data/maps/dike-village.json' with { type: 'json' };
import ko from '../i18n/ko.json' with { type: 'json' };
import { loadMap } from './game/map.ts';
import type { MapData } from './game/map.ts';
import { createT } from './ui/i18n.ts';
import { mountPlay } from './ui/screens/play.ts';
import { CHARACTERS, ECONOMY, SKILLS } from './data/catalog.ts';
import { createRules, grant } from './rules/skills.ts';

/**
 * v2 bootstrap. Map select / briefing arrive with later stories; this boots straight into
 * 둑마을. URL params (dev until the briefing screen exists):
 *   char=dike-keeper|wetland-researcher · kit=all (also grant tactical + ultimate) ·
 *   region=glacier (regional skill variants) · dev=1 (frame timings for e2e, §26)
 */
const q = new URLSearchParams(location.search);
const t = createT(ko);
document.title = t('app.title');
const root = document.getElementById('app') as HTMLElement;
const data = { ...(dikeVillage as unknown as MapData), ...(q.get('region') ? { region: q.get('region') as string } : {}) };
const map = loadMap(data);
const char = CHARACTERS.find(c => c.id === q.get('char')) ?? CHARACTERS[0];
const dev = q.has('dev');
const frames: number[] = [];
const screen = mountPlay({
  root, map, t,
  rules: play => {
    const rs = createRules(map, SKILLS, char, ECONOMY, () => play.phase === 'wave');
    if (q.get('kit') === 'all') { grant(rs, char.skills.tactical); grant(rs, char.skills.ultimate); }
    return rs;
  },
  onFrame: dev ? ms => { frames.push(ms); if (frames.length > 600) frames.shift(); } : undefined,
});
if (dev) (globalThis as Record<string, unknown>).__ptd = { play: screen.play, target: screen.target, zones: map.zones.zones, frames };
