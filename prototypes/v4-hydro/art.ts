import { H, SITES, VILLAGE, W, type HydroWorld, type BuildKind } from './core.ts';
import { rgbOf, SPRITES, type Sprite } from './sprites.ts';
import { T } from './tuning.ts';

/**
 * One high-resolution pixel grid for everything (docs/ART_DIRECTION_V4_PIXEL.md): 3 art pixels per
 * sim cell → 192×288. Water is upsampled from the cells (bilinear depth, Bayer-dithered bands,
 * a bright shoreline). Sprites are blitted on the same grid. No DOM: writes into an RGBA buffer.
 */
export const S = 3, AW = W * S, AH = H * S;

export interface ArtBuffers { rgba: Uint8ClampedArray; terrain: Uint8ClampedArray; wet: Uint8Array; depth: Float32Array; ice: Float32Array }
export function createArt(): ArtBuffers {
  const n = AW * AH;
  return { rgba: new Uint8ClampedArray(n * 4), terrain: new Uint8ClampedArray(n * 4), wet: new Uint8Array(n), depth: new Float32Array(n), ice: new Float32Array(n) };
}

/** Deterministic 0..255 noise per art pixel (texture, not randomness in the sim). */
const hash = (x: number, y: number) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return (h ^ (h >>> 16)) & 255; };
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Ground, river bed, village, walls, sandbags — repaint when the terrain changes. */
export function paintTerrain(a: ArtBuffers, w: HydroWorld): void {
  const g = w.g, t = a.terrain;
  for (let ay = 0; ay < AH; ay++) {
    const cy = (ay / S) | 0;
    for (let ax = 0; ax < AW; ax++) {
      const cx = (ax / S) | 0, i = cy * W + cx, n = hash(ax, ay);
      let r: number, gg: number, b: number;
      if (w.village[i]) {
        r = 214; gg = 196; b = 150;
        if (n < 20) { r -= 30; gg -= 30; b -= 30; }
      } else if (w.channel[i]) {
        // pebbly river bed
        r = 120; gg = 104; b = 80;
        if (n < 40) { r += 22; gg += 20; b += 16; } else if (n > 220) { r -= 20; gg -= 20; b -= 16; }
      } else {
        const rowBed = g.h[cy * W + Math.max(0, Math.min(W - 1, Math.round(30 + 9 * Math.sin(cy / 15))))];
        if (g.h[i] - rowBed < 0.45) { r = 132; gg = 104; b = 70; if (n < 30) { r -= 18; gg -= 16; b -= 12; } } // dug earth
        else { r = 98; gg = 162; b = 84; if (n < 18) { r = 70; gg = 128; b = 62; } else if (n > 236) { r = 132; gg = 196; b = 104; } }
      }
      // relief: light from the left — banks, dug edges and mounds get a lit / shaded column.
      // (Not from the top: the whole valley slopes down, which would stripe every row.)
      if (cx > 0 && ax % S === 0) {
        const d = g.h[i] - g.h[i - 1];
        if (d > 0.12) { r += 26; gg += 26; b += 20; }
        else if (d < -0.12) { r -= 28; gg -= 28; b -= 24; }
      }
      if (g.wall[i] > 0) { r = 150; gg = 104; b = 60; if (ay % S === 0) { r = 196; gg = 146; b = 92; } if (ay % S === S - 1) { r = 96; gg = 64; b = 36; } }
      if (g.tmp[i] > 0) { const chk = ((ax >> 1) + (ay >> 1)) & 1; r = chk ? 230 : 196; gg = chk ? 201 : 166; b = chk ? 138 : 104; }
      const o = (ay * AW + ax) * 4;
      t[o] = r; t[o + 1] = gg; t[o + 2] = b; t[o + 3] = 255;
    }
  }
}

const HP_OK = [95, 184, 90], HP_MID = [255, 209, 102], HP_LOW = [217, 72, 59], HP_BG = [43, 29, 20];
const SHORE: [number, number, number] = [232, 247, 255], ICE_SHORE: [number, number, number] = [168, 200, 226], ICE_HI: [number, number, number] = [255, 255, 255], ICE_LO: [number, number, number] = [222, 244, 255];
const LEVELS: [number, number, number][] = [[150, 212, 255], [96, 176, 244], [48, 120, 222], [26, 66, 164]];
const STEP = 0.22, WET = 0.04, ICE = 0.05;
/** Thin moving water (film) is still water: drawn between FILM and WET as a light dithered wash. */
const FILM = 0.004;
/** Speed (outflow per tick ÷ depth) above which water is white with foam: rapids. */
const FOAM_SPEED = 0.25;
const FILM_RGB: [number, number, number] = [170, 222, 255], FOAM: [number, number, number] = [248, 252, 255];

/**
 * Water over the terrain: bilinear depth from the 4 nearest cells, dithered bands, shoreline.
 * Thin films (sheet flow over a bank, a rapid) are drawn too, and fast water gets foam that
 * moves downstream with `phase` (0 when motion is reduced) — the water is never hidden.
 */
export function paintWater(a: ArtBuffers, w: HydroWorld, phase = 0): void {
  const g = w.g, { rgba, terrain, wet, depth, ice } = a, { out, s } = w.sc;
  rgba.set(terrain);
  for (let ay = 0; ay < AH; ay++) {
    const cy = (ay / S) | 0, sy = ay - cy * S, ny = sy === 0 ? Math.max(0, cy - 1) : sy === 2 ? Math.min(H - 1, cy + 1) : cy, ty = sy === 1 ? 0 : 1 / 3;
    for (let ax = 0; ax < AW; ax++) {
      const cx = (ax / S) | 0, sx = ax - cx * S, nx = sx === 0 ? Math.max(0, cx - 1) : sx === 2 ? Math.min(W - 1, cx + 1) : cx, tx = sx === 1 ? 0 : 1 / 3;
      const i00 = cy * W + cx, i10 = cy * W + nx, i01 = ny * W + cx, i11 = ny * W + nx;
      const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
      const k = ay * AW + ax;
      depth[k] = g.w[i00] * w00 + g.w[i10] * w10 + g.w[i01] * w01 + g.w[i11] * w11;
      ice[k] = g.ice[i00] * w00 + g.ice[i10] * w10 + g.ice[i01] * w01 + g.ice[i11] * w11;
      wet[k] = depth[k] > WET || ice[k] > ICE ? 1 : 0;
    }
  }
  for (let ay = 0; ay < AH; ay++) for (let ax = 0; ax < AW; ax++) {
    const k = ay * AW + ax;
    if (!wet[k]) {
      if (depth[k] > FILM) {
        // a film: half the pixels in light water, so the ground shows through and the path is clear
        if (BAYER[(ay & 3) * 4 + (ax & 3)] < 9) { const o = k * 4; rgba[o] = FILM_RGB[0]; rgba[o + 1] = FILM_RGB[1]; rgba[o + 2] = FILM_RGB[2]; }
        foam(rgba, k, ax, ay, phase, out, s, depth[k]);
      }
      continue;
    }
    const shore = (ax > 0 && !wet[k - 1]) || (ax < AW - 1 && !wet[k + 1]) || (ay > 0 && !wet[k - AW]) || (ay < AH - 1 && !wet[k + AW]);
    let c: [number, number, number];
    if (ice[k] > ICE) c = shore ? ICE_SHORE : (BAYER[(ay & 3) * 4 + (ax & 3)] < 3 ? ICE_HI : ICE_LO);
    else if (shore) c = SHORE;
    else {
      const t = Math.min(LEVELS.length - 1.001, depth[k] / STEP), b = Math.floor(t);
      c = LEVELS[(t - b) * 16 > BAYER[(ay & 3) * 4 + (ax & 3)] ? Math.min(LEVELS.length - 1, b + 1) : b];
    }
    const o = k * 4; rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2];
    if (!shore && ice[k] <= ICE) foam(rgba, k, ax, ay, phase, out, s, depth[k]);
  }
}

/** White streaks on fast water; they slide downstream (+y) as `phase` advances. */
function foam(rgba: Uint8ClampedArray, k: number, ax: number, ay: number, phase: number, out: Float64Array, s: Float64Array, d: number): void {
  const i = ((ay / S) | 0) * W + ((ax / S) | 0);
  const q = ((out[i * 4] + out[i * 4 + 1]) + (out[i * 4 + 2] + out[i * 4 + 3])) * s[i];
  if (q / Math.max(d, 0.005) < FOAM_SPEED) return;
  if (hash(ax, ay - phase) > 34) return;
  const o = k * 4; rgba[o] = FOAM[0]; rgba[o + 1] = FOAM[1]; rgba[o + 2] = FOAM[2];
}

/** Copy a sprite at art pixel (x, y) = its top-left; transparent pixels skipped. */
export function blit(rgba: Uint8ClampedArray, s: Sprite, x: number, y: number): void {
  for (let sy = 0; sy < s.h; sy++) {
    const yy = y + sy; if (yy < 0 || yy >= AH) continue;
    for (let sx = 0; sx < s.w; sx++) {
      const c = s.px[sy * s.w + sx], xx = x + sx;
      if (!c || xx < 0 || xx >= AW) continue;
      const [r, g, b] = rgbOf(c), o = (yy * AW + xx) * 4;
      rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b;
    }
  }
}
/** Centre of a cell in art pixels. */
export const artOf = (cell: number) => S * cell + 1;
const centred = (rgba: Uint8ClampedArray, s: Sprite, cx: number, cy: number) => blit(rgba, s, artOf(cx) - (s.w >> 1), artOf(cy) - (s.h >> 1));

export interface Overlay {
  mode: BuildKind | null; rec: number | null; canBuild: (site: number) => boolean;
  lit: boolean; frame: number; reduced: boolean;
  flashes: { cells: number[]; kind: 'sand' | 'ice' }[];
  /** Village edge cell where flood water came in (−1 = none). */
  floodArrow: number;
}

/** Everything that sits on the water: village, sites, buildings, badges, spirits. */
export function paintSprites(a: ArtBuffers, w: HydroWorld, o: Overlay): void {
  const rgba = a.rgba;
  // village: houses on a grid, lights on when the demand was met. Flood water is drawn over the
  // lower half of a house again, so a flooded village looks flooded.
  for (let y = VILLAGE.y0 + 2; y <= VILLAGE.y1 - 1; y += 5) for (let x = VILLAGE.x0 + 2; x <= VILLAGE.x1 - 1; x += 5) {
    centred(rgba, o.lit ? SPRITES.house : SPRITES.houseDark, x, y);
    const x0 = artOf(x) - 6, y0 = artOf(y);
    for (let yy = y0; yy < y0 + 6 && yy < AH; yy++) for (let xx = x0; xx < x0 + 12; xx++) {
      const k = yy * AW + xx;
      if (a.depth[k] < 0.08) continue;
      const deep = a.depth[k] > 0.25 || yy >= y0 + 3;
      if (!deep && ((xx + yy) & 1)) continue;
      const q = k * 4; rgba[q] = 96; rgba[q + 1] = 176; rgba[q + 2] = 244;
    }
  }
  if (o.floodArrow >= 0) {
    const c = o.floodArrow, bob = o.reduced ? 0 : (o.frame >> 3) & 1;
    blit(rgba, SPRITES.arrow, artOf(c % W) - 4, artOf((c / W) | 0) - 12 + bob);
  }
  for (const st of SITES) {
    const k = w.built[st.id];
    if (k === 'wheel') {
      const p = w.plants.find(q => q.site === st.id)!;
      const frame = o.reduced ? 0 : Math.floor(p.spin) & 3;
      centred(rgba, p.hp > 0 ? SPRITES.wheel[frame] : SPRITES.wheelBroken, st.x, st.y);
      // health strip under the wheel (3 colours, art pixels)
      const bx = artOf(st.x) - 8, by = artOf(st.y) + 10, fill = Math.round(16 * p.hp);
      for (let i = 0; i < 16; i++) {
        const c = i < fill ? (p.hp > 0.5 ? HP_OK : p.hp > 0.2 ? HP_MID : HP_LOW) : HP_BG;
        for (let yy = by; yy < by + 2 && yy < AH; yy++) { const q = (yy * AW + bx + i) * 4; rgba[q] = c[0]; rgba[q + 1] = c[1]; rgba[q + 2] = c[2]; }
      }
      if (w.phase !== 'ready') {
        const badge = p.hp <= 0 ? SPRITES.broken : p.drown > 0.2 ? SPRITES.drown : p.power * T.tps < 0.5 ? SPRITES.sleep : null;
        if (badge) blit(rgba, badge, artOf(st.x) + 6, artOf(st.y) - 14);
      }
    } else if (k === 'reservoir') centred(rgba, SPRITES.gate, st.x, st.y);
    else if (k === 'wall') centred(rgba, SPRITES.stakes, st.x, st.y);
    else if (!o.mode || o.canBuild(st.id)) {
      const isRec = o.mode !== null && o.rec === st.id;
      const pulse = isRec && !o.reduced && ((o.frame >> 3) & 1) === 1;
      centred(rgba, isRec ? SPRITES.star : SPRITES.site, st.x, st.y - (pulse ? 1 : 0));
    }
  }
  // spirit flashes: lit cells + the spirit next to them
  for (const f of o.flashes) {
    for (const c of f.cells) {
      const x0 = (c % W) * S, y0 = ((c / W) | 0) * S;
      for (let yy = y0; yy < y0 + S; yy++) for (let xx = x0; xx < x0 + S; xx++) if (((xx + yy) & 1) === 0) { const q = (yy * AW + xx) * 4; rgba[q] = 255; rgba[q + 1] = 255; rgba[q + 2] = 255; }
    }
    const mid = f.cells[f.cells.length >> 1];
    if (mid !== undefined) centred(rgba, f.kind === 'sand' ? SPRITES.sandSpirit : SPRITES.iceSpirit, (mid % W) + 5, ((mid / W) | 0) - 3);
  }
}
