import dike from '../../../data/maps/dike-village.json' with { type: 'json' };
import willow from '../../../data/maps/willow-fields.json' with { type: 'json' };
import meadow from '../../../data/maps/glacier-meadow.json' with { type: 'json' };
import valley from '../../../data/maps/glacier-lake-valley.json' with { type: 'json' };
import type { MapData } from '../../../src/game/map.ts';

/** The 4 shipped maps (brief: 강 유역 2 + 빙하시대 2). */
export const MAPS: readonly MapData[] = [dike, willow, meadow, valley] as unknown as MapData[];
export const byId = (id: string) => MAPS.find(m => m.id === id)!;
