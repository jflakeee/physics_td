import type { SimGrid } from '../core/types.ts';
import { TILE } from './grid.ts';

/**
 * Zones — the player's targeting unit (GD §4.1, §26.1; DETAILED §11.2).
 * Authored `zones` layer (same char = same zone, '.' = none) or, when omitted, automatic
 * sectors: 8 compass directions × 2 rings (inner = tile centre within 25% of the map
 * diagonal from the base), split into 4-connected tile groups. Base tiles form one 'base'
 * zone (a zone, but never a skill target). Zone type = majority tile type.
 */

export type ZoneType = 'plain' | 'forest' | 'hill' | 'field' | 'wetland' | 'reservoir' | 'base';

const TYPE_OF: Readonly<Record<string, ZoneType>> = Object.freeze({
  P: 'plain', F: 'forest', H: 'hill', D: 'field', W: 'wetland', R: 'reservoir', B: 'base', I: 'plain', O: 'plain',
});

export interface Zone {
  /** 1-based id (0 = no zone in `zoneOf`). */
  id: number;
  type: ZoneType;
  /** Tile coordinates [tx, ty]. */
  tiles: [number, number][];
  cells: Uint32Array;
  /** Centroid in cell coordinates. */
  center: [number, number];
}

export interface ZoneMap {
  zones: Zone[];
  /** Zone id per cell (0 = none). */
  zoneOf: Uint8Array;
}

/** Build zones from tile rows and an optional authored layer. */
export function buildZones(g: SimGrid, tiles: readonly string[], baseX: number, baseY: number, layer?: readonly string[]): ZoneMap {
  const th = tiles.length, tw = tiles[0].length;
  const key: string[] = new Array(tw * th);
  const diag = Math.hypot(g.width, g.height);
  for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
    const t = tiles[ty][tx];
    if (layer) { const c = layer[ty][tx]; key[ty * tw + tx] = c === '.' ? '' : 'L' + c; continue; }
    if (t === 'B') { key[ty * tw + tx] = 'base'; continue; }
    const cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2;
    const dx = cx - (baseX + 0.5), dy = cy - (baseY + 0.5);
    const ang = Math.atan2(dx, -dy) * 180 / Math.PI; // 0 = north, clockwise
    const sector = Math.floor((((ang + 22.5) % 360) + 360) % 360 / 45);
    const ring = Math.hypot(dx, dy) <= diag * 0.25 ? 0 : 1;
    key[ty * tw + tx] = `s${sector}r${ring}`;
  }
  // 4-connected components of equal keys, scanned row-major (deterministic ids)
  const comp = new Int32Array(tw * th).fill(-1);
  const groups: number[][] = [];
  for (let s = 0; s < tw * th; s++) {
    if (comp[s] >= 0 || key[s] === '') continue;
    const gid = groups.length, stack = [s], members: number[] = [];
    comp[s] = gid;
    while (stack.length) {
      const k = stack.pop() as number; members.push(k);
      const x = k % tw, y = (k / tw) | 0;
      const nb = [x + 1 < tw ? k + 1 : -1, x > 0 ? k - 1 : -1, y + 1 < th ? k + tw : -1, y > 0 ? k - tw : -1];
      for (const n of nb) if (n >= 0 && comp[n] < 0 && key[n] === key[s]) { comp[n] = gid; stack.push(n); }
    }
    members.sort((a, b) => a - b);
    groups.push(members);
  }
  const zoneOf = new Uint8Array(g.width * g.height);
  const zones: Zone[] = groups.map((members, k) => {
    const count: Record<string, number> = {};
    for (const m of members) { const ty = TYPE_OF[tiles[(m / tw) | 0][m % tw]]; count[ty] = (count[ty] ?? 0) + 1; }
    let type: ZoneType = 'plain', best = -1;
    for (const [ty, n] of Object.entries(count)) if (n > best || (n === best && ty < type)) { best = n; type = ty as ZoneType; }
    if (count.base) type = 'base';
    const cells: number[] = [];
    let sx = 0, sy = 0;
    for (const m of members) {
      const tx = m % tw, ty = (m / tw) | 0;
      for (let y = ty * TILE; y < ty * TILE + TILE; y++) for (let x = tx * TILE; x < tx * TILE + TILE; x++) {
        const i = y * g.width + x; cells.push(i); zoneOf[i] = k + 1; sx += x; sy += y;
      }
    }
    return {
      id: k + 1, type, tiles: members.map(m => [m % tw, (m / tw) | 0] as [number, number]),
      cells: Uint32Array.from(cells), center: [sx / cells.length + 0.5, sy / cells.length + 0.5],
    };
  });
  return { zones, zoneOf };
}
