import pump from '../../data/skills/pump.json' with { type: 'json' };
import freeze from '../../data/skills/freeze.json' with { type: 'json' };
import dikePassive from '../../data/skills/dike-passive.json' with { type: 'json' };
import buildLevee from '../../data/skills/build-levee.json' with { type: 'json' };
import sandbag from '../../data/skills/sandbag.json' with { type: 'json' };
import nightRepair from '../../data/skills/night-repair.json' with { type: 'json' };
import wetlandPassive from '../../data/skills/wetland-passive.json' with { type: 'json' };
import openFloodplain from '../../data/skills/open-floodplain.json' with { type: 'json' };
import restoreWetland from '../../data/skills/restore-wetland.json' with { type: 'json' };
import riverBreath from '../../data/skills/river-breath.json' with { type: 'json' };
import dikeKeeper from '../../data/characters/dike-keeper.json' with { type: 'json' };
import wetlandResearcher from '../../data/characters/wetland-researcher.json' with { type: 'json' };
import economy from '../../data/economy.json' with { type: 'json' };
import type { CharacterDef, EconomyDef, SkillDef } from '../rules/types.ts';

/** All shipped data, typed. One place to add a skill or character file. */
export const SKILLS: readonly SkillDef[] = [pump, freeze, dikePassive, buildLevee, sandbag, nightRepair,
  wetlandPassive, openFloodplain, restoreWetland, riverBreath] as unknown as SkillDef[];
export const CHARACTERS: readonly CharacterDef[] = [dikeKeeper, wetlandResearcher] as unknown as CharacterDef[];
export const ECONOMY = economy as EconomyDef;
