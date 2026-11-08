/** Shared fixtures for sim tests (no inline magic maps). */
import { createRng, seedState } from '../../../src/core/rng.ts';
import { createGrid } from '../../../src/sim/grid.ts';
import type { SimGrid, SimWorld } from '../../../src/core/types.ts';
import { buildTerrain } from '../../../src/sim/terrain.ts';
import type { Terrain } from '../../../src/sim/terrain.ts';
import { createWorld, stepFluidOnly } from '../../../src/sim/step.ts';
import { placeIce } from '../../../src/sim/ice.ts';
import { addPump, setPump } from '../../../src/sim/sinks.ts';
import { buildLevee } from '../../../src/sim/structures.ts';

/** 둑마을 tile layout (docs/DETAILED_DESIGN_V2.md §11.3). */
export const DIKE_VILLAGE = ['PPPIPPPO', 'PPFPPPPP', 'PPPPPPFP', 'PDPPPPPP', 'PPPPPPPP', 'IPPBBPPP', 'PPPBBPPI', 'PPPPPPPP', 'PPFPPPDP', 'PPPPPPPP', 'PPPPFPPP', 'OPPPIPPP'];
export const DIKE_I1 = 120;

/** Random terrain with water, ice and walls from a seed. */
export function randomGrid(seed: number, w = 32, h = 48): SimGrid {
  const g = createGrid(w, h), r = createRng(seedState(seed));
  for (let i = 0; i < w * h; i++) {
    g.h[i] = r.next() * 1.5;
    g.w[i] = r.next() * 0.5;
    if (r.next() < 0.05) g.ice[i] = r.next() * 0.6;
    if (r.next() < 0.05) g.wall[i] = r.next() * 0.5;
  }
  return g;
}

/** Flat grid (all heights 0). */
export function flatGrid(w: number, h: number): SimGrid { return createGrid(w, h); }

/** FNV-1a over the bytes of the water and ice arrays. */
export function hashGrid(g: SimGrid): number {
  let hsh = 0x811c9dc5;
  for (const arr of [g.w, g.ice]) {
    const b = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    for (let i = 0; i < b.length; i++) hsh = Math.imul(hsh ^ b[i], 16777619);
  }
  return hsh >>> 0;
}

/** Cells on the Chebyshev ring of radius r around the base centre. */
export function ringCells(t: Terrain, r: number): number[] {
  const W = t.grid.width, out: number[] = [];
  for (let y = t.baseY - r; y <= t.baseY + r; y++) for (let x = t.baseX - r; x <= t.baseX + r; x++)
    if (Math.max(Math.abs(x - t.baseX), Math.abs(y - t.baseY)) === r) out.push(y * W + x);
  return out;
}

/** Cell `k` steps from the base centre toward the first inlet (pump "on the path"). */
export function onInletPath(t: Terrain, k: number): number {
  const W = t.grid.width, c = t.inlets[0].cells[1], ix = c % W, iy = (c / W) | 0;
  const d = Math.hypot(ix - t.baseX, iy - t.baseY);
  return Math.round(t.baseY + (iy - t.baseY) * k / d) * W + Math.round(t.baseX + (ix - t.baseX) * k / d);
}

/** Calibration strategies (docs/GAME_DESIGN_V2.md §25, prototypes/v2-calibrate.mjs). */
export const STRATEGIES: Record<string, (w: SimWorld, t: Terrain) => void> = {
  none: () => {},
  onePumpOnPath: (w, t) => { setPump(w, addPump(w, onInletPath(t, 6)), true); },
  ringPlusPump: (w, t) => {
    buildLevee(w, ringCells(t, 6), 0.4);
    setPump(w, addPump(w, (t.baseY - 9) * t.grid.width + t.baseX), true);
  },
};

/** Build 둑마을 with cash disabled (the calibration prototype ignores cash). */
export function dikeWorld(I1 = DIKE_I1): { t: Terrain; w: SimWorld } {
  const t = buildTerrain(DIKE_VILLAGE);
  return { t, w: createWorld(t, { I1 }, { cash: null }) };
}

/** Re-cast levees between waves: restore durability of every standing levee cell. */
export function repairLevees(w: SimWorld): void {
  const g = w.grid;
  for (let i = 0; i < g.wall.length; i++) if (g.wall[i] > 0) g.dur[i] = w.cfg.leveeDur;
}

/** Glacier pocket used by the glacier-lake calibration (prototypes/v2-glacier-lake.mjs). */
export const GLACIER_POCKET = { x0: 4, x1: 19, y0: 4, y1: 19, lake: 40, rim: 0.9 } as const;
export const FREEZE_COOLDOWN = 1800;

/** Place the glacier rim + lake on 둑마을 and let the lake settle with the rim frozen. */
export function addGlacierLake(w: SimWorld, t: Terrain): { inside: number[]; rim: number[] } {
  const { x0, x1, y0, y1, lake, rim: rimH } = GLACIER_POCKET, W = t.grid.width;
  const inside: number[] = [], rim: number[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++)
    (x === x0 || x === x1 || y === y0 || y === y1 ? rim : inside).push(y * W + x);
  placeIce(t.grid, rim, rimH, true);
  for (const c of inside) t.grid.w[c] += lake / inside.length;
  const m = w.cfg.glacierMelt;
  w.cfg.glacierMelt = 0;
  for (let k = 0; k < 2000; k++) stepFluidOnly(w);
  w.cfg.glacierMelt = m;
  return { inside, rim };
}
