/** Fixtures for skill tests. */
import dikeVillage from '../../../data/maps/dike-village.json' with { type: 'json' };
import { loadMap } from '../../../src/game/map.ts';
import type { MapData } from '../../../src/game/map.ts';
import { CHARACTERS, ECONOMY, SKILLS } from '../../../src/data/catalog.ts';
import { createRules } from '../../../src/rules/skills.ts';
import type { RulesState } from '../../../src/rules/skills.ts';

export const DIKE: MapData = dikeVillage as unknown as MapData;

/**
 * 둑마을 as it was when the skill rules were written: no field zone, automatic levee lines
 * only (several per zone). Pins the rule tests to a fixed layout independent of map tuning.
 */
export const DIKE_AUTO: MapData = {
  ...DIKE,
  tiles: ['PPPIPPPO', 'PPFPPPPP', 'PPPPPPFP', 'PDPPPPPP', 'PPPPPPPP', 'IPPBBPPP', 'PPPBBPPI', 'PPPPPPPP', 'PPFPPPDP', 'PPPPPPPP', 'PPPPFPPP', 'OPPPIPPP'],
  leveeLines: undefined,
};

/** 버드나무 들 tiles (§11.3) with an authored zone layer giving field and wetland zones. */
export const WILLOW: MapData = {
  ...DIKE, id: 'willow-test',
  tiles: ['PPPOPPPP', 'PFPPPPFP', 'PPPPPPPP', 'PDDPPDDP', 'PDDPPDDP', 'PPPBBPPP', 'PPPBBPPP', 'PDDPPDDP', 'PDDPPWWP', 'PWWPPWWP', 'PPPPPPPP', 'PPPIIPPP'],
  zones: ['aaaabbbb', 'aaaabbbb', 'aaaabbbb', 'cffcdggd', 'cffcdggd', 'cccZZddd', 'cccZZddd', 'ehhejiij', 'ehhejkkj', 'ellejkkj', 'eeeejjjj', 'eeeejjjj'],
  I1: 140,
};

export const dikeKeeper = CHARACTERS.find(c => c.id === 'dike-keeper')!;
export const wetland = CHARACTERS.find(c => c.id === 'wetland-researcher')!;

/** Rules on a fresh map. `wave` toggles whether the run is in a wave phase. */
export function setup(data: MapData, char = dikeKeeper, start?: string[]) {
  const map = loadMap(data);
  const phase = { wave: false };
  const rs: RulesState = createRules(map, SKILLS, char, ECONOMY, () => phase.wave, start);
  return { map, rs, phase, world: map.world };
}

/** Zone ids of a given type. */
export const zonesOf = (rs: RulesState, type: string) => rs.map.zones.zones.filter(z => z.type === type).map(z => z.id);
