import type { SimWorld } from '../src/core/types.ts';
import type { LoadedMap } from '../src/game/map.ts';
import { tickLakes } from '../src/game/lakes.ts';
import type { LakeEvent } from '../src/game/lakes.ts';
import { addPump, setPump } from '../src/sim/sinks.ts';
import { buildLevee } from '../src/sim/structures.ts';
import { runWaves } from '../src/sim/step.ts';

/**
 * Fixed-placement balance bots (GD §25, §26.2 검증; DETAILED §21). Same 7 strategies as
 * `prototypes/v2-calibrate.mjs`, placed relative to each map's base. Levees are re-cast
 * (durability restored) at every wave start (Story 001 decision 1). Pumps run free of cash.
 * Target: the 5 single-means strategies lose, the 2 mixed ones clear.
 */

export interface Outcome { result: 'clear' | 'defeat'; wave: number; hp: number; }

type Setup = (m: LoadedMap) => void;

const W = (m: LoadedMap) => m.terrain.grid.width;
const at = (m: LoadedMap, dx: number, dy: number) => (m.terrain.baseY + dy) * W(m) + m.terrain.baseX + dx;

function ring(m: LoadedMap, r: number, gapEvery = 0): void {
  const cells: number[] = [];
  let n = 0;
  for (let y = m.terrain.baseY - r; y <= m.terrain.baseY + r; y++) for (let x = m.terrain.baseX - r; x <= m.terrain.baseX + r; x++) {
    if (Math.max(Math.abs(x - m.terrain.baseX), Math.abs(y - m.terrain.baseY)) !== r) continue;
    n++;
    if (gapEvery && n % gapEvery === 0) continue;
    cells.push(y * W(m) + x);
  }
  buildLevee(m.world, cells, 0.4);
}

function pump(m: LoadedMap, cell: number): void { setPump(m.world, addPump(m.world, cell), true); }

/** Cell k steps from the base towards inlet 0 (a pump "on the water's path"). */
function onPath(m: LoadedMap, k: number): number {
  const c = m.world.inlets[0].cells[1], ix = c % W(m), iy = (c / W(m)) | 0;
  const bx = m.terrain.baseX, by = m.terrain.baseY, d = Math.hypot(ix - bx, iy - by);
  return Math.round(by + (iy - by) * k / d) * W(m) + Math.round(bx + (ix - bx) * k / d);
}

export const STRATEGIES: Readonly<Record<string, { mixed: boolean; setup: Setup }>> = {
  none: { mixed: false, setup: () => {} },
  onePumpOnPath: { mixed: false, setup: m => pump(m, onPath(m, 6)) },
  twoPumps: { mixed: false, setup: m => { pump(m, at(m, 0, -5)); pump(m, at(m, 0, 5)); } },
  levyRingOnly: { mixed: false, setup: m => ring(m, 6) },
  leakyRing: { mixed: false, setup: m => ring(m, 6, 7) },
  ringPlusPump: { mixed: true, setup: m => { ring(m, 6); pump(m, at(m, 0, -9)); } },
  twoRingsTwoPumps: { mixed: true, setup: m => { ring(m, 5); ring(m, 9); pump(m, at(m, 0, -12)); pump(m, at(m, 0, 12)); } },
};

/** Run one strategy on a freshly loaded map (bots place their own pumps, not the map's sites). */
export function runStrategy(load: () => LoadedMap, name: string): Outcome {
  const m = load();
  m.world.cash = null;
  m.world.pumps.length = 0; m.world.pumpCells.length = 0;
  STRATEGIES[name].setup(m);
  const repair = (w: SimWorld) => { const g = w.grid; for (let i = 0; i < g.wall.length; i++) if (g.wall[i] > 0) g.dur[i] = w.cfg.leveeDur; };
  const ev: LakeEvent[] = [];
  return runWaves(m.world, 1, m.data.waves ?? 5, repair, undefined, w => { if (m.lakes.length) { ev.length = 0; tickLakes(w, m.lakes, ev); } });
}
