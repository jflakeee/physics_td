import type { SimWorld } from '../core/types.ts';

/**
 * Structures (docs/DETAILED_DESIGN_V2.md §4.3): levee wear & collapse, temporary walls, gates.
 *
 * Levee cell c (wall_c > 0):
 *   pressure = max_j clamp(h_j + w_j − max(h_c, h_j), 0, wall_c)
 *   dur_c −= leveeWear × pressure / wallDurabilityMul;  dur_c ≤ 0 → wall_c = 0 (collapse)
 * Note: the spec writes `h_j + w_j − h_c`; on the sloped basin that charges pressure for a
 * dry uphill neighbour, so the water surface is measured above the higher of the two grounds.
 * On flat ground both agree (SIM-05: pressure 1.0 → collapse at tick 1500).
 */

/** Build or raise a levee to `height` on `cells` (fresh durability). */
export function buildLevee(world: SimWorld, cells: ArrayLike<number>, height: number): void {
  const g = world.grid;
  for (let k = 0; k < cells.length; k++) {
    const c = cells[k];
    if (height > g.wall[c]) g.wall[c] = height;
    g.dur[c] = world.cfg.leveeDur;
  }
}

/** Raise existing levee cells by `add` (keeps durability). */
export function raiseLevee(world: SimWorld, cells: ArrayLike<number>, add: number): void {
  const g = world.grid;
  for (let k = 0; k < cells.length; k++) {
    const c = cells[k];
    if (g.wall[c] <= 0) g.dur[c] = world.cfg.leveeDur;
    g.wall[c] += add;
  }
}

/** Place a temporary wall (sandbag) for `ttl` ticks. */
export function placeTempWall(world: SimWorld, cells: ArrayLike<number>, height: number, ttl: number): void {
  const g = world.grid;
  for (let k = 0; k < cells.length; k++) {
    const c = cells[k];
    if (height > g.tmp[c]) g.tmp[c] = height;
    if (ttl > g.tmpTtl[c]) g.tmpTtl[c] = Math.min(ttl, 0xffff);
  }
}

/** Open or close a gate; closed gate cells hold `gateClosedHeight`. */
export function setGate(world: SimWorld, id: number, open: boolean): boolean {
  const gate = world.gates[id];
  if (!gate) return false;
  gate.open = open;
  const v = open ? 0 : world.cfg.gateClosedHeight;
  for (let k = 0; k < gate.cells.length; k++) world.grid.gate[gate.cells[k]] = v;
  return true;
}

/** Levee wear/collapse, `blocked` metric, temp wall expiry. */
export function updateStructures(world: SimWorld): void {
  const g = world.grid, { width: W, height: Hc, w, h, wall, dur, tmp, tmpTtl } = g;
  const wear = world.cfg.leveeWear / world.mods.wallDurabilityMul;
  let blocked = 0;
  for (let i = 0; i < wall.length; i++) {
    const wc = wall[i];
    if (wc > 0) {
      const x = i % W, y = (i / W) | 0, hc = h[i];
      let p = 0, depth = 0;
      for (let d = 0; d < 4; d++) {
        const nx = d === 0 ? x + 1 : d === 1 ? x - 1 : x;
        const ny = d === 2 ? y + 1 : d === 3 ? y - 1 : y;
        if (nx < 0 || ny < 0 || nx >= W || ny >= Hc) continue;
        const j = ny * W + nx;
        if (wall[j] > 0) continue; // levee-to-levee contact carries no load
        const hj = h[j], wj = w[j];
        let q = hj + wj - (hc > hj ? hc : hj);
        if (q > wc) q = wc;
        if (q > p) p = q;
        const dd = wj < wc ? wj : wc;
        if (dd > depth) depth = dd;
      }
      blocked += depth * 0.01;
      if (p > 0) {
        const nd = dur[i] - wear * p;
        if (nd <= 0) {
          dur[i] = 0; wall[i] = 0;
          world.metrics.collapses++;
          world.events.collapsed.push(i);
        } else dur[i] = nd;
      }
    }
    if (tmpTtl[i] > 0) { tmpTtl[i]--; if (tmpTtl[i] === 0) tmp[i] = 0; }
  }
  world.metrics.blocked += blocked;
}
