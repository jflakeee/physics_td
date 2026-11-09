import type { LoadedMap } from './map.ts';
import { bresenham } from '../rules/effects.ts';

/**
 * Map design guide checks (GD §26.2, DETAILED §11.2 "로드 시 검증").
 * - zones: 6–12, each 4–16 tiles
 * - inlets: 2–4, each inlet → base core ≥ 30 cells (4-neighbour path length)
 * - pump sites: 2–4, each 3–6 cells (Chebyshev) from the nearest inlet path and never on one
 * - glacier lakes: the settled lake surface stays below the lowest rim top (no spill at load)
 * - character targets: each released character's basic skill has ≥ 2 target zones
 * Inlet path = the straight line from the inlet's middle cell to the base centre (the basin
 * is a cone, so water runs roughly radially).
 */

export interface MapIssue { rule: string; detail: string; }

/** Straight inlet → base paths, as cell indices. */
export function inletPaths(m: LoadedMap): number[][] {
  const W = m.terrain.grid.width, bx = m.terrain.baseX, by = m.terrain.baseY;
  return m.world.inlets.map(inl => {
    const c = inl.cells[inl.cells.length >> 1];
    return bresenham(c % W, (c / W) | 0, bx, by).map(([x, y]) => y * W + x);
  });
}

export function validateMap(m: LoadedMap, basics: { id: string; zoneTypes: string[] }[] = []): MapIssue[] {
  const out: MapIssue[] = [];
  const W = m.terrain.grid.width;
  const zones = m.zones.zones;
  if (zones.length < 6 || zones.length > 12) out.push({ rule: 'zoneCount', detail: `${zones.length} zones` });
  for (const z of zones) if (z.tiles.length < 4 || z.tiles.length > 16) out.push({ rule: 'zoneSize', detail: `zone ${z.id} (${z.type}) has ${z.tiles.length} tiles` });
  const n = m.world.inlets.length;
  if (n < 2 || n > 4) out.push({ rule: 'inletCount', detail: `${n} inlets` });
  for (const inl of m.world.inlets) {
    let best = Infinity;
    for (const c of inl.cells) best = Math.min(best, m.terrain.distToBase[c]);
    if (best < 30) out.push({ rule: 'inletDistance', detail: `inlet ${inl.id} is ${best} cells from the base` });
  }
  const paths = inletPaths(m);
  const np = m.world.pumps.length;
  if (np < 2 || np > 4) out.push({ rule: 'pumpCount', detail: `${np} pump sites` });
  for (const p of m.world.pumps) {
    const px = p.cell % W, py = (p.cell / W) | 0;
    let d = Infinity;
    for (const path of paths) for (const c of path) d = Math.min(d, Math.max(Math.abs(c % W - px), Math.abs(((c / W) | 0) - py)));
    if (d < 3 || d > 6) out.push({ rule: 'pumpOffPath', detail: `pump ${p.id} is ${d} cells from the nearest inlet path (want 3–6)` });
  }
  for (const b of basics) {
    const n = zones.filter(z => z.type !== 'base' && (b.zoneTypes.length === 0 || b.zoneTypes.includes(z.type))).length;
    if (n < 2) out.push({ rule: 'characterTargets', detail: `${b.id} has ${n} target zone(s)` });
  }
  const g = m.terrain.grid;
  for (const L of m.lakes) {
    let surf = -Infinity, rimTop = Infinity;
    for (const c of L.inside) if (g.w[c] > 1e-3) surf = Math.max(surf, g.h[c] + g.w[c]);
    for (const c of L.rim) rimTop = Math.min(rimTop, g.h[c] + g.ice[c]);
    let spilled = 0;
    for (const c of L.rim) spilled += g.w[c];
    if (surf >= rimTop || spilled > 1e-3) out.push({ rule: 'lakeSpill', detail: `lake ${L.id}: surface ${surf.toFixed(3)} vs rim top ${rimTop.toFixed(3)}, ${spilled.toFixed(3)} on the rim` });
  }
  return out;
}
