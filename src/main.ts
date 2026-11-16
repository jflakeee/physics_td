import { createRun } from './game/machine.ts';
import { loadMaps } from './game/maps.ts';
import type { MapData } from './game/maps.ts';
import { createTutorial } from './game/tutorial.ts';
import { loadDraftData } from './rules/cards.ts';
import { loadSkillData } from './rules/skills.ts';
import { getFlag, setFlag } from './ui/flags.ts';
import { createTranslate, loadDictionary } from './ui/i18n.ts';
import { mountMapSelect } from './ui/screens/mapSelect.ts';
import { mountPlay } from './ui/screens/play.ts';
import type { PlayDebug } from './ui/screens/play.ts';
import { injectStyles } from './ui/styles.ts';

/**
 * v2 entry (Story 004): map list -> play. Cash, level, waves and layout come from
 * data/maps/*.json; the character defaults to 둑지기 (`?char=` overrides until Story 007's briefing).
 * Debug: `?seed=` run seed (default 1).
 */
const FIRST_RUN_FLAG = 'firstRunDone';
const TUTORIAL_FLAG = 'tutorialDone';
const DEFAULT_CHARACTER = 'dike-keeper';

async function boot(): Promise<void> {
  injectStyles();
  const read = async (p: string): Promise<unknown> => (await fetch(p)).json();
  const t = createTranslate(await loadDictionary('i18n/ko.json'));
  document.title = t('app.title');
  const [data, maps, draftData] = await Promise.all([loadSkillData(read), loadMaps(read), loadDraftData(read)]);
  const q = new URLSearchParams(location.search);
  const root = document.getElementById('app') as HTMLElement;
  const showList = (): void => mountMapSelect(root, maps, t, !getFlag(FIRST_RUN_FLAG), play);
  function play(map: MapData): void {
    setFlag(FIRST_RUN_FLAG);
    const run = createRun(map, data, q.get('char') ?? DEFAULT_CHARACTER, Number(q.get('seed') ?? 1), draftData);
    const tutorial = map.tutorial && !getFlag(TUTORIAL_FLAG) ? createTutorial() : null;
    (window as unknown as { __v2: PlayDebug }).__v2 = mountPlay(root, {
      run, t, tutorial, onTutorialDone: () => setFlag(TUTORIAL_FLAG), onExit: () => location.reload(),
    });
  }
  showList();
}

boot().catch((err: unknown) => {
  document.body.textContent = String(err);
  throw err;
});
