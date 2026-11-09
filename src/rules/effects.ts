import { FLAG, ZT } from '../core/types.ts';
import type { SimWorld } from '../core/types.ts';
import type { LeveeLine } from '../sim/leveeLines.ts';
import type { Zone } from '../sim/zones.ts';
import { buildLevee, placeTempWall } from '../sim/structures.ts';
import { freezeCells, freezeToWall } from '../sim/ice.ts';
import type { Op } from './types.ts';
import type { RulesState } from './skills.ts';

/**
 * Effect op registry (DETAILED_DESIGN_V2 §6.3). Skills are defined only as op lists in
 * data; adding a skill never adds code unless it needs a new op.
 */

export interface EffectCtx {
  rs: RulesState;
  world: SimWorld;
  zone?: Zone;
  path?: [number, number][];
}

/** Unit vector from the strongest inlet of `wave` (1-based) towards the base centre. */
export function threatDir(world: SimWorld, wave: number, baseX: number, baseY: number): [number, number] {
  const W = world.grid.width, k = Math.max(0, wave - 1);
  let best = world.inlets[0], bw = -Infinity;
  for (const inl of world.inlets) { const v = inl.weights[k] ?? 1; if (v > bw) { bw = v; best = inl; } }
  if (!best) return [0, 1];
  const c = best.cells[best.cells.length >> 1], ix = c % W, iy = (c / W) | 0;
  const dx = baseX - ix, dy = baseY - iy, n = Math.hypot(dx, dy) || 1;
  return [dx / n, dy / n];
}

/**
 * Levee-line choice (§6.4): unbuilt lines first, the one facing the incoming water
 * (argmax facing · −dir); `null` when every line is built.
 */
export function pickLine(lines: LeveeLine[], built: Set<number>, dir: [number, number]): LeveeLine | null {
  let best: LeveeLine | null = null, bs = -Infinity;
  for (const l of lines) {
    if (built.has(l.id)) continue;
    const s = -(l.facing[0] * dir[0] + l.facing[1] * dir[1]);
    if (s > bs) { bs = s; best = l; }
  }
  return best;
}

function lineHeight(world: SimWorld, l: LeveeLine): number {
  let m = Infinity;
  for (const c of l.cells) m = Math.min(m, world.grid.wall[c]);
  return m;
}

/** Bresenham cells from (x0, y0) to (x1, y1), inclusive. */
export function bresenham(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const out: [number, number][] = [];
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return out;
}

/**
 * Swipe → wall cells (§6.5): Bresenham-joined path, first `maxCells` path cells, each widened
 * by one cell along the path normal; cells within `keepOut` (Chebyshev) of an inlet or the
 * base core are dropped.
 */
export function swipeCells(world: SimWorld, path: [number, number][], maxCells: number, width: number, keepOut: number): number[] {
  const g = world.grid, W = g.width;
  const line: [number, number][] = [];
  for (let k = 0; k < path.length; k++) {
    const seg = k === 0 ? [path[0]] : bresenham(path[k - 1][0], path[k - 1][1], path[k][0], path[k][1]).slice(1);
    for (const c of seg) { const l = line[line.length - 1]; if (!l || l[0] !== c[0] || l[1] !== c[1]) line.push(c); }
  }
  const kept = line.slice(0, maxCells);
  const near = (x: number, y: number) => {
    for (let dy = -keepOut; dy <= keepOut; dy++) for (let dx = -keepOut; dx <= keepOut; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= g.height) continue;
      if (g.flags[ny * W + nx] & (FLAG.inlet | FLAG.baseCore)) return true;
    }
    return false;
  };
  const out = new Set<number>();
  for (let k = 0; k < kept.length; k++) {
    const [x, y] = kept[k];
    const nb = kept[Math.min(k + 1, kept.length - 1)], pb = kept[Math.max(k - 1, 0)];
    const sx = nb[0] - pb[0], sy = nb[1] - pb[1];
    const cand: [number, number][] = [[x, y]];
    for (let w = 1; w < width; w++) cand.push(Math.abs(sx) >= Math.abs(sy) ? [x, y + w] : [x + w, y]);
    for (const [cx, cy] of cand) if (cx >= 0 && cy >= 0 && cx < W && cy < g.height && !near(cx, cy)) out.add(cy * W + cx);
  }
  return [...out].sort((a, b) => a - b);
}

/** Apply one op. Returns false if it had no target to act on. */
export function applyOp(op: Op, ctx: EffectCtx): boolean {
  const { rs, world, zone } = ctx, g = world.grid, tps = world.cfg.tps;
  switch (op.op) {
    case 'buildLevee': case 'iceLevee': {
      if (!zone) return false;
      const lines = rs.map.leveeLines[zone.id - 1];
      if (!lines.length) return false;
      const dir = threatDir(world, world.wave + (rs.phaseIsWave() ? 0 : 1), rs.map.terrain.baseX, rs.map.terrain.baseY);
      const line = pickLine(lines, rs.builtLines, dir);
      if (op.op === 'iceLevee') {
        const l = line ?? lines[0];
        freezeToWall(g, zone.cells, l.cells, op.height);
        rs.builtLines.add(l.id);
        return true;
      }
      if (line) { buildLevee(world, line.cells, op.height); rs.builtLines.add(line.id); return true; }
      let low = lines[0];
      for (const l of lines) if (lineHeight(world, l) < lineHeight(world, low)) low = l;
      for (const c of low.cells) { g.wall[c] = Math.min(op.cap, g.wall[c] + op.raise); g.dur[c] = world.cfg.leveeDur; }
      return true;
    }
    case 'tempWallPath': {
      if (!ctx.path?.length) return false;
      const cells = swipeCells(world, ctx.path, op.maxCells, op.width, op.keepOut);
      if (!cells.length) return false;
      placeTempWall(world, cells, op.height, Math.round(op.ttlSec * tps));
      return true;
    }
    case 'repairAll': {
      for (let i = 0; i < g.wall.length; i++) {
        if (g.wall[i] <= 0) continue;
        g.dur[i] = world.cfg.leveeDur;
        g.wall[i] += op.addHeight;
        rs.waveRestore.push([i, op.addHeight]);
      }
      return true;
    }
    case 'lowerZone': {
      if (!zone) return false;
      for (const c of zone.cells) g.h[c] -= op.dh;
      rs.zones[zone.id - 1].opened = true;
      rs.zoneChanged = true;
      return true;
    }
    case 'convertZone': {
      if (!zone) return false;
      rs.zones[zone.id - 1].convertTtl = Math.round(op.ttlSec * tps);
      rs.zones[zone.id - 1].convertTo = op.to;
      rs.zones[zone.id - 1].convertDh = op.dh;
      return true;
    }
    case 'modifier': {
      if (op.ttlSec) rs.timedMods.push({ key: op.key, value: op.value, mode: op.mode, ttl: Math.round(op.ttlSec * tps) });
      else rs.baseMods[op.key] = op.mode === 'set' ? op.value : op.mode === 'mul' ? rs.baseMods[op.key] * op.value : rs.baseMods[op.key] + op.value;
      rs.refreshMods();
      return true;
    }
    case 'freezeZone': {
      if (!zone) return false;
      freezeCells(g, zone.cells, op.ratio);
      return true;
    }
    case 'iceWall': {
      if (!zone) return false;
      const lines = rs.map.leveeLines[zone.id - 1];
      if (lines.length) {
        const dir = threatDir(world, world.wave + (rs.phaseIsWave() ? 0 : 1), rs.map.terrain.baseX, rs.map.terrain.baseY);
        let best = lines[0], bs = -Infinity;
        for (const l of lines) { const s = -(l.facing[0] * dir[0] + l.facing[1] * dir[1]); if (s > bs) { bs = s; best = l; } }
        freezeToWall(g, zone.cells, best.cells, op.height);
      } else freezeCells(g, zone.cells, op.fallbackRatio);
      return true;
    }
  }
}

/** Finish zone conversions whose timer ran out (call once per wave tick). */
export function tickConversions(rs: RulesState, world: SimWorld): void {
  const g = world.grid;
  rs.map.zones.zones.forEach((z, k) => {
    const st = rs.zones[k];
    if (st.convertTtl <= 0) return;
    if (--st.convertTtl > 0) return;
    z.type = st.convertTo ?? 'wetland';
    const code = ZT[z.type];
    for (const c of z.cells) { g.ztype[c] = code; g.h[c] -= st.convertDh; g.health[c] = 1; g.floodTicks[c] = 0; }
    rs.zoneChanged = true;
  });
}
