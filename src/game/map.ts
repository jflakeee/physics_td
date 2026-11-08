import type { Gate, SimWorld } from '../core/types.ts';
import { FLAG, ZT } from '../core/types.ts';
import { TILE } from '../sim/grid.ts';
import { buildTerrain } from '../sim/terrain.ts';
import type { Terrain } from '../sim/terrain.ts';
import { buildZones } from '../sim/zones.ts';
import type { ZoneMap } from '../sim/zones.ts';
import { buildLeveeLines } from '../sim/leveeLines.ts';
import type { LeveeLine } from '../sim/leveeLines.ts';
import { initEcology } from '../sim/metrics.ts';
import { placeLakes } from './lakes.ts';
import type { Lake, LakeDef } from './lakes.ts';
import { createWorld } from '../sim/step.ts';
import { addPump } from '../sim/sinks.ts';
import { setGate } from '../sim/structures.ts';

/** Map data file (DETAILED_DESIGN_V2 §11.1, subset used so far). */
export interface MapData {
  id: string;
  /** i18n key prefix for the map name. */
  name?: string;
  order?: number;
  /** Number of waves (GD §17: 5). */
  waves?: number;
  lakes?: LakeDef[];
  tiles: string[];
  zones?: string[];
  inlets?: { weights: number[] }[];
  /** Pump sites in tile coordinates (tile centre cell). */
  pumps: [number, number][];
  gates: { tiles: [number, number][]; kind?: 'normal' | 'reservoir'; open: boolean }[];
  /** Region id; selects regional skill variants (e.g. 'glacier'). Default 'river'. */
  region?: string;
  I1: number;
  rain?: number;
  pulseEvery?: number;
  start: { cash: number; hp: number };
}

/** Everything the play screen needs from a loaded map. */
export interface LoadedMap { data: MapData; terrain: Terrain; zones: ZoneMap; world: SimWorld; leveeLines: LeveeLine[][]; lakes: Lake[]; }

/** Build terrain, zones, world, pumps and gates from map data. */
export function loadMap(data: MapData): LoadedMap {
  const terrain = buildTerrain(data.tiles, undefined, data.inlets?.map(i => i.weights));
  const zones = buildZones(terrain.grid, data.tiles, terrain.baseX, terrain.baseY, data.zones);
  const world = createWorld(terrain, { I1: data.I1, rain: data.rain, pulseEvery: data.pulseEvery },
    { cash: data.start.cash, hp: data.start.hp });
  const W = terrain.grid.width;
  for (const z of zones.zones) for (let k = 0; k < z.cells.length; k++) terrain.grid.ztype[z.cells[k]] = ZT[z.type];
  initEcology(world);
  const leveeLines = buildLeveeLines(zones, W, terrain.grid.height, terrain.baseX, terrain.baseY);
  for (const [tx, ty] of data.pumps) addPump(world, (ty * TILE + TILE / 2) * W + tx * TILE + TILE / 2);
  data.gates.forEach((gd, k) => {
    const cells: number[] = [];
    for (const [tx, ty] of gd.tiles)
      for (let y = ty * TILE; y < ty * TILE + TILE; y++) for (let x = tx * TILE; x < tx * TILE + TILE; x++) {
        const i = y * W + x; cells.push(i); terrain.grid.flags[i] |= FLAG.gateCell;
      }
    const gate: Gate = { id: k, cells: Uint32Array.from(cells), open: gd.open };
    world.gates.push(gate);
    setGate(world, k, gd.open);
  });
  const lakes = placeLakes(world, data.lakes ?? []);
  return { data, terrain, zones, world, leveeLines, lakes };
}
