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
  'g': [236, 128, 170], // blossom pink
  'h': [255, 212, 228], // blossom light
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
      // one light paddle so the turning is easy to see
      let full = Math.atan2(dy, dx) - angle; full = ((full % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      if (d < 0.75) v = Math.round(full / (Math.PI / 4)) % 8 === 0 ? L : D;
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
/** Build-spot marker, 11×11: a ring with a dark outline (and a plus when you can build). Rasterised once. */
function ring(fill: string, plus: boolean): Sprite {
  const n = 11, c = 5, px = new Uint8Array(n * n), F = codeOf(fill), O = codeOf('0');
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = x - c, dy = y - c, r = Math.hypot(dx, dy);
    let v = 0;
    if (r >= 4.4 && r < 5.5) v = O;
    else if (r >= 3.3 && r < 4.4) v = F;
    else if (r >= 2.6 && r < 3.3) v = O;
    if (plus && ((dx === 0 && Math.abs(dy) <= 1) || (dy === 0 && Math.abs(dx) <= 1))) v = F;
    px[y * n + x] = v;
  }
  return { w: n, h: n, px };
}
const tree = make([
  '....0000....',
  '..00bbbb00..',
  '.0bbbbbbbb0.',
  '0bbcbbbbcbb0',
  '0bbbbbbbbbb0',
  '0bcbbbbbbcb0',
  '.0bbbbcbbb0.',
  '..00bbbb00..',
  '....0110....',
  '....0110....',
  '....0110....',
  '...001100...',
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
  /** Trees by season: spring blossom, summer green, autumn leaves, winter bare with snow. */
  trees: [
    recolor(tree, { b: 'h', c: 'g' }),
    tree,
    recolor(tree, { b: 'e', c: '7' }),
    make([
      '...6....6...',
      '..060..060..',
      '...0.00.0...',
      '.6..0000..6.',
      '.06..00..06.',
      '..0..00..0..',
      '...0.00.0...',
      '....0000....',
      '....0110....',
      '....0110....',
      '....0110....',
      '...001100...',
    ]),
  ],
  siteWait: ring('4', false),
  rock: make([
    '............',
    '............',
    '....0000....',
    '...055540...',
    '..05555440..',
    '.0555544440.',
    '.0554444440.',
    '055444444440',
    '054444440440',
    '044404444440',
    '.0000000000.',
    '............',
  ]),
  flower: make([
    '...0.0...',
    '..0g0g0..',
    '.0gh8hg0.',
    '..0g8g0..',
    '.0gh0hg0.',
    '..0g0g0..',
    '...0c0...',
    '..0cc0...',
    '...00....',
  ]),
  bush: make([
    '............',
    '............',
    '...000000...',
    '..0bbbbbb0..',
    '.0bb7bbbcb0.',
    '0bbbbbb7bbb0',
    '0b7bbcbbbbb0',
    '0bbbb7bbb7b0',
    '0bcbbbbbbbb0',
    '.0bbb7bbcb0.',
    '..00000000..',
    '............',
  ]),
  log: make([
    '.........',
    '.0000000.',
    '032222230',
    '031222130',
    '032222230',
    '032212230',
    '.0000000.',
    '.........',
    '.........',
  ]),
  stone: make([
    '.........',
    '..00000..',
    '.0555540.',
    '055554440',
    '055444440',
    '054444440',
    '.0444440.',
    '..00000..',
    '.........',
  ]),
  up: make([
    '....0....',
    '...0b0...',
    '..0bbb0..',
    '.0bbbbb0.',
    '000bbb000',
    '..0bbb0..',
    '..0bbb0..',
    '..0bbb0..',
    '..00000..',
  ]),
  /** A full turn in 32 frames. */
  wheel: Array.from({ length: 32 }, (_, k) => wheel((k * Math.PI) / 16)),
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
  rainSpirit: recolor(make([
    '....0000....',
    '..00dddd00..',
    '.0dddddddd0.',
    '.0dd0dd0dd0.',
    '0ddd0dd0ddd0',
    '0dddddddddd0',
    '0dd0dddd0dd0',
    '.0dd0000dd0.',
    '.0dddddddd0.',
    '..00000000..',
    '..9..9..9...',
    '.9..9..9....',
  ]), { d: '5' }),
  sunSpirit: recolor(make([
    '.....00.....',
    '.e..0dd0..e.',
    '..e0dddd0e..',
    '..0dddddd0..',
    '.0dd0dd0dd0.',
    'e0dd0dd0dd0e',
    '.0dddddddd0.',
    '.0dd0000dd0.',
    '..0dddddd0..',
    '..e0dddd0e..',
    '.e..0dd0..e.',
    '.....00.....',
  ]), { d: '8' }),
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
  site: ring('6', true),
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
  /** 도수관: a pipe bringing water down to a wheel. */
  penstock: make([
    '00000.......',
    '05550.......',
    '04440.......',
    '0444000.....',
    '.0444440....',
    '..0004440...',
    '.....04440..',
    '....00000000',
    '...0233320..',
    '...0300030..',
    '...0233320..',
    '....00000...',
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
  arrow: make([
    '..00000..',
    '..07770..',
    '..07770..',
    '..07770..',
    '000777000',
    '.0777770.',
    '..07770..',
    '...070...',
    '....0....',
  ]),
  gem: make([
    '..00000..',
    '.0aa9990.',
    '0a6999990',
    '0999999f0',
    '.09999f0.',
    '..099f0..',
    '...0f0...',
    '....0....',
    '.........',
  ]),
  lock: make([
    '..00000..',
    '.0444440.',
    '.04...40.',
    '000000000',
    '088888880',
    '0888e8880',
    '0888e8880',
    '088888880',
    '000000000',
  ]),
  snow: make([
    '.....6......',
    '..6..6..6...',
    '...6.6.6....',
    '....666.....',
    '.666666666..',
    '....666.....',
    '...6.6.6....',
    '..6..6..6...',
    '.....6......',
    '............',
    '000000000000',
    '0aaaaaaaaaa0',
  ]),
  jam: make([
    '............',
    '..9..9..9...',
    '.999999999..',
    '000000000000',
    '0a6aa0a6aaa0',
    '0aaaa0aaaaa0',
    '000000000000',
    '0aa6a0aa6aa0',
    '000000000000',
    '....9..9....',
    '...9..9.....',
    '............',
  ]),
  slide: make([
    '........00..',
    '......00bb0.',
    '....00bbbb0.',
    '..00bbb1bb0.',
    '.0bbb11110..',
    '0bb1112210..',
    '0b11221110..',
    '.01122110...',
    '..0111100...',
    '.02.01.020..',
    '0220..02220.',
    '.00....000..',
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

export type SpriteName = Exclude<keyof typeof SPRITES, 'wheel' | 'trees'> | 'wheel0';
/** Look up a sprite by name (`wheel0` = first wheel frame). */
export function sprite(name: SpriteName): Sprite {
  return name === 'wheel0' ? SPRITES.wheel[0] : SPRITES[name];
}
