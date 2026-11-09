import type { ZoneMap } from './zones.ts';
import { TILE } from './grid.ts';

/**
 * Levee lines (DETAILED_DESIGN_V2 §11.2): per zone, the tile edges on its boundary that face
 * away from the base, joined into straight runs. "Away" = the edge normal is within 60° of the
 * radial direction base → tile (§11.2 compares BFS distance, which is Manhattan-like and also
 * marks the side edges of a compass sector as outward).
 * Each line is the 1-cell strip just inside the edge; `facing` is the outward normal.
 * Longest first, at most 3 per zone. Map data may author lines instead (story 004).
 */

export interface LeveeLine { id: number; zone: number; cells: Uint32Array; facing: [number, number]; }

const SIDES: { d: [number, number] }[] = [{ d: [0, -1] }, { d: [0, 1] }, { d: [-1, 0] }, { d: [1, 0] }];

/** Build levee lines for every non-base zone. (baseX, baseY) = base centre cell. */
export function buildLeveeLines(z: ZoneMap, W: number, Hc: number, baseX: number, baseY: number, maxPerZone = 3): LeveeLine[][] {
  const tw = W / TILE, th = Hc / TILE;
  const zoneOfTile = (tx: number, ty: number) => z.zoneOf[(ty * TILE + TILE / 2) * W + tx * TILE + TILE / 2];
  const outward = (tx: number, ty: number, dx: number, dy: number) => {
    const rx = tx * TILE + TILE / 2 - (baseX + 0.5), ry = ty * TILE + TILE / 2 - (baseY + 0.5), r = Math.hypot(rx, ry) || 1;
    return (rx * dx + ry * dy) / r >= 0.5;
  };
  let nextId = 0;
  return z.zones.map(zone => {
    if (zone.type === 'base') return [];
    // outward edges grouped by side, keyed by the line coordinate perpendicular to the side
    const runs: { side: number; fixed: number; from: number; to: number }[] = [];
    for (let s = 0; s < 4; s++) {
      const [dx, dy] = SIDES[s].d;
      const edges = zone.tiles.filter(([tx, ty]) => {
        const nx = tx + dx, ny = ty + dy;
        if (nx < 0 || ny < 0 || nx >= tw || ny >= th) return false;
        return zoneOfTile(nx, ny) !== zone.id && outward(tx, ty, dx, dy);
      });
      // group collinear contiguous edges: horizontal sides share ty, vertical share tx
      const key = (t: [number, number]) => dy !== 0 ? t[1] : t[0];
      const along = (t: [number, number]) => dy !== 0 ? t[0] : t[1];
      const byLine = new Map<number, number[]>();
      for (const t of edges) { const k = key(t); if (!byLine.has(k)) byLine.set(k, []); byLine.get(k)!.push(along(t)); }
      for (const [fixed, list] of [...byLine.entries()].sort((a, b) => a[0] - b[0])) {
        list.sort((a, b) => a - b);
        let a = list[0], b = list[0];
        for (let k = 1; k <= list.length; k++) {
          if (k < list.length && list[k] === b + 1) { b = list[k]; continue; }
          runs.push({ side: s, fixed, from: a, to: b });
          if (k < list.length) { a = list[k]; b = list[k]; }
        }
      }
    }
    runs.sort((p, q) => (q.to - q.from) - (p.to - p.from) || p.side - q.side || p.fixed - q.fixed || p.from - q.from);
    return runs.slice(0, maxPerZone).map(r => {
      const [dx, dy] = SIDES[r.side].d, cells: number[] = [];
      for (let t = r.from; t <= r.to; t++) for (let k = 0; k < TILE; k++) {
        let x: number, y: number;
        if (dy !== 0) { x = t * TILE + k; y = dy < 0 ? r.fixed * TILE : r.fixed * TILE + TILE - 1; }
        else { y = t * TILE + k; x = dx < 0 ? r.fixed * TILE : r.fixed * TILE + TILE - 1; }
        cells.push(y * W + x);
      }
      return { id: nextId++, zone: zone.id, cells: Uint32Array.from(cells), facing: [dx, dy] as [number, number] };
    });
  });
}
