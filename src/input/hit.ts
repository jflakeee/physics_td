import type { SimWorld } from '../core/types.ts';
import type { ZoneMap } from '../sim/zones.ts';

/**
 * Screen → cell → object (DETAILED_DESIGN_V2 §14.2).
 * Priority: pump (within 2 cells) > gate cell > zone; no zone under the finger →
 * nearest zone within 2 cells.
 */

export type Hit =
  | { t: 'pump'; id: number }
  | { t: 'gate'; id: number }
  | { t: 'zone'; id: number }
  | { t: 'none' };

/** Board rect in CSS pixels. */
export interface Rect { left: number; top: number; width: number; height: number; }

/** Client coordinates → cell (x, y), or null outside the board. */
export function toCell(rect: Rect, gw: number, gh: number, cx: number, cy: number): [number, number] | null {
  const x = Math.floor((cx - rect.left) / rect.width * gw), y = Math.floor((cy - rect.top) / rect.height * gh);
  return x < 0 || y < 0 || x >= gw || y >= gh ? null : [x, y];
}

export const PUMP_HIT_RADIUS = 2;

/** Resolve what is under cell (x, y). */
export function hitTest(world: SimWorld, zones: ZoneMap, x: number, y: number): Hit {
  const g = world.grid, W = g.width;
  let best = -1, bestD = Infinity;
  for (const p of world.pumps) {
    const px = p.cell % W, py = (p.cell / W) | 0, d = Math.hypot(px - x, py - y);
    if (d <= PUMP_HIT_RADIUS && d < bestD) { bestD = d; best = p.id; }
  }
  if (best >= 0) return { t: 'pump', id: best };
  const i = y * W + x;
  for (const gate of world.gates) if (gate.cells.includes(i)) return { t: 'gate', id: gate.id };
  if (zones.zoneOf[i]) return { t: 'zone', id: zones.zoneOf[i] };
  bestD = Infinity; best = 0;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= g.height) continue;
    const z = zones.zoneOf[ny * W + nx], d = dx * dx + dy * dy;
    if (z && d <= 4 && d < bestD) { bestD = d; best = z; }
  }
  return best ? { t: 'zone', id: best } : { t: 'none' };
}
