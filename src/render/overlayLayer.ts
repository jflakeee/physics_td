import type { Gate, Pump, SimGrid } from '../core/types.ts';
import { CELLS, GRID_W, LEVEE_HEIGHTS, TILE_SIZE, TILES_X } from '../sim/constants.ts';

/** Durability below which a levee shows the red crack pattern (spec 13). */
const CRACK_DURABILITY = 0.3;
const MAX_WALL = LEVEE_HEIGHTS[LEVEE_HEIGHTS.length - 1];

let crackPattern: CanvasPattern | null = null;

/** Red diagonal hatch for weak levees (colour + pattern for colour-blind players). */
function crack(ctx: CanvasRenderingContext2D): CanvasPattern {
  if (crackPattern) return crackPattern;
  const c = document.createElement('canvas');
  c.width = 6;
  c.height = 6;
  const p = c.getContext('2d') as CanvasRenderingContext2D;
  p.fillStyle = '#b3261e';
  p.fillRect(0, 0, 6, 6);
  p.strokeStyle = '#ffd0c8';
  p.lineWidth = 1.5;
  p.beginPath();
  p.moveTo(0, 6);
  p.lineTo(6, 0);
  p.stroke();
  crackPattern = ctx.createPattern(c, 'repeat') as CanvasPattern;
  return crackPattern;
}

/**
 * Levees (thickness grows with height, cracked pattern when durability < 0.3) and
 * temporary walls (dashed outline). `s` = pixels per cell.
 * @example drawStructures(ctx, grid, size.pxW / GRID_W);
 */
export function drawStructures(ctx: CanvasRenderingContext2D, g: SimGrid, s: number): void {
  const { wall, dur, tmp } = g;
  for (let pass = 0; pass < 2; pass++) {
    ctx.beginPath();
    let any = false;
    for (let i = 0; i < CELLS; i++) {
      if (wall[i] <= 0 || (dur[i] < CRACK_DURABILITY) !== (pass === 1)) continue;
      const inset = s * 0.3 * (1 - Math.min(1, wall[i] / MAX_WALL));
      ctx.rect((i % GRID_W) * s + inset, ((i / GRID_W) | 0) * s + inset, s - 2 * inset, s - 2 * inset);
      any = true;
    }
    if (!any) continue;
    ctx.fillStyle = pass === 0 ? '#6b4f35' : crack(ctx);
    ctx.fill();
  }
  ctx.beginPath();
  let anyTmp = false;
  for (let i = 0; i < CELLS; i++) {
    if (tmp[i] <= 0) continue;
    ctx.rect((i % GRID_W) * s + 1, ((i / GRID_W) | 0) * s + 1, s - 2, s - 2);
    anyTmp = true;
  }
  if (anyTmp) {
    ctx.fillStyle = 'rgba(214,190,140,0.7)';
    ctx.fill();
    ctx.setLineDash([s * 0.4, s * 0.3]);
    ctx.strokeStyle = '#3d2f1d';
    ctx.lineWidth = Math.max(1, s * 0.15);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/**
 * Pumps: running ones (first `maxOn` that are on) spin and have a green ring;
 * off pumps are grey with a cross, so state is not shown by colour alone.
 * @param timeMs Animation time; pass 0 for reduced motion.
 * @example drawPumps(ctx, state.pumps, state.maxPumpsOn, s, now);
 */
export function drawPumps(ctx: CanvasRenderingContext2D, pumps: readonly Pump[], maxOn: number, s: number, timeMs: number): void {
  let running = 0;
  for (const p of pumps) {
    const cx = ((p.cell % GRID_W) + 0.5) * s;
    const cy = (((p.cell / GRID_W) | 0) + 0.5) * s;
    const r = s * 1.6;
    const on = p.on && running < maxOn;
    if (on) running++;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = on ? '#1f3b2c' : '#4a4a4a';
    ctx.fill();
    ctx.lineWidth = Math.max(2, s * 0.35);
    ctx.strokeStyle = on ? '#66e08a' : '#9e9e9e';
    ctx.stroke();
    ctx.beginPath();
    if (on) {
      const a0 = (timeMs / 1000) * Math.PI * 2;
      for (let k = 0; k < 3; k++) {
        const a = a0 + (k * Math.PI * 2) / 3;
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * r * 0.75, cy + Math.sin(a) * r * 0.75);
      }
    } else {
      const q = r * 0.5;
      ctx.moveTo(cx - q, cy - q);
      ctx.lineTo(cx + q, cy + q);
      ctx.moveTo(cx + q, cy - q);
      ctx.lineTo(cx - q, cy + q);
    }
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1.5, s * 0.25);
    ctx.stroke();
  }
}

/**
 * Gates: closed = solid dark-blue bar, open = dashed light outline (shape, not only colour).
 * @example drawGates(ctx, state.gates, s);
 */
export function drawGates(ctx: CanvasRenderingContext2D, gates: readonly Gate[], s: number): void {
  for (const g of gates) {
    ctx.beginPath();
    for (const c of g.cells) ctx.rect((c % GRID_W) * s, ((c / GRID_W) | 0) * s, s, s);
    if (g.open) {
      ctx.setLineDash([s * 0.5, s * 0.4]);
      ctx.strokeStyle = '#b3e5fc';
      ctx.lineWidth = Math.max(1, s * 0.2);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.fillStyle = '#0d47a1';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1, s * 0.2);
      ctx.stroke();
    }
  }
}

/**
 * Zone overlay on the authoring tiles of each zone (`tileZone`): while targeting (`valid`
 * non-null, per zone) invalid zones are dimmed and valid ones lit; the selected zone's tiles get a yellow frame.
 * @example drawZoneOverlay(ctx, s, state.zones.tileZone, tg.zone, armed ? mask : null);
 */
export function drawZoneOverlay(ctx: CanvasRenderingContext2D, s: number, tileZone: Int16Array, selected: number, valid: Uint8Array | null): void {
  const z = TILE_SIZE * s;
  const tx = (k: number): number => (k % TILES_X) * z;
  const ty = (k: number): number => Math.floor(k / TILES_X) * z;
  if (valid) {
    ctx.beginPath();
    for (let k = 0; k < tileZone.length; k++) if (tileZone[k] < 0 || !valid[tileZone[k]]) ctx.rect(tx(k), ty(k), z, z);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fill();
    ctx.beginPath();
    for (let k = 0; k < tileZone.length; k++) if (tileZone[k] >= 0 && valid[tileZone[k]]) ctx.rect(tx(k), ty(k), z, z);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fill();
  }
  if (selected >= 0) {
    ctx.beginPath();
    for (let k = 0; k < tileZone.length; k++) {
      if (tileZone[k] !== selected) continue;
      const x = k % TILES_X;
      const y = Math.floor(k / TILES_X);
      const other = (nx: number, ny: number): boolean => nx < 0 || ny < 0 || nx >= TILES_X || ny * TILES_X + nx >= tileZone.length || tileZone[ny * TILES_X + nx] !== selected;
      if (other(x, y - 1)) (ctx.moveTo(tx(k), ty(k)), ctx.lineTo(tx(k) + z, ty(k)));
      if (other(x, y + 1)) (ctx.moveTo(tx(k), ty(k) + z), ctx.lineTo(tx(k) + z, ty(k) + z));
      if (other(x - 1, y)) (ctx.moveTo(tx(k), ty(k)), ctx.lineTo(tx(k), ty(k) + z));
      if (other(x + 1, y)) (ctx.moveTo(tx(k) + z, ty(k)), ctx.lineTo(tx(k) + z, ty(k) + z));
    }
    ctx.strokeStyle = '#ffd54f';
    ctx.lineWidth = Math.max(3, s * 0.5);
    ctx.stroke();
  }
}
