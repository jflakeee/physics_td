import ko from '../i18n/ko.json' with { type: 'json' };
import { loadMap } from './game/map.ts';
import { createT } from './ui/i18n.ts';
import { mountPlay } from './ui/screens/play.ts';
import { mountMapSelect } from './ui/screens/mapSelect.ts';
import { CHARACTERS, ECONOMY, FUSIONS, SKILLS } from './data/catalog.ts';
import { MAPS } from './data/maps.ts';
import { createRules, grant } from './rules/skills.ts';
import { createTutorial, DONE } from './game/tutorial.ts';
import { isFirstRun, loadProgress, saveProgress } from './save/local.ts';

/**
 * v2 bootstrap and screen router: map select ↔ play (DETAILED §10 subset).
 * URL params for development / e2e:
 *   map=<id> (skip map select) · char=<id> · kit=all (grant tactical + ultimate) ·
 *   region=glacier (force regional skill variants) · tutorial=0 (off) · dev=1 (expose state)
 */
const q = new URLSearchParams(location.search);
const t = createT(ko);
document.title = t('app.title');
const root = document.getElementById('app') as HTMLElement;
const dev = q.has('dev');
const frames: number[] = [];
let charId = q.get('char') ?? CHARACTERS[0].id;
let dispose: (() => void) | null = null;

function showMapSelect(): void {
  dispose?.();
  const prog = loadProgress();
  dispose = mountMapSelect({
    root, t, maps: MAPS, chars: CHARACTERS, charId, cleared: prog.cleared, firstRun: isFirstRun(prog),
    onPick: (mapId, c) => { charId = c; play(mapId); },
  }).dispose;
  if (dev) (globalThis as Record<string, unknown>).__ptd = { screen: 'mapSelect' };
}

function play(mapId: string): void {
  dispose?.();
  const base = MAPS.find(m => m.id === mapId) ?? MAPS[0];
  const data = { ...base, ...(q.get('region') ? { region: q.get('region') as string } : {}) };
  const map = loadMap(data);
  const char = CHARACTERS.find(c => c.id === charId) ?? CHARACTERS[0];
  const prog = loadProgress();
  const tutorialOn = q.get('tutorial') !== '0' && map.data.id === MAPS[0].id && prog.tutorial < DONE;
  const screen = mountPlay({
    root, map, t,
    rules: p => {
      const rs = createRules(map, SKILLS, char, ECONOMY, () => p.phase === 'wave');
      if (q.get('kit') === 'all') { grant(rs, char.skills.tactical); grant(rs, char.skills.ultimate); }
      return rs;
    },
    chars: CHARACTERS, fusions: FUSIONS,
    // run seed: any integer; chosen outside the sim (retries restore the card stream)
    seed: q.get('seed') ? +(q.get('seed') as string) : (crypto.getRandomValues(new Uint32Array(1))[0] | 0),
    onFusion: id => { const p = loadProgress(); p.codex = [...new Set([...(p.codex ?? []), id])]; saveProgress(p); },
    tutorial: tutorialOn ? createTutorial(prog.tutorial) : undefined,
    onTutorial: step => { const p = loadProgress(); p.tutorial = step; saveProgress(p); },
    onClear: () => { const p = loadProgress(); p.cleared[map.data.id] = true; saveProgress(p); },
    onExit: to => (to === 'restart' ? play(mapId) : showMapSelect()),
    onFrame: dev ? ms => { frames.push(ms); if (frames.length > 600) frames.shift(); } : undefined,
  });
  dispose = screen.dispose;
  if (dev) (globalThis as Record<string, unknown>).__ptd = { screen: 'play', play: screen.play, target: screen.target, zones: map.zones.zones, frames };
}

if (q.get('map')) play(q.get('map') as string); else showMapSelect();
