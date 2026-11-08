// v2 scale calibration prototype (design gap review C1~C6, H1, H4).
// Usage: node prototypes/v2-calibrate.mjs [I1=...] [rain=0.2] [cap=0.25] [wall=0.4] [map=dike|willow]
// Prints per-strategy outcome so scale constants can be tuned against targets.
const W = 64, H = 96, N = W * H, K = 0.20;
const MAPS = {
  dike: { tiles: ["PPPIPPPO","PPFPPPPP","PPPPPPFP","PDPPPPPP","PPPPPPPP","IPPBBPPP","PPPBBPPI","PPPPPPPP","PPFPPPDP","PPPPPPPP","PPPPFPPP","OPPPIPPP"], weights: null },
  willow: { tiles: ["PPPOPPPP","PFPPPPFP","PPPPPPPP","PDDPPDDP","PDDPPDDP","PPPBBPPP","PPPBBPPP","PDDPPDDP","PDDPPWWP","PWWPPWWP","PPPPPPPP","PPPIIPPP"], weights: null },
};
// type offsets relative to the slope surface (scale table)
const OFF = { P: 0, F: 0.05, H: 0.4, D: -0.08, W: -0.12, R: -0.2, B: 0, I: 0, O: -0.1 };
const arg = Object.fromEntries(process.argv.slice(2).map(a => a.split('=')).map(([k, v]) => [k, isNaN(+v) ? v : +v]));
const C = {
  map: arg.map ?? 'dike',
  I1: arg.I1 ?? 120,           // W1 inlet volume
  growth: 1.35,
  rain: arg.rain ?? 0.2,       // fraction of wave volume that falls as rain everywhere
  baseLevel: 0.6, slope: 0.8,
  evap: arg.evap ?? 0.00002,   // proportional
  outletRate: 0.05,
  pumpRate: 0.015, pumpR: 3,
  pumpCap: arg.cap ?? 0.25,    // per-pump total cap = cap × mean W3 inflow per tick
  wall: arg.wall ?? 0.4,
  waveSec: w => 40 + 7.5 * (w - 1), // H1: 40s -> 70s
  pulse: 45,
};
const hash = (x, y) => { let n = (x * 374761393 + y * 668265263) | 0; n = (n ^ (n >>> 13)) * 1274126177 | 0; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };

function build(mapId) {
  const tiles = MAPS[mapId].tiles;
  const h = new Float32Array(N), outlet = new Uint8Array(N), inlets = [], base = [];
  let bx = 0, by = 0, bc = 0;
  for (let ty = 0; ty < 12; ty++) for (let tx = 0; tx < 8; tx++) if (tiles[ty][tx] === 'B') { bx += tx * 8 + 4; by += ty * 8 + 4; bc++; }
  bx = Math.round(bx / bc) - 0.5; by = Math.round(by / bc) - 0.5;
  const dmax = Math.hypot(Math.max(bx, W - bx), Math.max(by, H - by));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = tiles[y >> 3][x >> 3];
    h[y * W + x] = C.baseLevel + C.slope * Math.hypot(x - bx, y - by) / dmax + OFF[t] + (hash(x, y) - 0.5) * 0.04;
  }
  const cx = Math.floor(bx), cy = Math.floor(by);
  for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) base.push(y * W + x);
  for (let ty = 0; ty < 12; ty++) for (let tx = 0; tx < 8; tx++) {
    const t = tiles[ty][tx]; if (t !== 'I' && t !== 'O') continue; const cells = [];
    if (ty === 0) for (let x = tx * 8 + 2; x < tx * 8 + 6; x++) cells.push(x);
    else if (ty === 11) for (let x = tx * 8 + 2; x < tx * 8 + 6; x++) cells.push((H - 1) * W + x);
    else if (tx === 0) for (let y = ty * 8 + 2; y < ty * 8 + 6; y++) cells.push(y * W);
    else if (tx === 7) for (let y = ty * 8 + 2; y < ty * 8 + 6; y++) cells.push(y * W + W - 1);
    if (t === 'I') inlets.push(cells); else cells.forEach(c => outlet[c] = 1);
  }
  return { h, outlet, inlets, base, cx, cy };
}

function run(strategy) {
  const M = build(C.map);
  const w = new Float32Array(N), wall = new Float32Array(N), out = new Float32Array(N * 4), s = new Float32Array(N);
  const dx = [1, -1, 0, 0], dy = [0, 0, 1, -1];
  const meanW3 = C.I1 * C.growth ** 2 / (C.waveSec(3) * 30);
  const pumps = [];
  strategy.setup?.({ M, wall, pumps, C });
  let hp = 100, acc = 0, drained = 0, blocked = 0, noDmgWaves = 0, result = 'clear', deathWave = 0;
  for (let wv = 1; wv <= 5; wv++) {
    const len = C.waveSec(wv) * 30, Iw = C.I1 * C.growth ** (wv - 1), np = Math.floor(len / C.pulse);
    let dmgWave = 0, maxFlood = 0;
    for (let t = 0; t < len; t++) {
      if (t % C.pulse === 0) {
        const inl = Iw * (1 - C.rain) / np / M.inlets.length;
        for (const c of M.inlets) for (const i of c) w[i] += inl / c.length;
        const r = Iw * C.rain / np / N; for (let i = 0; i < N; i++) w[i] += r;
      }
      for (let i = 0; i < N; i++) {
        const x = i % W, y = (i / W) | 0, Hi = M.h[i] + wall[i] + w[i]; let tot = 0;
        for (let d = 0; d < 4; d++) { const nx = x + dx[d], ny = y + dy[d]; let o = 0; if (nx >= 0 && nx < W && ny >= 0 && ny < H) { const j = ny * W + nx; o = Math.max(0, Hi - (M.h[j] + wall[j] + w[j])) * K; } out[i * 4 + d] = o; tot += o; }
        s[i] = tot > w[i] ? (tot > 0 ? w[i] / tot : 0) : 1;
      }
      for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0; for (let d = 0; d < 4; d++) { const o = out[i * 4 + d] * s[i]; if (o) { w[i] -= o; w[(y + dy[d]) * W + x + dx[d]] += o; } } }
      for (let i = 0; i < N; i++) { if (M.outlet[i]) { const d = Math.min(w[i], C.outletRate); w[i] -= d; drained += d; } w[i] -= w[i] * C.evap; }
      for (const p of pumps) {
        let budget = C.pumpCap * meanW3;
        for (let yy = -C.pumpR; yy <= C.pumpR && budget > 0; yy++) for (let xx = -C.pumpR; xx <= C.pumpR && budget > 0; xx++) {
          if (xx * xx + yy * yy > C.pumpR ** 2) continue; const i = (p[1] + yy) * W + p[0] + xx;
          const d = Math.min(w[i], C.pumpRate, budget); w[i] -= d; budget -= d; drained += d;
        }
      }
      for (let i = 0; i < N; i++) if (wall[i] > 0) { const x = i % W, y = (i / W) | 0; let m = 0; for (let d = 0; d < 4; d++) { const nx = x + dx[d], ny = y + dy[d]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const j = ny * W + nx; m = Math.max(m, Math.min(w[j], wall[i])); } blocked += m * 0.01; }
      let f = 0; for (const i of M.base) f += w[i]; maxFlood = Math.max(maxFlood, f);
      const dmg = Math.max(0, f - 1.2) * 2 / 30; acc += dmg; dmgWave += dmg; hp = 100 - Math.floor(acc);
      if (hp <= 0) { result = 'defeat'; deathWave = wv; break; }
    }
    if (dmgWave < 1) noDmgWaves++;
    if (result === 'defeat') break;
  }
  const score = { clear: Math.min(4, deathWave ? deathWave - 1 : 4) * 100, noDmg: noDmgWaves * 60, drained: Math.round(drained * 2 * (arg.drainK ?? 0.15)), blocked: Math.round(blocked * 2) };
  return { result: result === 'defeat' ? `defeat W${deathWave}` : 'clear', hp: Math.max(0, hp), drained: drained.toFixed(0), blocked: blocked.toFixed(1), score };
}

// --- strategies -------------------------------------------------------------
const nearestOnPath = ({ M }, k) => { // pump on the line inlet->base, k cells from base
  const c = M.inlets[0][1], ix = c % W, iy = (c / W) | 0, d = Math.hypot(ix - M.cx, iy - M.cy);
  return [Math.round(M.cx + (ix - M.cx) * k / d), Math.round(M.cy + (iy - M.cy) * k / d)];
};
const ring = ({ M, wall, C }, r, gapEvery = 0) => { let n = 0; for (let y = M.cy - r; y <= M.cy + r; y++) for (let x = M.cx - r; x <= M.cx + r; x++) { if (Math.max(Math.abs(x - M.cx), Math.abs(y - M.cy)) !== r) continue; n++; if (gapEvery && n % gapEvery === 0) continue; wall[y * W + x] = C.wall; } };
const pumpsAround = (ctx, r) => { const { M, pumps } = ctx; pumps.push([M.cx, M.cy - r], [M.cx, M.cy + r]); };
const STRATS = {
  none: {},
  onePumpOnPath: { setup: ctx => ctx.pumps.push(nearestOnPath(ctx, 6)) },
  twoPumps: { setup: ctx => pumpsAround(ctx, 5) },
  levyRingOnly: { setup: ctx => ring(ctx, 6) },
  leakyRing: { setup: ctx => ring(ctx, 6, 7) },
  ringPlusPump: { setup: ctx => { ring(ctx, 6); ctx.pumps.push([ctx.M.cx, ctx.M.cy - 9]); } },
  twoRingsTwoPumps: { setup: ctx => { ring(ctx, 5); ring(ctx, 9); pumpsAround(ctx, 12); } },
};
const t0 = performance.now();
console.log(`map=${C.map} I1=${C.I1} rain=${C.rain} cap=${C.pumpCap} wall=${C.wall}`);
for (const [name, st] of Object.entries(STRATS)) {
  const r = run(st);
  console.log(name.padEnd(18), r.result.padEnd(10), 'hp', String(r.hp).padStart(3), 'drained', r.drained.padStart(5), 'blocked', r.blocked.padStart(6), 'score', JSON.stringify(r.score));
}
console.log('elapsed s', ((performance.now() - t0) / 1000).toFixed(1));
