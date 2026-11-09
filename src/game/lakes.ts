import type { SimWorld } from '../core/types.ts';
import { TILE } from '../sim/grid.ts';
import { placeIce } from '../sim/ice.ts';
import { stepFluidOnly } from '../sim/step.ts';
import { traceAdded, traceMark } from '../sim/trace.ts';

/**
 * Glacier lakes (brief: 빙하호 붕괴; Story 001 decision 2). A lake is a tile rectangle
 * whose border cells carry glacier ice (`rim`, melting at `glacierMelt`) and whose inside
 * holds `water`. When the thinnest rim cell is at `breakAt`, the whole rim shatters into
 * water (outburst). A warning fires when the predicted break is ≤ `warnTicks` away
 * (3 s, Story 004). Freezing water back onto the rim (freeze skill) pushes it back.
 */

export interface LakeDef { tiles: [number, number, number, number]; water: number; rim: number; breakAt: number; }

export interface Lake { id: number; rim: Uint32Array; inside: Uint32Array; breakAt: number; warned: boolean; broken: boolean; }

export type LakeEvent = { t: 'lakeWarning'; lake: number; inTicks: number } | { t: 'lakeBurst'; lake: number };

export const LAKE_WARN_TICKS = 90;

/** Place lakes on the grid and let the water settle behind the rim (melting off). */
export function placeLakes(world: SimWorld, defs: readonly LakeDef[]): Lake[] {
  const g = world.grid, W = g.width;
  const lakes = defs.map((d, id) => {
    const [x0, y0, x1, y1] = d.tiles, rim: number[] = [], inside: number[] = [];
    for (let y = y0 * TILE; y < (y1 + 1) * TILE; y++) for (let x = x0 * TILE; x < (x1 + 1) * TILE; x++) {
      const edge = y === y0 * TILE || y === (y1 + 1) * TILE - 1 || x === x0 * TILE || x === (x1 + 1) * TILE - 1;
      (edge ? rim : inside).push(y * W + x);
    }
    placeIce(g, rim, d.rim, true);
    for (const c of inside) g.w[c] += d.water / inside.length;
    return { id, rim: Uint32Array.from(rim), inside: Uint32Array.from(inside), breakAt: d.breakAt, warned: false, broken: false };
  });
  if (lakes.length) {
    const melt = world.cfg.glacierMelt, ice = world.cfg.iceMelt, frac = world.cfg.iceFractureHead;
    world.cfg.glacierMelt = 0; world.cfg.iceMelt = 0; world.cfg.iceFractureHead = 0;
    for (let k = 0; k < 1500; k++) stepFluidOnly(world);
    world.cfg.glacierMelt = melt; world.cfg.iceMelt = ice; world.cfg.iceFractureHead = frac;
  }
  return lakes;
}

/** Per wave tick: warn 3 s ahead, then burst. Returns events. */
export function tickLakes(world: SimWorld, lakes: Lake[], out: LakeEvent[]): void {
  const g = world.grid, rate = world.cfg.glacierMelt;
  for (const L of lakes) {
    if (L.broken) continue;
    let m = Infinity;
    for (const c of L.rim) if (g.ice[c] < m) m = g.ice[c];
    if (m <= L.breakAt) {
      const tr = world.trace;
      if (tr) traceMark(tr, g.w);
      for (const c of L.rim) { g.w[c] += g.ice[c]; g.ice[c] = 0; }
      if (tr) traceAdded(tr, g.w, 0, () => tr.ice);
      L.broken = true;
      out.push({ t: 'lakeBurst', lake: L.id });
      continue;
    }
    const eta = rate > 0 ? (m - L.breakAt) / rate : Infinity;
    if (eta <= LAKE_WARN_TICKS) { if (!L.warned) { L.warned = true; out.push({ t: 'lakeWarning', lake: L.id, inTicks: Math.ceil(eta) }); } }
    else L.warned = false; // refrozen: a new warning will come
  }
}
