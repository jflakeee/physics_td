// Material layers M0 prototype — core (docs/MATERIAL_LAYERS_DESIGN.md §5, §6, §9).
// Throwaway: proves the layer rules before M1 builds the real framework in src/sim.
// Layers stack by density, bottom → top: lava (2.4) → sand (1.6) → water (1.0).
// Every special layer is Float32 (§5.1); water stays in the real sim (Float64).

/** @typedef {{ id: string, kind: 'liquid'|'granular', flowK?: number, repose?: number, rate?: number, updateEvery: number,
 *   heat?: { coolPerSec: number, solidifyBelow: number, solidifyScale: number } }} MaterialDef */

const EPS = 1e-7;

/**
 * Create the special layers for an `n`-cell grid.
 * @param {number} W @param {number} H @param {MaterialDef[]} defs bottom → top (densest first)
 */
export function createLayers(W, H, defs) {
  const n = W * H;
  return {
    W, H, defs,
    depth: defs.map(() => new Float32Array(n)),
    energy: new Float32Array(n),          // lava heat × depth: carried with the lava, heat = energy / depth
    lost: { water: 0, lava: 0 },          // steam, lava turned into terrain
    // scratch (no per-tick allocation)
    head: new Float64Array(n), out: new Float64Array(n * 4), s: new Float64Array(n), ratio: new Float64Array(n), ncomp: new Float64Array(n),
    mark: new Uint8Array(n), active: new Int32Array(n), saveH: new Float32Array(n),
    tick: 0, activeCount: 0,
  };
}

/** Height of structures + terrain under every layer. */
function baseAt(g, i) { return g.h[i] + g.wall[i] + g.gate[i] + g.tmp[i] + g.ice[i]; }

/** Sum of the layers below layer `k` at cell i. */
function below(L, k, i) { let s = 0; for (let j = 0; j < k; j++) s += L.depth[j][i]; return s; }

/**
 * Active cells of layer `k`: cells with depth > EPS and their 4 neighbours (§9 활성 셀).
 * Fills L.active[0..count) in row-major order, so the passes stay order independent.
 */
function collectActive(L, k) {
  const { W, H, mark, active } = L, d = L.depth[k], n = W * H;
  mark.fill(0);
  for (let i = 0; i < n; i++) {
    if (d[i] <= EPS) continue;
    mark[i] = 1;
    const x = i % W;
    if (x + 1 < W) mark[i + 1] = 1;
    if (x > 0) mark[i - 1] = 1;
    if (i + W < n) mark[i + W] = 1;
    if (i >= W) mark[i - W] = 1;
  }
  let c = 0;
  for (let i = 0; i < n; i++) if (mark[i]) active[c++] = i;
  L.activeCount = c;
  return c;
}

/**
 * One two-pass move for layer `k` (same structure as src/sim/fluid.ts, so mass conserving and
 * left/right symmetric). `amount(Hi, Hj)` is the flow i → j before the outflow cap.
 */
function twoPass(L, g, k, K, rep, comp) {
  const { W, H, head, out, s, active, ratio, ncomp } = L, d = L.depth[k];
  const c = collectActive(L, k);
  for (let a = 0; a < c; a++) { const i = active[a]; head[i] = baseAt(g, i) + below(L, k, i) + d[i]; }
  // neighbours of active cells that are not active themselves still need a head
  for (let a = 0; a < c; a++) {
    const i = active[a], x = i % W;
    if (x + 1 < W && !L.mark[i + 1]) head[i + 1] = baseAt(g, i + 1) + below(L, k, i + 1) + d[i + 1];
    if (x > 0 && !L.mark[i - 1]) head[i - 1] = baseAt(g, i - 1) + below(L, k, i - 1) + d[i - 1];
    if (i + W < W * H && !L.mark[i + W]) head[i + W] = baseAt(g, i + W) + below(L, k, i + W) + d[i + W];
    if (i >= W && !L.mark[i - W]) head[i - W] = baseAt(g, i - W) + below(L, k, i - W) + d[i - W];
  }
  // a companion quantity (lava energy) moves with the same fractions as the depth
  if (comp) for (let a = 0; a < c; a++) { const i = active[a]; ratio[i] = d[i] > 0 ? comp[i] / d[i] : 0; }
  // pass 1 — outflows of active cells
  for (let a = 0; a < c; a++) {
    const i = active[a], o = i * 4, di = d[i], x = i % W, y = (i / W) | 0;
    if (di <= 0) { out[o] = 0; out[o + 1] = 0; out[o + 2] = 0; out[o + 3] = 0; s[i] = 0; continue; }
    const Hi = head[i];
    // flow i → j = K × (H_i − H_j − rep) when positive (liquid: rep = 0; granular: repose)
    let dd;
    dd = x + 1 < W ? Hi - head[i + 1] - rep : 0; out[o] = dd > 0 ? dd * K : 0;
    dd = x > 0 ? Hi - head[i - 1] - rep : 0; out[o + 1] = dd > 0 ? dd * K : 0;
    dd = y + 1 < H ? Hi - head[i + W] - rep : 0; out[o + 2] = dd > 0 ? dd * K : 0;
    dd = y > 0 ? Hi - head[i - W] - rep : 0; out[o + 3] = dd > 0 ? dd * K : 0;
    const tot = (out[o] + out[o + 1]) + (out[o + 2] + out[o + 3]);
    s[i] = tot > di ? di / tot : 1;
  }
  // pass 2 — gather (inactive neighbours sent nothing: their out/s are zeroed below)
  const nd = L.head; // reuse: new depths are written after reading all old values
  for (let a = 0; a < c; a++) {
    const i = active[a], o = i * 4, si = s[i], x = i % W, y = (i / W) | 0;
    let kept;
    if (si === 0) kept = d[i] > 0 ? d[i] : 0;
    else if (si < 1) kept = 0;
    else kept = d[i] - ((out[o] + out[o + 1]) + (out[o + 2] + out[o + 3]));
    const fw = x > 0 && L.mark[i - 1] ? out[(i - 1) * 4] * s[i - 1] : 0;
    const fe = x + 1 < W && L.mark[i + 1] ? out[(i + 1) * 4 + 1] * s[i + 1] : 0;
    const fn = y > 0 && L.mark[i - W] ? out[(i - W) * 4 + 2] * s[i - W] : 0;
    const fs = y + 1 < H && L.mark[i + W] ? out[(i + W) * 4 + 3] * s[i + W] : 0;
    const v = kept + ((fe + fw) + (fs + fn));
    nd[i] = v > 0 ? v : 0;
    if (comp) ncomp[i] = kept * ratio[i] + ((fe * (fe ? ratio[i + 1] : 0) + fw * (fw ? ratio[i - 1] : 0)) + (fs * (fs ? ratio[i + W] : 0) + fn * (fn ? ratio[i - W] : 0)));
  }
  // write back only after every cell has read the old depths
  for (let a = 0; a < c; a++) { const i = active[a]; d[i] = nd[i]; if (comp) comp[i] = ncomp[i]; }
}

/** Liquid layer step (§5.2): virtual pipe with the layer's own flowK, scaled by updateEvery. */
export function liquidStep(L, g, k) {
  const def = L.defs[k], K = Math.min(0.25, def.flowK * def.updateEvery);
  twoPass(L, g, k, K, 0, def.heat ? L.energy : null);
}

/** Granular layer step (§5.3): only the slope above `repose` moves, `rate`/2 per side. */
export function granularStep(L, g, k) {
  const def = L.defs[k], rep = def.repose, r = Math.min(1, def.rate * def.updateEvery) / 2;
  twoPass(L, g, k, r, rep, null);
}

/**
 * Lava heat and reactions (§6), per cell: cool; below `solidifyBelow` the lava turns into
 * terrain (h += depth × solidifyScale, `lost.lava`); lava + water → steam (`lost.water`)
 * and the lava cools. Heat moves with the lava as energy (= heat × depth, see twoPass).
 */
export function lavaReactions(L, g, k, opt) {
  const def = L.defs[k], E = L.energy, d = L.depth[k], w = g.w, n = d.length;
  const cool = def.heat.coolPerSec / 30 * def.updateEvery;
  for (let i = 0; i < n; i++) {
    const v = d[i];
    if (v <= EPS) { if (v > 0) { d[i] = 0; E[i] = 0; L.lost.lava += v; } continue; }
    let t = E[i] / v - cool;
    if (opt.steam && w[i] > 0) {
      const a = Math.min(v, w[i]) * opt.steam; // steam rate per tick
      w[i] -= a; L.lost.water += a; t -= a * opt.steamCool;
    }
    if (t < def.heat.solidifyBelow) { g.h[i] += v * def.heat.solidifyScale; L.lost.lava += v; d[i] = 0; t = 0; }
    E[i] = t > 0 ? t * d[i] : 0;
  }
}

/**
 * Run `fn` (the real water/structure step) with the special layers counted as ground, so
 * water flows over lava and sand. h is restored bit-exactly afterwards.
 */
export function withLayersAsGround(L, g, fn) {
  const h = g.h, sv = L.saveH, n = h.length;
  sv.set(h);
  for (let k = 0; k < L.defs.length; k++) { const d = L.depth[k]; for (let i = 0; i < n; i++) if (d[i] > 0) h[i] += d[i]; }
  const r = fn();
  // keep terrain changes made by fn (none in the water step) — restore the saved heights
  h.set(sv);
  return r;
}

/** Advance the special layers one tick (each on its own `updateEvery`). */
export function stepLayers(L, g, reactions = null) {
  L.tick++;
  for (let k = 0; k < L.defs.length; k++) {
    const def = L.defs[k];
    if ((L.tick + k) % def.updateEvery !== 0) continue; // stagger layers so their ticks do not pile up
    if (def.kind === 'liquid') liquidStep(L, g, k); else granularStep(L, g, k);
    if (def.heat && reactions) lavaReactions(L, g, k, reactions);
  }
}

/** Total of a layer (Float64 sum). */
export function total(arr) { let s = 0; for (let i = 0; i < arr.length; i++) s += arr[i]; return s; }

/** FNV-1a over the bytes of the given typed arrays (determinism check). */
export function hashArrays(...arrs) {
  let h = 0x811c9dc5;
  for (const a of arrs) { const b = new Uint8Array(a.buffer, a.byteOffset, a.byteLength); for (let i = 0; i < b.length; i++) h = Math.imul(h ^ b[i], 16777619); }
  return h >>> 0;
}
