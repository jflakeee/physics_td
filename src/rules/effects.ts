/**
 * Effect op registry (docs/DETAILED_DESIGN_V2.md 6.3-6.5). Skills are defined purely as
 * lists of these ops; every number comes from the op arguments in data/skills/*.json.
 * Ops change the sim only through existing sim functions (structures, ice) or grid arrays.
 */
import type { LeveeLine, SimMods, SimState } from '../core/types.ts';
import { FLAG_BASE_CORE, FLAG_INLET, GRID_H, GRID_W, LEVEE_START_DURABILITY, TICKS_PER_SEC, ZONE } from '../sim/constants.ts';
import { freezeSkillIce } from '../sim/ice.ts';
import { buildLevee, placeTempWall } from '../sim/structures.ts';
import { zoneCells, zoneType } from '../input/hit.ts';
import { arr, fail, num, obj, oneOf, str } from './validate.ts';
import type { Obj } from './validate.ts';

/** Sim modifier keys an op may change. */
export const MOD_KEYS = ['wallDurabilityMul', 'absorbMul'] as const satisfies readonly (keyof SimMods)[];

/**
 * Levee that gets +topUp (capped) once all lines of the zone exist; `material: "ice"` makes an
 * ice dam that melts `melt` per second (required for ice) and is exempt from the lake collapse.
 * Ice priority: re-freeze the thinnest melting line to its built height, else build a new line, else raise.
 */
export interface BuildLeveeOp {
  op: 'buildLevee'; height: number; topUp: number; cap: number; material: 'wall' | 'ice'; melt: number;
  /** Ice only: a built line whose thinnest cell is below this fraction of its built height counts as melting and is re-frozen first. */
  refreezeBelow: number;
  /** Ice only: cash cost of a cast that re-freezes a melting line (instead of the skill's `cost`). */
  refreezeCost: number;
}
/** Temporary wall on a swipe path; `ttl` in seconds. */
export interface TempWallPathOp { op: 'tempWallPath'; height: number; ttl: number; maxCells: number; width: number; exclusionRadius: number }
export interface RepairAllOp { op: 'repairAll'; addHeight: number }
export interface LowerZoneOp { op: 'lowerZone'; dh: number }
/** Convert the zone to zone type `to` after `ttl` seconds. */
export interface ConvertZoneOp { op: 'convertZone'; to: keyof typeof ZONE; ttl: number }
/** Change a sim modifier; `ttl` (seconds) schedules the undo. */
export interface ModifierOp { op: 'modifier'; key: (typeof MOD_KEYS)[number]; value: number; mode: 'set' | 'mul' | 'add'; ttl?: number }
export interface FreezeZoneOp { op: 'freezeZone'; ratio: number }
export type Op = BuildLeveeOp | TempWallPathOp | RepairAllOp | LowerZoneOp | ConvertZoneOp | ModifierOp | FreezeZoneOp;

export type { LeveeLine };

/** A delayed effect (ttl) waiting for `state.tick >= at`. */
export type Scheduled =
  | { at: number; kind: 'convert'; zone: number; from: number; to: number }
  | { at: number; kind: 'modifier'; key: (typeof MOD_KEYS)[number]; mode: 'set' | 'mul' | 'add'; value: number; prior: number };

/** Mutable bookkeeping the ops need between calls (one per run). */
export interface EffectEnv {
  timers: Scheduled[];
  /** Zones opened by `lowerZone`. */
  opened: Set<number>;
  /** cell -> height added by `repairAll`, reverted at wave end. */
  repaired: Map<number, number>;
  /** cell -> full height of the skill ice dam built there (what a re-freeze restores). */
  iceBuilt: Map<number, number>;
  /** Levee lines of a zone (the map's, derived at load from the zone layer). */
  leveeLines(zone: number): readonly LeveeLine[];
  /** Weights of the next wave's inlets (spec 6.4); falls back to the current wave plan. */
  nextWeights?: readonly number[];
}

/** What an op acts on: a zone id (-1 none) and swipe cells (already converted from screen). */
export interface OpTarget { zone: number; cells: readonly number[] }

/**
 * Fresh effect bookkeeping.
 * @param leveeLines Levee lines of a zone: the map's real lines (`state.zones.lines`).
 * @example const env = createEffectEnv((z) => state.zones.lines[z]);
 */
export function createEffectEnv(leveeLines: (zone: number) => readonly LeveeLine[]): EffectEnv {
  return { timers: [], opened: new Set(), repaired: new Map(), iceBuilt: new Map(), leveeLines };
}

/**
 * Validate one op from JSON.
 * @example const op = parseOp(raw, 'skills/pump.json ranks[0]');
 */
export function parseOp(raw: unknown, where: string): Op {
  const o: Obj = obj(raw, where);
  const name = oneOf(o, 'op', where, ['buildLevee', 'tempWallPath', 'repairAll', 'lowerZone', 'convertZone', 'modifier', 'freezeZone']);
  const w = `${where}.${name}`;
  switch (name) {
    case 'buildLevee': {
      const material = o.material === undefined ? 'wall' : oneOf(o, 'material', w, ['wall', 'ice']);
      const melt = material === 'ice' ? num(o, 'melt', w, 0) : 0;
      const refreezeBelow = material === 'ice' ? num(o, 'refreezeBelow', w, 0) : 0;
      const refreezeCost = material === 'ice' ? num(o, 'refreezeCost', w, 0) : 0;
      return { op: name, height: num(o, 'height', w, 0), topUp: num(o, 'topUp', w, 0), cap: num(o, 'cap', w, 0), material, melt, refreezeBelow, refreezeCost };
    }
    case 'tempWallPath':
      return {
        op: name, height: num(o, 'height', w, 0), ttl: num(o, 'ttl', w, 0), maxCells: num(o, 'maxCells', w, 1),
        width: num(o, 'width', w, 1), exclusionRadius: num(o, 'exclusionRadius', w, 0),
      };
    case 'repairAll':
      return { op: name, addHeight: num(o, 'addHeight', w, 0) };
    case 'lowerZone':
      return { op: name, dh: num(o, 'dh', w, 0) };
    case 'convertZone': {
      const to = str(o, 'to', w);
      if (!(to in ZONE)) fail(w, `unknown zone type "${to}"`);
      return { op: name, to: to as keyof typeof ZONE, ttl: num(o, 'ttl', w, 0) };
    }
    case 'modifier': {
      const mode = oneOf(o, 'mode', w, ['set', 'mul', 'add']);
      const value = num(o, 'value', w);
      if (mode === 'mul' && value === 0) fail(w, 'mul value must not be 0');
      return { op: name, key: oneOf(o, 'key', w, MOD_KEYS), value, mode, ...(o.ttl === undefined ? {} : { ttl: num(o, 'ttl', w, 0) }) };
    }
    case 'freezeZone': {
      const ratio = num(o, 'ratio', w, 0);
      if (ratio > 1) fail(w, '"ratio" must be <= 1');
      return { op: name, ratio };
    }
  }
}

/**
 * Parse an `ops` array.
 * @example const ops = parseOps(rank, 'rank 1');
 */
export function parseOps(rank: Obj, where: string): Op[] {
  return arr(rank, 'ops', where).map((r, i) => parseOp(r, `${where}.ops[${i}]`));
}

/** Level array a levee op writes to. */
const levelOf = (state: SimState, op: BuildLeveeOp): Float32Array => (op.material === 'ice' ? state.grid.ice : state.grid.wall);
const lineMin = (level: Float32Array, l: LeveeLine): number => l.cells.reduce((m, c) => Math.min(m, level[c]), Infinity);

/**
 * Pick the line to build (spec 6.4): the candidate whose facing best opposes the flow
 * from the heaviest inlet to the base, i.e. faces the incoming water. Ties keep the first.
 * @example const line = pickLine(state, env, candidates);
 */
export function pickLine(state: SimState, env: EffectEnv, candidates: readonly LeveeLine[]): LeveeLine {
  const weights = env.nextWeights ?? state.inflow?.weights ?? [];
  let best = -1;
  for (let k = 0; k < weights.length && k < state.inlets.length; k++) if (best < 0 || weights[k] > weights[best]) best = k;
  const centroid = (cells: readonly number[]): [number, number] => {
    let sx = 0;
    let sy = 0;
    for (const c of cells) {
      sx += c % GRID_W;
      sy += Math.floor(c / GRID_W);
    }
    return [sx / cells.length, sy / cells.length];
  };
  let dx = 0;
  let dy = 0;
  if (best >= 0 && state.inlets[best].length > 0) {
    const [ix, iy] = centroid(state.inlets[best]);
    const [bx, by] = centroid(state.base);
    const len = Math.hypot(bx - ix, by - iy);
    if (len > 0) {
      dx = (bx - ix) / len;
      dy = (by - iy) / len;
    }
  }
  let pick = candidates[0];
  let score = -Infinity;
  for (const l of candidates) {
    const s = -(l.facing[0] * dx + l.facing[1] * dy);
    if (s > score) {
      score = s;
      pick = l;
    }
  }
  return pick;
}

/**
 * The thinnest built ice line of a zone that has melted below `ratio` of its built height
 * (and not away completely), or null.
 * @example const line = meltingIceLine(state, env, env.leveeLines(z), 0.8);
 */
export function meltingIceLine(state: SimState, env: EffectEnv, lines: readonly LeveeLine[], ratio: number): LeveeLine | null {
  const { ice } = state.grid;
  let pick: LeveeLine | null = null;
  let worst = ratio;
  for (const l of lines) {
    let r = Infinity;
    for (const c of l.cells) {
      const built = env.iceBuilt.get(c);
      r = built === undefined ? -1 : Math.min(r, ice[c] / built);
    }
    if (r > 0 && r < worst) {
      worst = r;
      pick = l;
    }
  }
  return pick;
}

/**
 * Cash cost of running `ops` on `zone`: an ice `buildLevee` that would re-freeze a melting
 * line costs its `refreezeCost`; anything else costs `baseCost` (the skill's cost).
 * @example const cost = useCost(state, env, ops, zone, def.cost);
 */
export function useCost(state: SimState, env: EffectEnv, ops: readonly Op[], zone: number, baseCost: number): number {
  for (const op of ops) {
    if (op.op === 'buildLevee' && op.material === 'ice' && meltingIceLine(state, env, env.leveeLines(zone), op.refreezeBelow)) return op.refreezeCost;
  }
  return baseCost;
}

function buildLeveeOp(state: SimState, env: EffectEnv, op: BuildLeveeOp, zone: number): void {
  const g = state.grid;
  const level = levelOf(state, op);
  const lines = env.leveeLines(zone);
  if (lines.length === 0) return;
  const melt = op.melt / TICKS_PER_SEC;
  if (op.material === 'ice') {
    const melting = meltingIceLine(state, env, lines, op.refreezeBelow);
    if (melting) {
      for (const c of melting.cells) freezeSkillIce(g, [c], env.iceBuilt.get(c) as number, melt);
      return;
    }
  }
  const open = lines.filter((l) => lineMin(level, l) <= 0);
  if (open.length > 0) {
    const line = pickLine(state, env, open);
    if (op.material === 'ice') {
      freezeSkillIce(g, line.cells, op.height, melt);
      for (const c of line.cells) env.iceBuilt.set(c, op.height);
    } else {
      buildLevee(g, line.cells.filter((c) => g.wall[c] < op.height), op.height);
      for (const c of line.cells) if (g.wall[c] >= op.height) g.dur[c] = LEVEE_START_DURABILITY;
    }
    return;
  }
  let low = lines[0];
  for (const l of lines) if (lineMin(level, l) < lineMin(level, low)) low = l;
  if (op.material === 'ice') {
    for (const c of low.cells) {
      const hgt = Math.min(op.cap, level[c] + op.topUp);
      freezeSkillIce(g, [c], hgt, melt);
      env.iceBuilt.set(c, hgt);
    }
  } else {
    for (const c of low.cells) level[c] = Math.max(level[c], Math.min(op.cap, level[c] + op.topUp));
  }
}

/**
 * Swipe path to affected cells (spec 6.5). `sampled` = cells under the 8px-sampled
 * screen path. Steps: Bresenham between samples, cut to `maxCells`, widen to `width`
 * (extra cells along the path normal), drop cells within `exclusionRadius` of an
 * inlet or the base core.
 * @example const cells = swipeCells(state, sampled, op);
 */
export function swipeCells(state: SimState, sampled: readonly number[], op: Pick<TempWallPathOp, 'maxCells' | 'width' | 'exclusionRadius'>): number[] {
  const path: number[] = [];
  const seen = new Set<number>();
  const push = (x: number, y: number): void => {
    const c = y * GRID_W + x;
    if (!seen.has(c)) {
      seen.add(c);
      path.push(c);
    }
  };
  for (let k = 0; k < sampled.length; k++) {
    const x1 = sampled[k] % GRID_W;
    const y1 = Math.floor(sampled[k] / GRID_W);
    if (k === 0) {
      push(x1, y1);
      continue;
    }
    let x = sampled[k - 1] % GRID_W;
    let y = Math.floor(sampled[k - 1] / GRID_W);
    const dx = Math.abs(x1 - x);
    const dy = -Math.abs(y1 - y);
    const sx = x < x1 ? 1 : -1;
    const sy = y < y1 ? 1 : -1;
    let err = dx + dy;
    while (x !== x1 || y !== y1) {
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
      push(x, y);
    }
  }
  path.length = Math.min(path.length, op.maxCells);

  const out = new Set<number>(path);
  for (let k = 0; k < path.length; k++) {
    const a = path[Math.min(k, path.length - 2 < 0 ? 0 : path.length - 2)];
    const b = path[Math.min(k + 1, path.length - 1)];
    const horizontal = Math.abs((b % GRID_W) - (a % GRID_W)) >= Math.abs(Math.floor(b / GRID_W) - Math.floor(a / GRID_W));
    for (let e = 1; e < op.width; e++) {
      const x = (path[k] % GRID_W) + (horizontal ? 0 : e);
      const y = Math.floor(path[k] / GRID_W) + (horizontal ? e : 0);
      if (x < GRID_W && y < GRID_H) out.add(y * GRID_W + x);
    }
  }

  const r = op.exclusionRadius;
  const { flags } = state.grid;
  return [...out].filter((c) => {
    const cx = c % GRID_W;
    const cy = Math.floor(c / GRID_W);
    for (let y = Math.max(0, cy - r); y <= Math.min(GRID_H - 1, cy + r); y++) {
      for (let x = Math.max(0, cx - r); x <= Math.min(GRID_W - 1, cx + r); x++) {
        if ((flags[y * GRID_W + x] & (FLAG_INLET | FLAG_BASE_CORE)) !== 0 && (x - cx) ** 2 + (y - cy) ** 2 <= r * r) return false;
      }
    }
    return true;
  });
}

/**
 * Whether running these ops on the zone would change nothing (-> `ALREADY_DONE`).
 * @example if (isRedundant(state, env, ops, zone)) return fail('ALREADY_DONE');
 */
export function isRedundant(state: SimState, env: EffectEnv, ops: readonly Op[], zone: number): boolean {
  return ops.every((op) => {
    if (op.op === 'lowerZone') return env.opened.has(zone);
    if (op.op === 'convertZone') return zoneType(state, zone) === ZONE[op.to] || env.timers.some((t) => t.kind === 'convert' && t.zone === zone);
    if (op.op === 'buildLevee') {
      const level = levelOf(state, op);
      const lines = env.leveeLines(zone);
      return lines.length === 0 || lines.every((l) => lineMin(level, l) >= op.cap);
    }
    return false;
  });
}

/**
 * Run ops against the sim.
 * @example runOps(state, env, rankOps, { zone: 27, cells: [] });
 */
export function runOps(state: SimState, env: EffectEnv, ops: readonly Op[], target: OpTarget): void {
  const g = state.grid;
  for (const op of ops) {
    switch (op.op) {
      case 'buildLevee':
        buildLeveeOp(state, env, op, target.zone);
        break;
      case 'tempWallPath':
        placeTempWall(g, swipeCells(state, target.cells, op), op.height, Math.round(op.ttl * TICKS_PER_SEC));
        break;
      case 'repairAll':
        for (let i = 0; i < g.wall.length; i++) {
          if (g.wall[i] <= 0) continue;
          g.dur[i] = state.mods.wallDurabilityMul;
          g.wall[i] += op.addHeight;
          env.repaired.set(i, (env.repaired.get(i) ?? 0) + op.addHeight);
        }
        break;
      case 'lowerZone':
        for (const c of zoneCells(state, target.zone)) g.h[c] -= op.dh;
        env.opened.add(target.zone);
        break;
      case 'convertZone':
        env.timers.push({
          at: state.tick + Math.round(op.ttl * TICKS_PER_SEC), kind: 'convert', zone: target.zone,
          from: zoneType(state, target.zone), to: ZONE[op.to],
        });
        break;
      case 'modifier': {
        const prior = state.mods[op.key];
        state.mods[op.key] = op.mode === 'set' ? op.value : op.mode === 'mul' ? prior * op.value : prior + op.value;
        if (op.ttl !== undefined) {
          env.timers.push({ at: state.tick + Math.round(op.ttl * TICKS_PER_SEC), kind: 'modifier', key: op.key, mode: op.mode, value: op.value, prior });
        }
        break;
      }
      case 'freezeZone':
        for (const c of zoneCells(state, target.zone)) {
          const moved = g.w[c] * op.ratio;
          g.ice[c] += moved;
          g.w[c] -= moved;
        }
        break;
    }
  }
}

/**
 * Fire due scheduled effects (zone conversions, modifier expiry). Call once per sim tick.
 * @example advanceEffects(state, env);
 */
export function advanceEffects(state: SimState, env: EffectEnv): void {
  env.timers = env.timers.filter((t) => {
    if (t.at > state.tick) return true;
    if (t.kind === 'convert') {
      for (const c of zoneCells(state, t.zone)) if (state.grid.zone[c] === t.from) state.grid.zone[c] = t.to;
    } else if (t.mode === 'set') state.mods[t.key] = t.prior;
    else if (t.mode === 'mul') state.mods[t.key] /= t.value;
    else state.mods[t.key] -= t.value;
    return false;
  });
}

/**
 * Wave end: revert the `repairAll` height bonus on levees that still stand.
 * @example endWaveEffects(state, env);
 */
export function endWaveEffects(state: SimState, env: EffectEnv): void {
  const { wall } = state.grid;
  for (const [i, add] of env.repaired) if (wall[i] > 0) wall[i] = Math.max(0, wall[i] - add);
  env.repaired.clear();
}
