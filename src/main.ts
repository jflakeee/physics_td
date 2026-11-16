import { createSim } from './sim/step.ts';
import { zoneCenterCell } from './input/hit.ts';
import { DEMO_SKILLS } from './ui/demoSkills.ts';
import { createTranslate, loadDictionary } from './ui/i18n.ts';
import { mountPlay } from './ui/screens/play.ts';
import type { PlayDebug } from './ui/screens/play.ts';

/**
 * v2 entry (Story 002 demo). Until Story 004 ships map data, the board is the
 * "둑마을" tile draft (spec 11.3) with a fixed noise salt, one demo pump (off) and
 * placeholder run values.
 */
const DEMO_TILES = [
  'PPPIPPPO', 'PPFPPPPP', 'PPPPPPFP', 'PDPPPPPP', 'PPPPPPPP', 'IPPBBPPP',
  'PPPBBPPI', 'PPPPPPPP', 'PPFPPPDP', 'PPPPPPPP', 'PPPPFPPP', 'OPPPIPPP',
];
const DEMO_I1 = 120;
const DEMO_SALT = 11;
const DEMO_WAVES = 5;
const DEMO_CASH = 200;
const DEMO_LEVEL = 1;
/** Zone (tile) holding the demo pump: tx 5, ty 4, next to the base. */
const DEMO_PUMP_ZONE = 4 * 8 + 5;

async function boot(): Promise<void> {
  const t = createTranslate(await loadDictionary('i18n/ko.json'));
  document.title = t('app.title');
  const state = createSim(DEMO_TILES, DEMO_I1, DEMO_SALT);
  state.pumps.push({ id: 1, cell: zoneCenterCell(DEMO_PUMP_ZONE), on: false });
  const root = document.getElementById('app') as HTMLElement;
  (window as unknown as { __v2: PlayDebug }).__v2 = mountPlay(root, {
    state, t, i1: DEMO_I1, waveMax: DEMO_WAVES, skills: DEMO_SKILLS, cash: DEMO_CASH, level: DEMO_LEVEL,
  });
}

boot().catch((err: unknown) => {
  document.body.textContent = String(err);
  throw err;
});
