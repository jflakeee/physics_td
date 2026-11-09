import { CHARACTERS, ECONOMY, FUSIONS, SKILLS } from './catalog.ts';
import { MAPS } from './maps.ts';
import endings from '../../data/endings.json' with { type: 'json' };
import type { EndingsData } from '../rules/endings.ts';

export const ENDINGS = endings as unknown as EndingsData;

/** FNV-1a of every data file: a saved run is resumable only with the same data (GD §20). */
export const DATA_VERSION = (() => {
  const s = JSON.stringify([SKILLS, CHARACTERS, ECONOMY, FUSIONS, MAPS, ENDINGS]);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, '0');
})();
