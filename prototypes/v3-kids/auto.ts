import { cloneGrid } from '../../src/sim/grid.ts';
import { createFluidScratch } from '../../src/sim/fluid.ts';
import { fenceHealth, KIND, startWave, tick, useSkill, useUlt, villageWater, type KidsWorld, type SkillId } from './core.ts';
import { TUNING } from './tuning.ts';

/**
 * One-button auto placement (docs/REDESIGN_V3_KIDS.md §3.3 follow-up). No DOM.
 * For each candidate spot the world is cloned, the skill applied, and the water run
 * `horizon` ticks ahead with the real rules; the spot that leaves the fence best off wins.
 * Deterministic: same world → same spot.
 */

const W = 64;
export const AUTO = { horizon: 120 } as const;

/** Deep copy of everything `tick` and skills touch. */
export function cloneWorld(w: KidsWorld): KidsWorld {
  return {
    ...w, g: cloneGrid(w.g), sc: createFluidScratch(w.g.w.length), kind: w.kind.slice(),
    sandCap: w.sandCap.slice(), sandHeld: w.sandHeld.slice(), level: { ...w.level }, cd: { ...w.cd },
    breaches: [], char: w.char,
  };
}

/**
 * Lower is better. Water on the field counts more the closer it is to the fence (cubed), so a
 * short look-ahead still tells spots apart; drained or soaked water counts 0. Fence damage and
 * a wet village dominate.
 */
export function threat(w: KidsWorld): number {
  let field = 0;
  const F = TUNING.fenceRow;
  for (let y = 0; y < F; y++) { const k = (y / F) ** 3; let row = 0; for (let x = 0; x < W; x++) row += w.g.w[y * W + x]; field += k * row; }
  return field + 200 * (1 - fenceHealth(w)) + 50 * villageWater(w) + (w.phase === 'lost' ? 1e4 : 0);
}

/** Run a clone `ticks` ahead; a world waiting between waves is started so the rollout sees water. */
function rollout(w: KidsWorld, ticks: number): number {
  if (w.phase === 'ready' || w.phase === 'pick') { startWave(w); }
  if (w.phase === 'warn') { w.warnTick = 0; w.phase = 'wave'; }
  for (let k = 0; k < ticks && w.phase === 'wave'; k++) tick(w);
  return threat(w);
}

/** Where water is now (or, before a wave, where the creek runs): the lowest wet row and its centre x. */
function waterFront(w: KidsWorld): { y: number; x: number } {
  for (let y = TUNING.aimRows[1]; y >= TUNING.aimRows[0]; y--) {
    let s = 0, sx = 0;
    for (let x = 1; x < W - 1; x++) { const v = w.g.w[y * W + x]; if (v > 0.02) { s += v; sx += v * x; } }
    if (s > 0.2) return { y, x: Math.round(sx / s) };
  }
  return { y: TUNING.aimRows[0], x: 32 };
}

/** Candidate aims for a skill: lines as two end points, discs as one point. */
export function candidates(w: KidsWorld, s: SkillId): [number, number][][] {
  const f = waterFront(w), out: [number, number][][] = [];
  const [o0, o1] = TUNING.outletRows;
  const rows = [f.y + 4, f.y + 10, 64].map(y => Math.max(o0 + 1, Math.min(o1 - 2, y)));
  const near = f.x < 32 ? 1 : 62, far = near === 1 ? 62 : 1;
  if (s === 'wall' || s === 'dig') {
    for (const y of [...new Set(rows)]) {
      // a bar under the water, a bar from the nearer river inwards, a slant down to that river
      out.push([[f.x - 12, y], [f.x + 12, y]], [[near, y], [f.x + (near === 1 ? 4 : -4), y]], [[f.x, y - 4], [near, y + 4]]);
    }
    out.push([[far, rows[0]], [f.x, rows[0]]]); // the other side, once
  } else {
    const pts: [number, number][] = [[f.x, Math.min(TUNING.aimRows[1] - 3, f.y + 4)], [f.x, Math.min(TUNING.aimRows[1] - 3, f.y + 10)]];
    // deepest water above the fence
    let best = -1, bi = -1;
    for (let y = TUNING.fenceRow - 12; y < TUNING.aimRows[1]; y++) for (let x = 1; x < W - 1; x++) {
      const v = w.g.w[y * W + x]; if (v > best) { best = v; bi = y * W + x; }
    }
    if (best > 0.05) pts.push([bi % W, Math.min(TUNING.aimRows[1] - 3, (bi / W) | 0)]);
    for (const x of [20, 44]) pts.push([x, TUNING.aimRows[1] - 4]);
    for (const p of pts) out.push([p]);
  }
  return out;
}

/**
 * Best aim for `s`, one candidate per step so a screen can spread the work over frames
 * (`yield` after each rollout). The return value is the aim, or null when nothing fits.
 */
export function* autoAimSteps(w: KidsWorld, s: SkillId, horizon: number = AUTO.horizon): Generator<void, [number, number][] | null> {
  let best: [number, number][] | null = null, bestScore = Infinity;
  for (const pts of candidates(w, s)) {
    const c = cloneWorld(w);
    if (!useSkill(c, s, pts)) continue;
    const score = rollout(c, horizon);
    if (score < bestScore - 1e-9) { bestScore = score; best = pts; }
    yield;
  }
  return best;
}

/** Best aim for `s` in one go (tests, bots). */
export function autoAim(w: KidsWorld, s: SkillId, horizon: number = AUTO.horizon): [number, number][] | null {
  const it = autoAimSteps(w, s, horizon);
  for (;;) { const r = it.next(); if (r.done) return r.value; }
}

/** Apply an aim found earlier; returns the changed cells (for a flash), empty if refused. */
export function applyAim(w: KidsWorld, s: SkillId, pts: [number, number][]): number[] {
  const before = w.g.h.slice(), wallB = w.g.wall.slice(), capB = w.sandCap.slice();
  if (!useSkill(w, s, pts)) return [];
  const changed: number[] = [];
  for (let i = 0; i < before.length; i++) if (before[i] !== w.g.h[i] || wallB[i] !== w.g.wall[i] || capB[i] !== w.sandCap[i]) changed.push(i);
  return changed;
}

/** Press-the-button: aim and use. Returns the cells changed (for a flash), empty if refused. */
export function autoUse(w: KidsWorld, s: SkillId): number[] {
  const pts = autoAim(w, s);
  return pts ? applyAim(w, s, pts) : [];
}

/** Canal ultimate: try rows across the river band, keep the best. */
export function autoCanalRow(w: KidsWorld, horizon: number = AUTO.horizon): number {
  let best = TUNING.outletRows[0] + 10, bestScore = Infinity;
  for (let y = TUNING.outletRows[0] + 2; y < TUNING.outletRows[1] - 2; y += 8) {
    const c = cloneWorld(w);
    if (!useUlt(c, y)) continue;
    const score = rollout(c, horizon);
    if (score < bestScore) { bestScore = score; best = y; }
  }
  return best;
}

/** Cells of a given kind (test helper). */
export const countKind = (w: KidsWorld, k: number) => { let n = 0; for (const v of w.kind) if (v === k) n++; return n; };
export { KIND };
