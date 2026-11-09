/**
 * Pixel sprites for the V4 prototype (docs/ART_DIRECTION_V4_PIXEL.md §3.3).
 * One character = one palette index; '.' is transparent. Every sprite is drawn on the same
 * art-pixel grid as the water (3 art px per sim cell). No DOM.
 */

/** Palette: RGB per index character. */
export const PALETTE: Record<string, [number, number, number]> = {
  '0': [43, 29, 20],    // outline
  '1': [107, 68, 35],   // wood dark
  '2': [160, 104, 47],  // wood
  '3': [215, 155, 82],  // wood light
  '4': [125, 135, 144], // stone
  '5': [195, 204, 211], // stone light
  '6': [246, 243, 232], // white
  '7': [217, 72, 59],   // red
  '8': [255, 209, 102], // yellow
  '9': [61, 139, 224],  // blue
  'a': [159, 216, 255], // light blue
  'b': [95, 184, 90],   // green
  'c': [47, 122, 58],   // dark green
  'd': [230, 201, 138], // sand
  'e': [242, 140, 56],  // orange
  'f': [29, 75, 143],   // deep blue
};

export interface Sprite { w: number; h: number; px: Uint8Array /* palette code, 0 = transparent */ }
const CODES = Object.keys(PALETTE);
/** Palette code (1-based) per character; 0 = transparent. */
export const codeOf = (ch: string) => (ch === '.' ? 0 : CODES.indexOf(ch) + 1);
export const rgbOf = (code: number) => PALETTE[CODES[code - 1]];

function make(rows: string[]): Sprite {
  const h = rows.length, w = rows[0].length, px = new Uint8Array(w * h);
  rows.forEach((r, y) => { if (r.length !== w) throw Error(`sprite row ${y} is ${r.length} wide, want ${w}`); for (let x = 0; x < w; x++) px[y * w + x] = codeOf(r[x]); });
  return { w, h, px };
}
function recolor(s: Sprite, map: Record<string, string>): Sprite {
  const m = new Map(Object.entries(map).map(([a, b]) => [codeOf(a), codeOf(b)]));
  return { w: s.w, h: s.h, px: s.px.map(c => m.get(c) ?? c) };
}

/** Water wheel, 18×18: rim, hub, 8 paddles at `angle` (radians). Rasterised once, no smoothing. */
function wheel(angle: number, broken = false): Sprite {
  const n = 18, c = (n - 1) / 2, px = new Uint8Array(n * n);
  const W = codeOf(broken ? '4' : '2'), D = codeOf(broken ? '0' : '1'), L = codeOf(broken ? '5' : '3'), O = codeOf('0');
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = x - c, dy = y - c, r = Math.hypot(dx, dy);
    let v = 0;
    if (r >= 8.1) v = 0;
    else if (r >= 7.2) v = O;
    else if (r >= 5.9) v = W;
    else if (r < 1.6) v = O;
    else if (r < 2.6) v = L;
    else {
      let a = Math.atan2(dy, dx) - angle;
      a = ((a % (Math.PI / 4)) + Math.PI / 4) % (Math.PI / 4);
      const d = Math.min(a, Math.PI / 4 - a) * r;
      if (d < 0.75) v = D;
    }
    px[y * n + x] = v;
  }
  return { w: n, h: n, px };
}

const house = make([
  '....0000....',
  '...077770...',
  '..07777770..',
  '.0777777770.',
  '077777777770',
  '.0666666660.',
  '.0688668860.',
  '.0688668860.',
  '.0666666660.',
  '.0661166660.',
  '.0661166660.',
  '.0000000000.',
]);
const heart = make([
  '.00...00.',
  '0770.0770',
  '077707770',
  '077777770',
  '.0777770.',
  '..07770..',
  '...070...',
  '....0....',
  '.........',
]);

export const SPRITES = {
  wheel: [0, 1, 2, 3].map(k => wheel((k * Math.PI) / 16)),
  wheelBroken: wheel(0.3, true),
  house,
  houseDark: recolor(house, { '8': '4', '7': '1', '6': '5' }),
  sandSpirit: make([
    '....0000....',
    '..00dddd00..',
    '.0dddddddd0.',
    '.0dd0dd0dd0.',
    '0ddd0dd0ddd0',
    '0dddddddddd0',
    '0dd0dddd0dd0',
    '.0dd0000dd0.',
    '.0dddddddd0.',
    '..0dddddd0..',
    '...0d00d0...',
    '....0..0....',
  ]),
  iceSpirit: make([
    '.....00.....',
    '....0660....',
    '..00aaaa00..',
    '.0aa6aaaaa0.',
    '0aaafaafaaa0',
    '0aaafaafaaa0',
    '0aaaaaaaaaa0',
    '0aa0aaaa0aa0',
    '.0aa0000aa0.',
    '.0aaaaaaaa0.',
    '..0a0aa0a0..',
    '...0.00.0...',
  ]),
  drown: make([
    '....00...',
    '...0aa0..',
    '...0a60..',
    '....00...',
    '.00...00.',
    '0aa0.0a60',
    '0a60.0aa0',
    '.00...00.',
    '.........',
  ]),
  sleep: make([
    '000000000',
    '066666660',
    '000006600',
    '....0660.',
    '...0660..',
    '..0660...',
    '.0660000.',
    '066666660',
    '000000000',
  ]),
  broken: make([
    '00.....00',
    '070...070',
    '.070.070.',
    '..07070..',
    '...070...',
    '..07070..',
    '.070.070.',
    '070...070',
    '00.....00',
  ]),
  site: make([
    '..6.6.6..',
    '.........',
    '6...6...6',
    '....6....',
    '6.66666.6',
    '....6....',
    '6...6...6',
    '.........',
    '..6.6.6..',
  ]),
  star: make([
    '....0....',
    '...080...',
    '...080...',
    '000888000',
    '.0888880.',
    '..08880..',
    '.0880880.',
    '.080.080.',
    '.00...00.',
  ]),
  heart,
  heartEmpty: recolor(heart, { '7': '4' }),
  coin: make([
    '..00000..',
    '.0888880.',
    '088888880',
    '0880e0880',
    '0880e0880',
    '0880e0880',
    '088888880',
    '.0888880.',
    '..00000..',
  ]),
  hammer: make([
    '.000000.....',
    '04444440....',
    '04555540....',
    '04444440....',
    '.000120.....',
    '....0120....',
    '.....0120...',
    '......0120..',
    '.......0120.',
    '........0120',
    '.........010',
    '..........0.',
  ]),
  shield: make([
    '.0000000000.',
    '059999999950',
    '059999999950',
    '059996999950',
    '059966699950',
    '059996999950',
    '059999999950',
    '.0599999950.',
    '.0599999950.',
    '..05999950..',
    '...059950...',
    '....0000....',
  ]),
  gate: make([
    '000000000',
    '044444440',
    '049999940',
    '049aaa940',
    '049999940',
    '049aaa940',
    '049999940',
    '044444440',
    '000000000',
  ]),
  stakes: make([
    '.0.0.0.0.',
    '030303030',
    '030303030',
    '000000000',
    '022222220',
    '000000000',
    '030303030',
    '030303030',
    '000000000',
  ]),
  play: make([
    '00.......',
    '0600.....',
    '066600...',
    '06666600.',
    '066666660',
    '06666600.',
    '066600...',
    '0600.....',
    '00.......',
  ]),
  sun: make([
    '.....88.....',
    '.8...88...8.',
    '..8......8..',
    '....0000....',
    '...088880...',
    '88.088880.88',
    '88.088880.88',
    '...088880...',
    '....0000....',
    '..8......8..',
    '.8...88...8.',
    '.....88.....',
  ]),
  rain: make([
    '....0000....',
    '..00666600..',
    '.0666665560.',
    '066666655560',
    '066666555560',
    '.0000000000.',
    '..9...9...9.',
    '.9...9...9..',
    '....9...9...',
    '...9...9....',
    '..9...9...9.',
    '.9...9...9..',
  ]),
  drought: make([
    '...8....8...',
    '....8..8....',
    '..8.8888.8..',
    '....8888....',
    '..8.8888.8..',
    '....8..8....',
    '...8....8...',
    '000000000000',
    '0dd0ddd0ddd0',
    '0ddd0dd0dd00',
    '0d0ddd0ddd00',
    '000000000000',
  ]),
  thaw: make([
    '.....a......',
    '..a..a..a...',
    '...a.a.a....',
    '....aaa.....',
    '.aaaaaaaaa..',
    '....aaa.....',
    '...a.a.a..9.',
    '..a..a..a99.',
    '.....a...99.',
    '........9999',
    '........9999',
    '.........99.',
  ]),
  storm: make([
    '....0000....',
    '..00444400..',
    '.0444444440.',
    '044444444440',
    '044444444440',
    '.0000880000.',
    '.....880....',
    '....880.....',
    '...888888...',
    '.....880....',
    '....880.....',
    '....80......',
  ]),
} as const;

export type SpriteName = Exclude<keyof typeof SPRITES, 'wheel'> | 'wheel0';
/** Look up a sprite by name (`wheel0` = first wheel frame). */
export function sprite(name: SpriteName): Sprite {
  return name === 'wheel0' ? SPRITES.wheel[0] : SPRITES[name];
}
