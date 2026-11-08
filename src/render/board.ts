import type { SimWorld } from '../core/types.ts';
import type { ZoneMap } from '../sim/zones.ts';
import { renderTerrain } from './terrainLayer.ts';
import { createWaterLayer, updateWater } from './waterLayer.ts';
import type { WaterLayer } from './waterLayer.ts';
import { DIM, GATE_CLOSED, GATE_OPEN, HIGHLIGHT, INLET_ARROW, LEVEE, LEVEE_WEAK, PUMP_OFF, PUMP_ON, TEMP_WALL } from './palette.ts';

/**
 * Board renderer: terrain (cached) → water (ImageData, one drawImage) → structures →
 * pumps/gates → overlay (zone highlight, target dimming, inlet arrows).
 */

export interface BoardView {
  /** Zone outlined as selected (0 = none). */
  highlight: number;
  /** Zones drawn bright while selecting a target; others dimmed. null = no dimming. */
  bright: Set<number> | null;
  /** Show inlet arrows (prepare phase). */
  arrows: boolean;
  /** Animation clock (ms) for pump blades; frozen when reduced motion. */
  time: number;
}

export interface Board {
  ctx: CanvasRenderingContext2D;
  world: SimWorld;
  zones: ZoneMap;
  terrain: OffscreenCanvas | HTMLCanvasElement;
  water: WaterLayer;
  zoneAreas: Path2D[];
  zoneOutlines: Path2D[];
}

/** Filled area of a zone (union of its tiles). */
function zoneArea(zones: ZoneMap, id: number): Path2D {
  const p = new Path2D();
  for (const [tx, ty] of zones.zones[id - 1].tiles) p.rect(tx * 8, ty * 8, 8, 8);
  return p;
}

/** Outline of a zone: only tile sides that border another zone. */
function zoneOutline(zones: ZoneMap, id: number): Path2D {
  const p = new Path2D(), own = new Set(zones.zones[id - 1].tiles.map(([x, y]) => x + ',' + y));
  for (const [tx, ty] of zones.zones[id - 1].tiles) {
    const x = tx * 8, y = ty * 8;
    if (!own.has(tx + ',' + (ty - 1))) { p.moveTo(x, y); p.lineTo(x + 8, y); }
    if (!own.has(tx + ',' + (ty + 1))) { p.moveTo(x, y + 8); p.lineTo(x + 8, y + 8); }
    if (!own.has((tx - 1) + ',' + ty)) { p.moveTo(x, y); p.lineTo(x, y + 8); }
    if (!own.has((tx + 1) + ',' + ty)) { p.moveTo(x + 8, y); p.lineTo(x + 8, y + 8); }
  }
  return p;
}

/** Create a board renderer on `canvas`. `make` builds offscreen canvases. */
export function createBoard(canvas: HTMLCanvasElement, world: SimWorld, zones: ZoneMap, make: (w: number, h: number) => OffscreenCanvas | HTMLCanvasElement): Board {
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const g = world.grid;
  return {
    ctx, world, zones,
    terrain: renderTerrain(g, zones, make),
    water: createWaterLayer(g, make),
    zoneAreas: zones.zones.map(z => zoneArea(zones, z.id)),
    zoneOutlines: zones.zones.map(z => zoneOutline(zones, z.id)),
  };
}

/** Rebuild the cached terrain (zone type or height changed). */
export function refreshTerrain(b: Board, make: (w: number, h: number) => OffscreenCanvas | HTMLCanvasElement): void {
  b.terrain = renderTerrain(b.world.grid, b.zones, make);
}

/** Draw one frame. */
export function drawBoard(b: Board, v: BoardView): void {
  const { ctx, world } = b, g = world.grid, W = g.width, H = g.height;
  const cw = ctx.canvas.width, ch = ctx.canvas.height, s = cw / W;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(b.terrain as CanvasImageSource, 0, 0, cw, ch);
  updateWater(b.water, g);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(b.water.canvas as CanvasImageSource, 0, 0, cw, ch);

  ctx.setTransform(s, 0, 0, s, 0, 0); // draw in cell units from here
  // structures
  for (let i = 0; i < g.wall.length; i++) {
    const wall = g.wall[i], tmp = g.tmp[i];
    if (wall <= 0 && tmp <= 0) continue;
    const x = i % W, y = (i / W) | 0;
    if (wall > 0) {
      ctx.fillStyle = g.dur[i] < 0.3 ? LEVEE_WEAK : LEVEE;
      ctx.globalAlpha = Math.min(1, 0.55 + wall); // taller = more solid
      ctx.fillRect(x, y, 1, 1);
      ctx.globalAlpha = 1;
      if (g.dur[i] < 0.3) { ctx.strokeStyle = '#300'; ctx.lineWidth = 0.12; ctx.beginPath(); ctx.moveTo(x + 0.2, y + 0.2); ctx.lineTo(x + 0.8, y + 0.8); ctx.stroke(); }
    }
    if (tmp > 0) { ctx.fillStyle = TEMP_WALL; ctx.fillRect(x + 0.3, y + 0.3, 0.4, 0.4); }
  }
  // gates
  for (const gate of world.gates) {
    const c0 = gate.cells[0], x = c0 % W, y = (c0 / W) | 0;
    ctx.strokeStyle = gate.open ? GATE_OPEN : GATE_CLOSED;
    ctx.lineWidth = 0.6;
    ctx.setLineDash(gate.open ? [1, 1] : []);
    ctx.strokeRect(x + 0.3, y + 0.3, 7.4, 7.4);
    ctx.setLineDash([]);
  }
  // pumps
  for (const p of world.pumps) {
    const x = p.cell % W + 0.5, y = ((p.cell / W) | 0) + 0.5;
    ctx.fillStyle = p.on ? PUMP_ON : PUMP_OFF;
    ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0b1622'; ctx.lineWidth = 0.35;
    const a = p.on ? v.time / 200 : 0;
    for (let k = 0; k < 3; k++) {
      const t = a + k * Math.PI * 2 / 3;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(t) * 1.8, y + Math.sin(t) * 1.8); ctx.stroke();
    }
    ctx.strokeStyle = p.on ? '#e8fffb' : '#a0a8b0'; ctx.lineWidth = 0.3;
    ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.stroke();
  }
  // overlay: dim non-targets, outline highlight
  if (v.bright) {
    ctx.fillStyle = DIM;
    for (const z of b.zones.zones) if (!v.bright.has(z.id)) ctx.fill(b.zoneAreas[z.id - 1]);
    ctx.strokeStyle = HIGHLIGHT; ctx.lineWidth = 0.35;
    for (const id of v.bright) ctx.stroke(b.zoneOutlines[id - 1]);
  }
  if (v.highlight) { ctx.strokeStyle = HIGHLIGHT; ctx.lineWidth = 0.6; ctx.stroke(b.zoneOutlines[v.highlight - 1]); }
  if (v.arrows) {
    ctx.fillStyle = INLET_ARROW;
    const wv = Math.max(0, world.wave); // next wave index for weights
    let wsum = 0; for (const inl of world.inlets) wsum += inl.weights[wv] ?? 1;
    for (const inl of world.inlets) {
      const c = inl.cells[inl.cells.length >> 1], x = c % W + 0.5, y = ((c / W) | 0) + 0.5;
      const dx = x < 1 ? 1 : x > W - 1 ? -1 : 0, dy = y < 1 ? 1 : y > H - 1 ? -1 : 0;
      const k = 1.2 + 3 * (inl.weights[wv] ?? 1) / (wsum || 1);
      ctx.save(); ctx.translate(x + dx * 3, y + dy * 3); ctx.rotate(Math.atan2(dy, dx));
      ctx.beginPath(); ctx.moveTo(3, 0); ctx.lineTo(-2, k); ctx.lineTo(-2, -k); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
