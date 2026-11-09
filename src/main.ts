import ko from '../i18n/ko.json' with { type: 'json' };
import { loadMap } from './game/map.ts';
import type { Play } from './game/play.ts';
import { createT } from './ui/i18n.ts';
import { mountPlay } from './ui/screens/play.ts';
import { mountMapSelect } from './ui/screens/mapSelect.ts';
import { CHARACTERS, ECONOMY, FUSIONS, SKILLS } from './data/catalog.ts';
import { MAPS } from './data/maps.ts';
import { DATA_VERSION, ENDINGS } from './data/version.ts';
import { createRules, grant } from './rules/skills.ts';
import { createTutorial, DONE } from './game/tutorial.ts';
import { computeResult, recordResult } from './game/result.ts';
import { createStore, isFirstRun, takeResumable } from './save/storage.ts';
import type { SaveIssue, SaveV1, StorageLike } from './save/storage.ts';
import { restoreRun, serializeRun } from './save/snapshot.ts';

/**
 * v2 bootstrap and screen router: map select ↔ play (DETAILED §10 subset), save/resume (§16).
 * URL params for development / e2e:
 *   map=<id> (skip map select) · char=<id> · kit=all (grant tactical + ultimate) · seed=<n> ·
 *   region=glacier (force regional skill variants) · tutorial=0 (off) · dev=1 (expose state)
 */
const q = new URLSearchParams(location.search);
const t = createT(ko);
document.title = t('app.title');
const root = document.getElementById('app') as HTMLElement;
const dev = q.has('dev');
const frames: number[] = [];
const DATA = { skills: SKILLS, chars: CHARACTERS, fusions: FUSIONS, eco: ECONOMY, endings: ENDINGS };

const notices: string[] = [];
const ISSUE_KEY: Record<SaveIssue, string> = { memory: 'toast.memoryMode', corrupt: 'toast.saveCorrupt', discarded: 'toast.saveDiscarded' };
const backend = (() => { try { return globalThis.localStorage as StorageLike; } catch { return null; } })();
const store = createStore(backend, i => notices.push(t(ISSUE_KEY[i])));
const takeNotices = () => notices.splice(0);

let charId = q.get('char') ?? store.load().progress.lastChar ?? CHARACTERS[0].id;
let dispose: (() => void) | null = null;

function showMapSelect(): void {
  dispose?.();
  const save = store.load();
  const res = takeResumable(store, DATA_VERSION);
  if (res.discarded) notices.push(t(ISSUE_KEY.discarded));
  const cleared = Object.fromEntries(Object.entries(save.progress.maps).filter(([, r]) => r.clearedBy.length > 0).map(([k]) => [k, true]));
  const ms = mountMapSelect({
    root, t, maps: MAPS, chars: CHARACTERS, charId, cleared, firstRun: isFirstRun(save),
    resume: res.run ? { label: t('mapSelect.resume', { map: t((MAPS.find(m => m.id === res.run!.mapId)?.name ?? '') + '.name'), wave: res.run.wave + 1 }), go: () => resume(res.run!) } : null,
    notices: takeNotices(),
    onPick: (mapId, c) => { charId = c; play(mapId); },
  });
  dispose = ms.dispose;
  if (dev) (globalThis as Record<string, unknown>).__ptd = { screen: 'mapSelect', store };
}

function resume(run: NonNullable<SaveV1['run']>): void {
  charId = run.charId;
  play(run.mapId, run);
}

function play(mapId: string, run?: NonNullable<SaveV1['run']>): void {
  dispose?.();
  const base = MAPS.find(m => m.id === mapId) ?? MAPS[0];
  const data = { ...base, ...(q.get('region') ? { region: q.get('region') as string } : {}) };
  const map = loadMap(data);
  const char = CHARACTERS.find(c => c.id === charId) ?? CHARACTERS[0];
  const save = store.load();
  const tutorialOn = q.get('tutorial') !== '0' && map.data.id === MAPS[0].id && save.progress.tutorial < DONE;
  const seed = run?.seed ?? (q.get('seed') ? +(q.get('seed') as string) : (crypto.getRandomValues(new Uint32Array(1))[0] | 0));
  const persist = (p: Play) => {
    const snapshot = serializeRun(p);
    if (!snapshot) return;
    const s = store.load();
    s.run = { dataVersion: DATA_VERSION, mapId, charId: char.id, seed, wave: p.phase === 'wave' || p.phase === 'defeat' ? p.world.wave - 1 : p.world.wave, snapshot };
    store.save(s);
  };
  const others = CHARACTERS.filter(c => c.id !== char.id);
  const next = MAPS[MAPS.indexOf(base) + 1];
  const screen = mountPlay({
    root, map, t, chars: CHARACTERS, fusions: FUSIONS, seed,
    rules: p => {
      const rs = createRules(map, SKILLS, char, ECONOMY, () => p.phase === 'wave');
      if (q.get('kit') === 'all') { grant(rs, char.skills.tactical); grant(rs, char.skills.ultimate); }
      return rs;
    },
    beforeMount: p => { if (run) restoreRun(p, run.snapshot); },
    onSave: persist,
    onFusion: id => { const s = store.load(); if (!s.progress.fusions.includes(id)) { s.progress.fusions.push(id); store.save(s); } },
    onResult: p => {
      const s = store.load();
      const result = computeResult(p, s, DATA);
      const ns = recordResult(s, p, result);
      store.save(ns);
      return { result, codex: { n: ns.progress.endings.length, max: ENDINGS.endings.length }, hasNext: !!next };
    },
    tutorial: tutorialOn ? createTutorial(save.progress.tutorial) : undefined,
    onTutorial: step => { const s = store.load(); s.progress.tutorial = step; store.save(s); },
    onExit: to => {
      if (to === 'mapSelect') return showMapSelect();
      if (to === 'otherChar' && others.length) charId = others[0].id;
      if (to === 'nextMap' && next) return play(next.id);
      play(mapId);
    },
    notices: takeNotices(),
    onFrame: dev ? ms => { frames.push(ms); if (frames.length > 600) frames.shift(); } : undefined,
  });
  dispose = screen.dispose;
  { const s = store.load(); s.progress.lastChar = char.id; store.save(s); }
  if (dev) (globalThis as Record<string, unknown>).__ptd = { screen: 'play', play: screen.play, target: screen.target, zones: map.zones.zones, frames, store };
}

if (q.get('map')) play(q.get('map') as string); else showMapSelect();
