import type { SimWorld } from '../core/types.ts';

/**
 * Water source tracer (DETAILED §15.5 패배 화면 "침수 원인"). Optional: only when
 * `world.trace` is set. The map is split into BLOCK×BLOCK cell blocks; each block keeps the
 * fraction of its water that came from each source — the inlets (in `world.inlets` order),
 * rain, and melted ice / burst glacier lakes. Every tick the water crossing block borders
 * (read back from the fluid scratch) carries its block's mix into the neighbour; water inside a
 * block mixes at once. Sinks remove water without changing its mix. Base damage is attributed
 * by the mix of the base blocks, weighted by how far the base is over the threshold.
 * Blocks keep the cost inside the 4× CPU budget (§18); per-cell tracing measured 2.2 ms there.
 */

export const BLOCK = 2;

export interface Trace {
  /** Sources: inlets…, rain, ice. */
  n: number;
  rain: number;
  ice: number;
  bw: number;
  bh: number;
  /** Block of each cell. */
  blockOf: Int32Array;
  /** Block-border bits per cell: 1 E, 2 W, 4 S, 8 N. */
  border: Uint8Array;
  /** Fractions, block-major: f[b * n + k] (swapped with `next` every step). */
  f: Float64Array;
  next: Float64Array;
  /** Water per block (this tick) and flux across block borders (E, W, S, N per block). */
  water: Float64Array;
  flux: Float64Array;
  /** Damage weight per source this wave. */
  damage: Float64Array;
  /** Inlet index per cell (−1 none). */
  inletOf: Int16Array;
  /** Cell depths before an "add" stage, and the per-block additions by source. */
  before: Float64Array;
  added: Float64Array;
  iceBuf: Int32Array;
}

export function createTrace(world: SimWorld): Trace {
  const g = world.grid, cells = g.w.length, ni = world.inlets.length, n = ni + 2;
  const bw = Math.ceil(g.width / BLOCK), bh = Math.ceil(g.height / BLOCK), blocks = bw * bh;
  const blockOf = new Int32Array(cells);
  for (let i = 0; i < cells; i++) blockOf[i] = (((i / g.width) | 0) / BLOCK | 0) * bw + ((i % g.width) / BLOCK | 0);
  const border = new Uint8Array(cells);
  for (let i = 0; i < cells; i++) {
    const x = i % g.width, y = (i / g.width) | 0;
    border[i] = (x % BLOCK === BLOCK - 1 ? 1 : 0) | (x % BLOCK === 0 ? 2 : 0) | (y % BLOCK === BLOCK - 1 ? 4 : 0) | (y % BLOCK === 0 ? 8 : 0);
  }
  const inletOf = new Int16Array(cells).fill(-1);
  world.inlets.forEach((inl, k) => { for (const c of inl.cells) inletOf[c] = k; });
  const t: Trace = {
    n, rain: ni, ice: ni + 1, bw, bh, blockOf, border, f: new Float64Array(blocks * n), next: new Float64Array(blocks * n),
    water: new Float64Array(blocks), flux: new Float64Array(blocks * 4), damage: new Float64Array(n), inletOf,
    before: new Float64Array(cells), added: new Float64Array(blocks * n), iceBuf: new Int32Array(cells),
  };
  // water already on the map (glacier lakes) counts as ice
  for (let i = 0; i < cells; i++) if (g.w[i] > 0) t.f[blockOf[i] * n + t.ice] = 1;
  return t;
}

/** Cells holding ice right now (melt / fracture can only add water there); null when none. */
export function icedCells(ice: Float64Array, t: Trace): Int32Array | null {
  let n = 0;
  const buf = t.iceBuf;
  for (let i = 0; i < ice.length; i++) if (ice[i] > 0) buf[n++] = i;
  return n ? buf.subarray(0, n) : null;
}

/** Remember depths of just these cells. */
export function traceMarkCells(t: Trace, w: Float64Array, cells: ArrayLike<number>): void {
  for (let q = 0; q < cells.length; q++) t.before[cells[q]] = w[cells[q]];
}

/** Remember water depths before an "add" stage. */
export function traceMark(t: Trace, w: Float64Array): void { t.before.set(w); }

/** Mix in water added since `traceMark`: `rainPerCell` of it is rain, the rest goes to `source(i)`. */
export function traceAdded(t: Trace, w: Float64Array, rainPerCell: number, source: (i: number) => number, cells?: ArrayLike<number>): void {
  const { n, f, before, added, blockOf } = t;
  added.fill(0);
  const blocks = new Set<number>();
  const len = cells ? cells.length : w.length;
  for (let q = 0; q < len; q++) {
    const i = cells ? cells[q] : q;
    const add = w[i] - before[i];
    if (add <= 1e-12) continue;
    const b = blockOf[i], rain = Math.min(add, rainPerCell), rest = add - rain;
    added[b * n + t.rain] += rain;
    if (rest > 0) { const s = source(i); added[b * n + (s >= 0 ? s : t.rain)] += rest; }
    blocks.add(b);
  }
  if (!blocks.size) return;
  blockWater(t, w);
  for (const b of blocks) {
    const o = b * n;
    let add = 0;
    for (let k = 0; k < n; k++) add += added[o + k];
    const tot = t.water[b], old = tot - add;
    if (tot <= 1e-12) continue;
    for (let k = 0; k < n; k++) f[o + k] = (f[o + k] * old + added[o + k]) / tot;
  }
}

function blockWater(t: Trace, w: Float64Array): void {
  const water = t.water, blockOf = t.blockOf;
  water.fill(0);
  for (let i = 0; i < w.length; i++) water[blockOf[i]] += w[i];
}

/** Carry block mixes across block borders with the last fluid step's fluxes (scratch out/s). */
export function traceFlow(t: Trace, world: SimWorld): void {
  const { out, s } = world.scratch, { n, bw, blockOf, border, flux, water } = t, w = world.grid.w;
  flux.fill(0); water.fill(0);
  for (let i = 0; i < w.length; i++) {
    const b = blockOf[i];
    water[b] += w[i];
    const si = s[i], bd = border[i];
    if (si === 0 || bd === 0) continue;
    const o = i * 4, b4 = b * 4;
    if (bd & 1) flux[b4] += out[o] * si;          // E border
    if (bd & 2) flux[b4 + 1] += out[o + 1] * si;  // W border
    if (bd & 4) flux[b4 + 2] += out[o + 2] * si;  // S border
    if (bd & 8) flux[b4 + 3] += out[o + 3] * si;  // N border
  }
  const { f, next } = t, blocks = water.length, bh = t.bh;
  for (let b = 0; b < blocks; b++) {
    const bx = b % bw, by = (b / bw) | 0, o = b * n, tot = water[b];
    const inW = bx > 0 ? flux[(b - 1) * 4] : 0;
    const inE = bx + 1 < bw ? flux[(b + 1) * 4 + 1] : 0;
    const inN = by > 0 ? flux[(b - bw) * 4 + 2] : 0;
    const inS = by + 1 < bh ? flux[(b + bw) * 4 + 3] : 0;
    const inflow = inW + inE + inN + inS;
    if (tot <= 1e-12 || inflow <= tot * 1e-9) { for (let k = 0; k < n; k++) next[o + k] = f[o + k]; continue; }
    const inv = 1 / tot, kK = Math.max(0, tot - inflow) * inv;
    const aW = inW * inv, aE = inE * inv, aN = inN * inv, aS = inS * inv;
    const oW = (b - 1) * n, oE = (b + 1) * n, oN = (b - bw) * n, oS = (b + bw) * n;
    for (let k = 0; k < n; k++) {
      let v = kK * f[o + k];
      if (aW) v += aW * f[oW + k];
      if (aE) v += aE * f[oE + k];
      if (aN) v += aN * f[oN + k];
      if (aS) v += aS * f[oS + k];
      next[o + k] = v;
    }
  }
  t.f = next; t.next = f;
}

/** Fraction of source `k` in the water at `cell`. */
export function fractionAt(t: Trace, cell: number, k: number): number { return t.f[t.blockOf[cell] * t.n + k]; }

/** Attribute base damage this tick (`over` = base water above the threshold). */
export function traceDamage(t: Trace, world: SimWorld, over: number): void {
  if (over <= 0) return;
  const { n, damage } = t, w = world.grid.w;
  let tot = 0;
  for (const c of world.baseCore) tot += w[c];
  if (tot <= 0) return;
  for (const c of world.baseCore) for (let k = 0; k < n; k++) damage[k] += over * w[c] / tot * fractionAt(t, c, k);
}

/** Share of this wave's base damage per source (sums to 1, or all 0 without damage). */
export function damageShares(t: Trace): number[] {
  let s = 0;
  for (const v of t.damage) s += v;
  return Array.from(t.damage, v => (s > 0 ? v / s : 0));
}
