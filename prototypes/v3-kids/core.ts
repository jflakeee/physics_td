import type { SimGrid } from '../../src/core/types.ts';
import { createGrid } from '../../src/sim/grid.ts';
import { createFluidScratch, fluidStep, type FluidScratch } from '../../src/sim/fluid.ts';
import { SKILL_LEVELS, TUNING } from './tuning.ts';

/**
 * V3 kids prototype rules (docs/REDESIGN_V3_KIDS.md). No DOM.
 * One direction: water enters at the top, a fence protects the village at the bottom,
 * side rivers drain whatever the player routes to them. Water is never deleted: it is
 * held in sand, drained by the side rivers, or still on the board (see `waterBalance`).
 */

export type SkillId = 'wall' | 'sand' | 'dig' | 'basin';
export type UltId = 'fenceUlt' | 'canalUlt';
export type CharId = 'keeper' | 'mole';

/** A character = two skills + one ultimate (§5). */
export interface CharDef { id: CharId; skills: [SkillId, SkillId]; ult: UltId; }
export const CHARS: Readonly<Record<CharId, CharDef>> = {
  keeper: { id: 'keeper', skills: ['wall', 'sand'], ult: 'fenceUlt' },
  mole: { id: 'mole', skills: ['dig', 'basin'], ult: 'canalUlt' },
};
/** How each skill is aimed: drag a line or tap a point. */
export const SKILL_INPUT: Readonly<Record<SkillId | UltId, 'line' | 'tap' | 'none'>> = {
  wall: 'line', dig: 'line', sand: 'tap', basin: 'tap', fenceUlt: 'none', canalUlt: 'tap',
};

export type Phase = 'ready' | 'warn' | 'wave' | 'pick' | 'won' | 'lost';

/** Cell kinds that are not plain ground. */
export const KIND = { ground: 0, fence: 1, wall: 2, village: 3, outlet: 4, rock: 5 } as const;

export interface KidsWorld {
  g: SimGrid; sc: FluidScratch;
  kind: Uint8Array;
  sandCap: Float32Array; sandHeld: Float64Array;
  inlets: number[];
  char: CharDef;
  level: Record<SkillId, number>;
  cd: Record<SkillId, number>;
  ult: number;
  phase: Phase;
  wave: number; waveTick: number; waveLen: number; warnTick: number;
  inflow: number; drained: number;
  /** Fence cells that collapsed this game (defeat screen arrow). */
  breaches: number[];
  stars: number;
}

const W = 64, H = 96;
const at = (x: number, y: number) => y * W + x;

/** Ground height of the "작은 개울" map: slope down to the village, a winding creek, three mounds. */
export function groundHeight(x: number, y: number): number {
  let h = 3 * (1 - y / (H - 1));
  const cx = 32 + 6 * Math.sin(y / 14);
  if (y < TUNING.fenceRow && Math.abs(x - cx) <= 2) h -= 0.25;
  for (const [mx, my, r] of [[14, 30, 6], [50, 48, 7], [22, 62, 5]] as const) {
    const d2 = (x - mx) ** 2 + (y - my) ** 2;
    if (d2 < r * r) h += 0.9 * (1 - d2 / (r * r));
  }
  return h;
}

/** New game with `char`. */
export function createKidsWorld(char: CharId): KidsWorld {
  const g = createGrid(W, H);
  const kind = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = at(x, y);
    g.h[i] = groundHeight(x, y);
    if (y === TUNING.fenceRow) { kind[i] = KIND.fence; g.wall[i] = TUNING.fenceHeight; g.dur[i] = 1; }
    else if (y > TUNING.fenceRow) kind[i] = KIND.village;
    else if ((x === 0 || x === W - 1) && y >= TUNING.outletRows[0] && y < TUNING.outletRows[1]) {
      kind[i] = KIND.outlet; g.h[i] -= TUNING.riverDepth; // side river bed sits below the field
    }
  }
  const inlets: number[] = [];
  for (let x = 30; x <= 34; x++) inlets.push(at(x, 0));
  const def = CHARS[char];
  return {
    g, sc: createFluidScratch(W * H), kind,
    sandCap: new Float32Array(W * H), sandHeld: new Float64Array(W * H), inlets,
    char: def, level: { wall: 1, sand: 1, dig: 1, basin: 1 }, cd: { wall: 0, sand: 0, dig: 0, basin: 0 },
    ult: 0, phase: 'ready', wave: 0, waveTick: 0, waveLen: 0, warnTick: 0,
    inflow: 0, drained: 0, breaches: [], stars: 0,
  };
}

/** Begin the warning before wave `n` (1-based). */
export function startWave(w: KidsWorld): void {
  if (w.phase !== 'ready' && w.phase !== 'pick') return;
  w.wave++;
  w.phase = 'warn';
  w.warnTick = Math.round(TUNING.warnSeconds * TUNING.tps);
  w.waveTick = 0;
  w.waveLen = Math.round(TUNING.waves[w.wave - 1].seconds * TUNING.tps);
}

/** Fence health 0..1 (mean durability, collapsed cells count 0). */
export function fenceHealth(w: KidsWorld): number {
  let s = 0, n = 0;
  const row = TUNING.fenceRow * W;
  for (let x = 0; x < W; x++) { const i = row + x; n++; if (w.g.wall[i] > 0) s += Math.max(0, w.g.dur[i]); }
  return s / n;
}

/** Water that crossed into the village rows. */
export function villageWater(w: KidsWorld): number {
  let s = 0;
  for (let i = (TUNING.fenceRow + 1) * W; i < W * H; i++) s += w.g.w[i];
  return s;
}

/** inflow − drained − (board + ice + sand); 0 up to rounding (§4.3 "물은 사라지지 않는다"). */
export function waterBalance(w: KidsWorld): number {
  let s = 0;
  for (let i = 0; i < W * H; i++) s += w.g.w[i] + w.g.ice[i] + w.sandHeld[i];
  return w.inflow - w.drained - s;
}

/** Advance one tick. */
export function tick(w: KidsWorld): void {
  if (w.phase === 'warn') { if (--w.warnTick <= 0) w.phase = 'wave'; return; }
  if (w.phase !== 'wave') return;
  const g = w.g, spec = TUNING.waves[w.wave - 1];
  // inflow: evenly over the first inflowFrac of the wave
  const inTicks = Math.round(w.waveLen * TUNING.inflowFrac);
  if (w.waveTick < inTicks) {
    const per = spec.water / inTicks / w.inlets.length;
    for (const i of w.inlets) g.w[i] += per;
    w.inflow += per * w.inlets.length;
  }
  fluidStep(g, TUNING.K, w.sc);
  // side rivers
  for (let i = 0; i < W * H; i++) {
    if (w.kind[i] !== KIND.outlet) continue;
    const d = Math.min(g.w[i], TUNING.outletRate);
    g.w[i] -= d; w.drained += d;
  }
  // sand soaks until full
  for (let i = 0; i < W * H; i++) {
    const room = w.sandCap[i] - w.sandHeld[i];
    if (room <= 0 || g.w[i] <= 0) continue;
    const d = Math.min(g.w[i], TUNING.sandRate, room);
    g.w[i] -= d; w.sandHeld[i] += d;
  }
  wear(w);
  for (const k of Object.keys(w.cd) as SkillId[]) if (w.cd[k] > 0) w.cd[k]--;
  w.ult = Math.min(1, w.ult + 1 / (TUNING.ultSeconds * TUNING.tps));
  w.waveTick++;
  if (villageWater(w) > TUNING.villageLimit) { w.phase = 'lost'; return; }
  if (w.waveTick >= w.waveLen) endWave(w);
}

/** Fence and player walls wear with the water pressure against them; at 0 they collapse. */
function wear(w: KidsWorld): void {
  const g = w.g;
  for (let i = 0; i < W * H; i++) {
    const k = w.kind[i];
    if ((k !== KIND.fence && k !== KIND.wall) || g.wall[i] <= 0) continue;
    const x = i % W;
    let p = 0;
    for (const j of [x + 1 < W ? i + 1 : -1, x > 0 ? i - 1 : -1, i + W < W * H ? i + W : -1, i - W]) {
      if (j < 0) continue;
      const v = Math.min(g.wall[i], Math.max(0, g.h[j] + g.w[j] - Math.max(g.h[i], g.h[j])));
      if (v > p) p = v;
    }
    if (p <= 0) continue;
    g.dur[i] -= (k === KIND.fence ? TUNING.fenceWear : TUNING.wallWear) * p;
    if (g.dur[i] <= 0) {
      g.wall[i] = 0; g.dur[i] = 0;
      if (k === KIND.fence) w.breaches.push(i);
      else w.kind[i] = KIND.ground;
    }
  }
}

function endWave(w: KidsWorld): void {
  if (w.wave >= TUNING.waves.length) {
    const hp = fenceHealth(w);
    w.stars = hp >= 0.8 ? 3 : hp >= 0.5 ? 2 : 1;
    w.phase = 'won';
    return;
  }
  // the fence gets patched between waves (a breather, §3.2)
  const row = TUNING.fenceRow * W;
  for (let x = 0; x < W; x++) {
    const i = row + x;
    w.g.dur[i] = Math.min(1, w.g.dur[i] + TUNING.fenceRepair);
    w.g.wall[i] = Math.max(w.g.wall[i], TUNING.fenceHeight);
  }
  w.phase = 'pick';
}

/** The two upgrade cards offered between waves (skills below ★3). */
export function upgradeChoices(w: KidsWorld): SkillId[] {
  return w.char.skills.filter(s => w.level[s] < 3);
}

/** Take an upgrade card. */
export function pickUpgrade(w: KidsWorld, s: SkillId | null): void {
  if (w.phase !== 'pick') return;
  if (s && w.char.skills.includes(s) && w.level[s] < 3) w.level[s]++;
  startWave(w);
}

// ---- aiming -------------------------------------------------------------------------

/** True if a skill may touch this cell (above the fence, inside the aim band, not an outlet). */
export function aimable(w: KidsWorld, x: number, y: number): boolean {
  return x >= 1 && x < W - 1 && y >= TUNING.aimRows[0] && y <= TUNING.aimRows[1] && w.kind[at(x, y)] !== KIND.outlet;
}

/**
 * Cells along a dragged path, 4-connected (a diagonal step adds the corner cell so water
 * cannot slip through), clipped to the aim band, at most `max` cells.
 */
export function lineCells(w: KidsWorld, pts: readonly [number, number][], max: number): number[] {
  const out: number[] = [], seen = new Set<number>();
  const add = (x: number, y: number) => {
    if (out.length >= max || !aimable(w, x, y)) return;
    const i = at(x, y);
    if (!seen.has(i)) { seen.add(i); out.push(i); }
  };
  for (let k = 0; k < pts.length; k++) {
    let [x0, y0] = pts[k].map(Math.round) as [number, number];
    if (k === 0) { add(x0, y0); continue; }
    const [x1, y1] = pts[k].map(Math.round) as [number, number];
    [x0, y0] = pts[k - 1].map(Math.round) as [number, number];
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy, x = x0, y = y0;
    while (x !== x1 || y !== y1) {
      const e2 = 2 * err;
      if (e2 > -dy && e2 < dx) { err -= dy; x += sx; add(x, y); err += dx; y += sy; add(x, y); continue; }
      if (e2 > -dy) { err -= dy; x += sx; }
      else { err += dx; y += sy; }
      add(x, y);
    }
  }
  return out;
}

/** Cells of a disc around (cx, cy) inside the aim band. */
export function discCells(w: KidsWorld, cx: number, cy: number, r: number): number[] {
  const out: number[] = [];
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r && aimable(w, x, y)) out.push(at(x, y));
  }
  return out;
}

/** Why a skill cannot be used now (`null` = ready). */
export function blocked(w: KidsWorld, s: SkillId): 'cooldown' | 'phase' | 'notMine' | null {
  if (!w.char.skills.includes(s)) return 'notMine';
  if (w.phase !== 'wave' && w.phase !== 'warn' && w.phase !== 'ready' && w.phase !== 'pick') return 'phase';
  return w.cd[s] > 0 ? 'cooldown' : null;
}

/** Use a skill. `pts` are grid coordinates (one point for tap skills). Returns cells changed. */
export function useSkill(w: KidsWorld, s: SkillId, pts: readonly [number, number][]): number {
  if (blocked(w, s) || pts.length === 0) return 0;
  const g = w.g, lv = w.level[s] - 1;
  let cells: number[] = [];
  if (s === 'wall') {
    const L = SKILL_LEVELS.wall;
    cells = lineCells(w, pts, L.cells[lv]);
    for (const i of cells) { g.wall[i] = Math.max(g.wall[i], L.height[lv]); g.dur[i] = 1; w.kind[i] = KIND.wall; }
  } else if (s === 'dig') {
    const L = SKILL_LEVELS.dig;
    const line = lineCells(w, pts, L.cells[lv]);
    // two cells wide so the channel carries real flow
    const set = new Set<number>(line);
    for (const i of line) { const x = i % W, y = (i / W) | 0; if (aimable(w, x, y + 1)) set.add(i + W); }
    cells = [...set];
    for (const i of cells) { g.h[i] -= L.depth[lv]; if (w.kind[i] === KIND.wall) { g.wall[i] = 0; w.kind[i] = KIND.ground; } }
  } else if (s === 'sand') {
    const [x, y] = pts[0].map(Math.round);
    cells = discCells(w, x, y, SKILL_LEVELS.sand.radius[lv]);
    for (const i of cells) { w.sandCap[i] = Math.max(w.sandCap[i], TUNING.sandCap); g.h[i] += TUNING.sandRaise; }
  } else if (s === 'basin') {
    const [x, y] = pts[0].map(Math.round), L = SKILL_LEVELS.basin;
    cells = discCells(w, x, y, L.radius[lv]);
    // bowl: deepest in the middle; the dug earth makes a low rim (ground is moved, not deleted)
    const r = L.radius[lv];
    for (const i of cells) {
      const d2 = ((i % W) - x) ** 2 + (((i / W) | 0) - y) ** 2;
      g.h[i] -= L.depth[lv] * (1 - d2 / (r * r + 1));
    }
  }
  if (cells.length) w.cd[s] = Math.round(SKILL_LEVELS[s].cd * TUNING.tps);
  return cells.length;
}

/** Use the ultimate when the gauge is full. Canal takes a row; the fence ultimate takes none. */
export function useUlt(w: KidsWorld, row?: number): boolean {
  if (w.ult < 1 || (w.phase !== 'wave' && w.phase !== 'warn')) return false;
  const g = w.g;
  if (w.char.ult === 'fenceUlt') {
    const r = TUNING.fenceRow * W;
    for (let x = 0; x < W; x++) { const i = r + x; g.wall[i] = TUNING.fenceHeight + SKILL_LEVELS.fenceUlt.raise; g.dur[i] = 1; }
  } else {
    if (row === undefined) return false;
    const y0 = Math.max(TUNING.outletRows[0], Math.min(TUNING.outletRows[1] - 2, Math.round(row)));
    for (let y = y0; y < y0 + 2; y++) for (let x = 1; x < W - 1; x++) {
      const i = at(x, y);
      g.h[i] -= SKILL_LEVELS.canalUlt.depth;
      if (w.kind[i] === KIND.wall) { g.wall[i] = 0; w.kind[i] = KIND.ground; }
    }
  }
  w.ult = 0;
  return true;
}
