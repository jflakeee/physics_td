/**
 * Map data loader (docs/DETAILED_DESIGN_V2.md 11.1-11.2) with the map design guide
 * check of docs/GAME_DESIGN_V2.md 26.2 at the data boundary: a map that breaks the
 * guide fails to load.
 */
import type { SimState } from '../core/types.ts';
import { GRID_H, GRID_W, TILE_SIZE, TILE_TYPES, TILES_X, TILES_Y } from '../sim/constants.ts';
import { createSim } from '../sim/step.ts';
import type { GateSpec, LakeSpec } from '../sim/terrain.ts';
import type { WaveParams } from '../sim/waves.ts';
import { arr, fail, num, obj, oneOf, str } from '../rules/validate.ts';
import type { Obj } from '../rules/validate.ts';

/** Guide limits (spec 26.2). */
export const GUIDE = {
  zones: [6, 12], tilesPerZone: [4, 16], inlets: [2, 4], pumps: [2, 4],
  minPathCells: 30, pumpPathDist: [3, 6], minZonesOnPath: 2,
} as const;

/** One validated map. */
export interface MapData {
  id: string;
  region: 'flood' | 'glacier';
  order: number;
  /** i18n key prefix (`<i18n>.name`, `<i18n>.blurb`). */
  i18n: string;
  tiles: string[];
  zones: string[];
  noiseSalt: number;
  /** Inlet tiles in tile scan order (same order as `SimState.inlets`). */
  inlets: { tile: [number, number]; weight: number }[];
  /** Pump spots as cell coordinates [x, y] (cells, not tiles: the guide's 3-6 cell offset needs cell precision). */
  pumps: [number, number][];
  gates: GateSpec[];
  lake: LakeSpec | null;
  waves: WaveParams;
  start: { cash: number; level: number; waveIncome: number };
  /** Runs the tutorial on first play. */
  tutorial: boolean;
  /** Shows the "start here" badge on first run. */
  startHere: boolean;
}

const tile = (v: unknown, where: string): [number, number] => {
  if (!Array.isArray(v) || v.length !== 2 || !v.every((n) => Number.isInteger(n))) fail(where, 'tile must be [tx, ty]');
  const [tx, ty] = v as number[];
  if (tx < 0 || ty < 0 || tx >= TILES_X || ty >= TILES_Y) fail(where, `tile [${tx},${ty}] outside the map`);
  return [tx, ty];
};

const cell = (v: unknown, where: string): [number, number] => {
  if (!Array.isArray(v) || v.length !== 2 || !v.every((n) => Number.isInteger(n))) fail(where, 'cell must be [x, y]');
  const [x, y] = v as number[];
  if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) fail(where, `cell [${x},${y}] outside the map`);
  return [x, y];
};

const rows = (o: Obj, k: string, where: string, ok: RegExp): string[] => {
  const r = arr(o, k, where);
  if (r.length !== TILES_Y || !r.every((s) => typeof s === 'string' && s.length === TILES_X && ok.test(s))) {
    fail(where, `"${k}" must be ${TILES_Y} strings of ${TILES_X} chars matching ${ok}`);
  }
  return r as string[];
};

/**
 * Validate one map JSON (schema + guide).
 * @example const map = parseMap(await read('data/maps/dike-village.json'), 'dike-village');
 */
export function parseMap(raw: unknown, where: string): MapData {
  const o = obj(raw, where);
  const tiles = rows(o, 'tiles', where, new RegExp(`^[${Object.keys(TILE_TYPES).join('')}]+$`));
  const zones = rows(o, 'zones', where, /^[a-z.]+$/);
  const w = obj(o.waves, `${where}.waves`);
  const s = obj(o.start, `${where}.start`);
  const inlets = arr(o, 'inlets', where).map((r, k) => {
    const io = obj(r, `${where}.inlets[${k}]`);
    return { tile: tile(io.tile, `${where}.inlets[${k}]`), weight: num(io, 'weight', `${where}.inlets[${k}]`, 0) };
  });
  const gates = arr(o, 'gates', where).map((r, k): GateSpec => {
    const go = obj(r, `${where}.gates[${k}]`);
    return { tile: tile(go.tile, `${where}.gates[${k}]`), axis: oneOf(go, 'axis', where, ['h', 'v']), height: num(go, 'height', where, 0), open: go.open !== false };
  });
  let lake: LakeSpec | null = null;
  if (o.lake !== undefined && o.lake !== null) {
    const lo = obj(o.lake, `${where}.lake`);
    lake = { tiles: arr(lo, 'tiles', where).map((t, k) => tile(t, `${where}.lake.tiles[${k}]`)), depth: num(lo, 'depth', where, 0), damIce: num(lo, 'damIce', where, 0) };
    for (const [tx, ty] of lake.tiles) if (tiles[ty][tx] !== 'R') fail(`${where}.lake`, `lake tile [${tx},${ty}] must be R`);
  }
  const map: MapData = {
    id: str(o, 'id', where), region: oneOf(o, 'region', where, ['flood', 'glacier']), order: num(o, 'order', where), i18n: str(o, 'i18n', where),
    tiles, zones, noiseSalt: num(o, 'noiseSalt', where), inlets,
    pumps: arr(o, 'pumps', where).map((p, k) => cell(p, `${where}.pumps[${k}]`)),
    gates, lake,
    waves: { i1: num(w, 'I1', where, 0), rain: num(w, 'rain', where, 0), pulseEvery: num(w, 'pulseEvery', where, 1), weights: inlets.map((i) => i.weight) },
    start: { cash: num(s, 'cash', where, 0), level: num(s, 'level', where, 1), waveIncome: num(s, 'waveIncome', where, 0) },
    tutorial: o.tutorial === true, startHere: o.startHere === true,
  };
  const scan: string[] = [];
  for (let ty = 0; ty < TILES_Y; ty++) for (let tx = 0; tx < TILES_X; tx++) if (tiles[ty][tx] === 'I') scan.push(`${tx},${ty}`);
  if (scan.join(' ') !== inlets.map((i) => i.tile.join(',')).join(' ')) fail(where, `"inlets" must list the I tiles in scan order: ${scan.join(' ')}`);
  const bad = guideViolations(map);
  if (bad.length > 0) fail(where, `map guide violations:\n  ${bad.join('\n  ')}`);
  return map;
}

/**
 * Create the sim state of a map: terrain, zones, gates, lake, pumps (all off).
 * @param maxPumpsOn Pump cap from `data/skills/pump.json`.
 * @example const state = createMapSim(map, 2);
 */
export function createMapSim(map: MapData, maxPumpsOn?: number): SimState {
  const state = createSim(map.tiles, map.waves.i1, map.noiseSalt, { zones: map.zones, gates: map.gates, lake: map.lake ?? undefined, maxPumpsOn });
  map.pumps.forEach(([x, y], id) => state.pumps.push({ id, cell: y * GRID_W + x, on: false }));
  return state;
}

/**
 * Straight cell path from each inlet strip's middle to the base centre (Bresenham),
 * the "inflow path" the guide measures.
 * @example const paths = inflowPaths(state);
 */
export function inflowPaths(state: SimState): number[][] {
  const [cx, cy] = [state.base[4] % GRID_W, Math.floor(state.base[4] / GRID_W)];
  return state.inlets.map((strip) => {
    const m = strip[strip.length >> 1];
    let x = m % GRID_W;
    let y = Math.floor(m / GRID_W);
    const dx = Math.abs(cx - x);
    const dy = -Math.abs(cy - y);
    const sx = x < cx ? 1 : -1;
    const sy = y < cy ? 1 : -1;
    let err = dx + dy;
    const path = [y * GRID_W + x];
    while (x !== cx || y !== cy) {
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
      path.push(y * GRID_W + x);
    }
    return path;
  });
}

/**
 * Map design guide check (spec 26.2): zone count and size, inlet count, path length,
 * zones crossed per path, pump spots 3-6 cells off the nearest inflow path.
 * @returns human readable violations (empty = ok).
 * @example if (guideViolations(map).length) throw ...
 */
export function guideViolations(map: MapData): string[] {
  const out: string[] = [];
  const state = createMapSim(map);
  const { zones } = state;
  const inRange = (v: number, [lo, hi]: readonly [number, number]): boolean => v >= lo && v <= hi;
  if (!inRange(zones.count, GUIDE.zones)) out.push(`zone count ${zones.count} not in ${GUIDE.zones.join('-')}`);
  zones.cells.forEach((c, z) => {
    const n = c.length / (TILE_SIZE * TILE_SIZE);
    if (!inRange(n, GUIDE.tilesPerZone)) out.push(`zone ${z} has ${n} tiles, not ${GUIDE.tilesPerZone.join('-')}`);
  });
  if (!inRange(state.inlets.length, GUIDE.inlets)) out.push(`inlet count ${state.inlets.length} not in ${GUIDE.inlets.join('-')}`);
  const paths = inflowPaths(state);
  paths.forEach((p, k) => {
    if (p.length < GUIDE.minPathCells) out.push(`inlet ${k} path ${p.length} cells < ${GUIDE.minPathCells}`);
    const crossed = new Set(p.map((c) => state.grid.zoneId[c]).filter((z) => z < zones.count));
    if (crossed.size < GUIDE.minZonesOnPath) out.push(`inlet ${k} path crosses ${crossed.size} zones < ${GUIDE.minZonesOnPath}`);
  });
  if (!inRange(map.pumps.length, GUIDE.pumps)) out.push(`pump count ${map.pumps.length} not in ${GUIDE.pumps.join('-')}`);
  state.pumps.forEach((p, k) => {
    let d = Infinity;
    for (const path of paths) for (const c of path) d = Math.min(d, Math.hypot((c % GRID_W) - (p.cell % GRID_W), Math.floor(c / GRID_W) - Math.floor(p.cell / GRID_W)));
    if (!inRange(d, GUIDE.pumpPathDist)) out.push(`pump ${k} at [${map.pumps[k]}] is ${d.toFixed(1)} cells from the nearest inflow path, not ${GUIDE.pumpPathDist.join('-')}`);
  });
  return out;
}

/**
 * Load every map listed under `maps` in data/index.json, sorted by `order`.
 * @example const maps = await loadMaps(async (p) => (await fetch(p)).json());
 */
export async function loadMaps(read: (path: string) => Promise<unknown>): Promise<MapData[]> {
  const index = obj(await read('data/index.json'), 'data/index.json');
  const maps: MapData[] = [];
  for (const p of arr(index, 'maps', 'data/index.json')) maps.push(parseMap(await read(String(p)), String(p)));
  return maps.sort((a, b) => a.order - b.order);
}
