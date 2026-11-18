import { createRun } from './game/machine.ts';
import type { Run } from './game/machine.ts';
import { loadMaps } from './game/maps.ts';
import type { MapData } from './game/maps.ts';
import { createTutorial } from './game/tutorial.ts';
import { loadDraftData } from './rules/cards.ts';
import { parseEndings, resolveEnding } from './rules/endings.ts';
import { parseScoreRules, runScoreInput, scoreResult } from './rules/scoring.ts';
import { loadSkillData } from './rules/skills.ts';
import { evaluateShards, openRegions, parsePrologue, parseShards, parseWorld, unlockedRecalls, waveStoryKeys } from './rules/memory.ts';
import { str } from './rules/validate.ts';
import { addToCodex, hashData, openStore, recordClear, restoreRun, snapshotRun } from './save/storage.ts';
import { getFlag, setFlag } from './ui/flags.ts';
import { createTranslate, loadDictionary } from './ui/i18n.ts';
import { mountCodex } from './ui/screens/codex.ts';
import type { ResumeCard } from './ui/screens/mapSelect.ts';
import { mountPlay } from './ui/screens/play.ts';
import type { PlayDebug } from './ui/screens/play.ts';
import { mountWorldMap } from './ui/screens/worldMap.ts';
import { mountResult } from './ui/screens/result.ts';
import { injectStyles } from './ui/styles.ts';
import { createToaster } from './ui/widgets/toast.ts';

/**
 * v2 entry: map list -> play -> result (Story 006: score, ending, codex, save / resume).
 * Cash, level, waves and layout come from data/maps/*.json; the character defaults to 둑지기.
 * URL: `?map=<id>` starts that map directly (replay / other character / next map buttons use it),
 * `?char=` picks the character, `?seed=` the run seed (default 1).
 */
const FIRST_RUN_FLAG = 'firstRunDone';
const TUTORIAL_FLAG = 'tutorialDone';
const BRIEFING_FLAG = 'briefingDone';
const DEFAULT_CHARACTER = 'dike-keeper';

async function boot(): Promise<void> {
  injectStyles();
  const files: Record<string, unknown> = {};
  const read = async (p: string): Promise<unknown> => (files[p] = await (await fetch(p)).json());
  const t = createTranslate(await loadDictionary('i18n/ko.json'));
  document.title = t('app.title');
  const [data, maps, draftData, index] = await Promise.all([loadSkillData(read), loadMaps(read), loadDraftData(read), read('data/index.json')]);
  const idx = index as Record<string, unknown>;
  const scoreRules = parseScoreRules(await read(str(idx, 'scoring', 'data/index.json')));
  const endingRules = parseEndings(await read(str(idx, 'endings', 'data/index.json')), [...data.characters.keys()]);
  const regions = parseWorld(await read('data/story/world.json'));
  const shardData = parseShards(await read('data/story/shards.json'));
  const prologue = parsePrologue(await read('data/story/prologue.json'));
  const dataVersion = hashData(files);

  const toast = createToaster(document.body);
  const store = openStore(() => localStorage, () => toast(t('save.memoryMode')));
  const q = new URLSearchParams(location.search);
  const root = document.getElementById('app') as HTMLElement;
  let current: Run | null = null;

  /** Reload into a map (fresh page = fresh listeners) with a new seed (GD 20 "처음부터: 새 시드"). */
  const goTo = (mapId: string, charId: string): void => {
    const seed = String((Math.random() * 2 ** 32) >>> 0);
    location.search = new URLSearchParams({ map: mapId, char: charId, seed }).toString();
  };
  const toList = (): void => {
    location.href = location.pathname;
  };
  const discardRun = (): void => {
    delete store.data.run;
    store.flush();
  };
  const saveRun = (run: Run): void => {
    const s = snapshotRun(run, dataVersion);
    if (s === null) return;
    store.data.run = s;
    addToCodex(store.data.progress.fusions, run.codex);
    store.flush();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && current) saveRun(current);
  });

  function showResult(run: Run): void {
    const p = store.data.progress;
    const me = run.rt.character;
    const firstCombo = !(p.maps[run.map.id]?.clearedBy.includes(me.id) ?? false);
    const star3 = scoreRules.stars.star3Score[run.map.id] ?? Infinity;
    const score = scoreResult(scoreRules, runScoreInput(run, scoreRules, firstCombo), star3);
    const ending = resolveEnding(endingRules, me.id, me.axis, run.rt.axis);
    const newEnding = recordClear(p, run.map.id, me.id, score, ending.id, run.codex);
    const facts = { region: run.map.region, character: me.id, hp: run.state.hp, ecology: run.state.metrics.ecology, retries: run.retries, fusions: run.codex.length, axis: run.rt.axis };
    const gained = evaluateShards(shardData, facts).filter((s) => !p.shards.includes(s.id));
    addToCodex(p.shards, gained.map((s) => s.id));
    const recalled = unlockedRecalls(shardData, p.shards).filter((id) => !p.recalls.includes(id));
    addToCodex(p.recalls, recalled);
    delete store.data.run;
    store.flush();
    const memory = [
      ...gained.map((s) => ({ title: t(`${s.i18n}.title`), text: t(`${s.i18n}.text`) })),
      ...recalled.map((id) => {
        const ph = shardData.philosophies.find((x) => x.id === id);
        return { title: t('result.memory.recall', { name: t(`${ph?.recall}.title`) }), text: t(`${ph?.recall}.text`) };
      }),
    ];
    const cleared = p.maps[run.map.id].clearedBy;
    const other = [...data.characters.values()].find((c) => c.id !== me.id && !cleared.includes(c.id))
      ?? [...data.characters.values()].find((c) => c.id !== me.id);
    const next = maps[maps.indexOf(run.map) + 1];
    mountResult(root, {
      t, score, ending, newEnding, memory, hp: run.state.hp, hpStar: scoreRules.stars.hp, star3,
      codex: { endings: p.endings.length, endingsMax: endingRules.endings.length, fusions: p.fusions.length, fusionsMax: draftData.fusions.length },
      otherCharName: other && !cleared.includes(other.id) ? t(other.i18n) : null,
      onReplay: () => goTo(run.map.id, me.id),
      onOtherChar: other ? () => goTo(run.map.id, other.id) : undefined,
      onNextMap: next ? () => goTo(next.id, me.id) : undefined,
      onMaps: toList,
    });
  }

  function start(run: Run): void {
    setFlag(FIRST_RUN_FLAG);
    current = run;
    const tutorial = run.map.tutorial && !getFlag(TUTORIAL_FLAG) ? createTutorial() : null;
    (window as unknown as { __v2: PlayDebug }).__v2 = mountPlay(root, {
      run, t, tutorial, onTutorialDone: () => setFlag(TUTORIAL_FLAG), onExit: toList,
      waveLines: (w) => waveStoryKeys(prologue, run.seed, w).map((k) => t(k)),
      onCheckpoint: () => saveRun(run),
      onResult: () => showResult(run),
      onRestart: () => goTo(run.map.id, run.rt.character.id),
    });
  }
  const play = (map: MapData, charId: string): void =>
    start(createRun(map, data, charId, Number(q.get('seed') ?? 1), draftData));

  // Resume card: only when the saved run was made with the same data (GD 20), else discard + notice.
  let resume: ResumeCard | null = null;
  const saved = store.data.run;
  if (saved) {
    const map = maps.find((m) => m.id === saved.mapId);
    if (saved.dataVersion !== dataVersion || !map || !data.characters.has(saved.charId)) {
      discardRun();
      toast(t('save.discarded'));
    } else {
      const run = createRun(map, data, saved.charId, saved.seed, draftData);
      try {
        restoreRun(run, saved);
        resume = { label: t('mapSelect.resume', { map: t(`${map.i18n}.name`), n: run.wave + 1 }), onResume: () => start(run) };
      } catch {
        discardRun();
        toast(t('save.discarded'));
      }
    }
  }

  const direct = maps.find((m) => m.id === q.get('map'));
  if (direct) play(direct, q.get('char') ?? DEFAULT_CHARACTER);
  else showWorld();

  /** World map (boot entry and return target); the codex opens from it. */
  function showWorld(briefing = !getFlag(BRIEFING_FLAG)): void {
    mountWorldMap(root, {
      t, regions, maps, progress: store.data.progress, open: openRegions(regions, maps, store.data.progress.maps), resume,
      showBadge: !getFlag(FIRST_RUN_FLAG), briefing: briefing ? prologue.briefing : null, onBriefingDone: () => setFlag(BRIEFING_FLAG),
      onPick: (m) => play(m, q.get('char') ?? DEFAULT_CHARACTER),
      onCodex: () => mountCodex(root, {
        t, progress: store.data.progress, shards: shardData, onBack: () => showWorld(false),
        endings: endingRules.endings, fusions: draftData.fusions,
      }),
    });
  }
}

boot().catch((err: unknown) => {
  document.body.textContent = String(err);
  throw err;
});
