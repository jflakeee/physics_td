// Physics TD v6 engine — heightfield + virtual-pipes shallow water (Mei et al. 2007 style, simplified).
// Pure, DOM-free, deterministic. All volumes are in cell-units (1 cell area × 1 m depth).
export const W = 40, H = 24, N = W * H;
export const BASE = { x: 20, y: 12 };
export const INLETS = [
  { id: 'W', x: 0, y: 12, name: '서쪽', dx: 1, dy: 0 },
  { id: 'E', x: W - 1, y: 12, name: '동쪽', dx: -1, dy: 0 },
  { id: 'N', x: 20, y: 0, name: '북쪽', dx: 0, dy: 1 },
  { id: 'S', x: 20, y: H - 1, name: '남쪽', dx: 0, dy: -1 },
];
export const TOOLS = {
  levee: { name: '제방', cost: 8, upgrade: 12, line: true, key: '1' },
  trench: { name: '수로 굴착', cost: 5, line: true, key: '2' },
  pump: { name: '배수펌프', cost: 60, power: 2, key: '3' },
  cooler: { name: '냉각탑', cost: 55, power: 3, key: '4' },
  remove: { name: '철거', cost: 0, line: true, key: '5' },
};
export const LEVEE = [null, { h: 0.55, hp: 100 }, { h: 0.95, hp: 240 }];
export const POWER_CAP = 8, START_CASH = 300, BASE_HP = 100, DT = 1;
const C = 0.12, DAMP = 0.985, SEA_DROP = 0.5;
const PUMP_RATE = 0.035, COOL_RATE = 0.006, ICE_MAX = 1.2, MELT = 0.0012, EVAP = 0.00015;
const TRENCH_DEPTH = 0.35, TRENCH_MIN = -0.7;

export const WAVES = [
  { name: '봄비', dur: 600, shape: 'bell', rain: 0, flow: { W: .03, E: .03, N: .03, S: .03 }, tip: '사방에서 약한 유입. 지형을 익히세요.' },
  { name: '서쪽 상류 범람', dur: 700, shape: 'bell', rain: 0, flow: { W: .30, E: .04, N: .04, S: .04 }, tip: '서쪽 유입량이 크게 늘어납니다.' },
  { name: '집중호우', dur: 700, shape: 'flat', rain: .00025, flow: { W: .06, E: .06, N: .06, S: .06 }, tip: '맵 전역에 비가 내려 저지대가 먼저 찹니다.' },
  { name: '북·동 동시 범람', dur: 800, shape: 'bell', rain: 0, flow: { W: .05, E: .34, N: .34, S: .05 }, tip: '두 방향이 동시에 차오릅니다.' },
  { name: '남쪽 해일', dur: 500, shape: 'surge', rain: 0, flow: { W: 0, E: 0, N: 0, S: 1.5 }, tip: '짧고 강한 파고. 제방 내구도를 시험합니다.' },
  { name: '대홍수', dur: 1000, shape: 'bell', rain: .0003, flow: { W: .3, E: .3, N: .3, S: .3 }, tip: '마지막 재해. 모든 방향 최대 유입.' },
];

/** Beginner set: all water arrives from one inlet (West). */
export const WAVES_ONE = [
  { name: '봄비', dur: 600, shape: 'bell', rain: 0, flow: { W: .07 }, tip: '서쪽 한 방향에서만 물이 들어옵니다. 계곡을 따라 기지로 흐르는 길을 보세요.' },
  { name: '상류 불어남', dur: 700, shape: 'bell', rain: 0, flow: { W: .16 }, tip: '점선 원의 낮은 고개를 수로로 파면 물이 모서리 배수구로 빠집니다.' },
  { name: '소나기', dur: 700, shape: 'flat', rain: .00015, flow: { W: .10 }, tip: '맵 전체에 비가 옵니다. 기지 둘레 제방이 빗물도 막아 줍니다.' },
  { name: '상류 범람', dur: 800, shape: 'bell', rain: 0, flow: { W: .26 }, tip: '물길을 돌린 뒤 계곡을 제방으로 막으면 기지가 안전해집니다.' },
  { name: '돌발 홍수', dur: 500, shape: 'surge', rain: 0, flow: { W: .9 }, tip: '짧고 강한 물살. 제방을 콘크리트로 보강하세요.' },
  { name: '대홍수', dur: 1000, shape: 'bell', rain: .00015, flow: { W: .32 }, tip: '마지막 재해입니다.' },
];

export const idx = (x, y) => y * W + x;
export const inside = (x, y) => x >= 0 && x < W && y >= 0 && y < H;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function valueNoise(seed, scale) {
  const r = rng(seed), gw = Math.ceil(W / scale) + 2, gh = Math.ceil(H / scale) + 2, g = new Float32Array(gw * gh).map(() => r() * 2 - 1);
  const s = t => t * t * (3 - 2 * t);
  return (x, y) => { const fx = x / scale, fy = y / scale, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = s(fx - x0), ty = s(fy - y0);
    const v = (i, j) => g[j * gw + i]; const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * tx, b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * tx; return a + (b - a) * ty; };
}
export const isBase = (x, y) => Math.abs(x - BASE.x) <= 1 && Math.abs(y - BASE.y) <= 1;
export const inletAt = (x, y, ids) => INLETS.filter(p => !ids || ids.includes(p.id)).find(p => Math.abs(p.x - x) + Math.abs(p.y - y) <= 1 && (x === 0 || y === 0 || x === W - 1 || y === H - 1 || (p.x === x && p.y === y)));
export function isOutlet(x, y) {
  const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1; if (!edge) return false;
  const cx = x < W / 2 ? 0 : W - 1, cy = y < H / 2 ? 0 : H - 1;
  return Math.abs(x - cx) <= 2 && Math.abs(y - cy) <= 2;
}

function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1; let t = ((px - ax) * vx + (py - ay) * vy) / l2; t = Math.max(0, Math.min(1, t));
  return [Math.hypot(px - ax - vx * t, py - ay - vy * t), t];
}
const CORNERS = [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]];
/** Valleys run inlet→base; each valley has a saddle (spillway candidate) toward one corner. */
export function makeTerrain(seed, ids = INLETS.map(p => p.id)) {
  const act = INLETS.filter(p => ids.includes(p.id));
  const r = rng(seed * 9973 + 1), n1 = valueNoise(seed, 5), n2 = valueNoise(seed + 7, 2.5), t = new Float32Array(N);
  // which corner each inlet's saddle leads to (seeded)
  const pick = { W: r() < .5 ? 0 : 2, E: r() < .5 ? 1 : 3, N: r() < .5 ? 0 : 1, S: r() < .5 ? 2 : 3 };
  const saddles = act.map(p => { const f = .22 + r() * .14; const sx = Math.round(p.x + (BASE.x - p.x) * f), sy = Math.round(p.y + (BASE.y - p.y) * f); return { id: p.id, sx, sy, f, c: CORNERS[pick[p.id]] }; });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let h = 1.25 + 0.22 * n1(x, y) + 0.08 * n2(x, y);
    const db = Math.hypot((x - BASE.x) * .8, y - BASE.y);
    h = Math.min(h, 0.02 + 0.075 * db * db / 6 + 0.04 * n2(x, y));
    for (const p of act) {
      const [d, u] = segDist(x, y, p.x, p.y, BASE.x, BASE.y);
      h = Math.min(h, 0.95 - 0.9 * u + 0.18 * d * d + 0.03 * n2(x, y));
    }
    for (const sd of saddles) {
      const p = INLETS.find(q => q.id === sd.id), valleyH = 0.95 - 0.9 * sd.f;
      const [d, u] = segDist(x, y, sd.sx, sd.sy, sd.c[0], sd.c[1]);
      const len = Math.hypot(sd.c[0] - sd.sx, sd.c[1] - sd.sy), k = u * len;
      const prof = k < 4 ? valleyH + 0.30 * Math.min(1, k / 2) : valleyH + 0.30 - (k - 4) / Math.max(1, len - 4) * (valleyH + 0.75);
      h = Math.min(h, prof + 0.22 * d * d);
    }
    for (const [cx, cy] of CORNERS) h = Math.min(h, -0.45 + 0.035 * ((x - cx) ** 2 + (y - cy) ** 2));
    if (isBase(x, y)) h = 0.38;
    t[idx(x, y)] = h;
  }
  t.saddles = saddles;
  return t;
}

export function createGame(seed = 1, opts = {}) {
  const inlets = opts.inlets ?? INLETS.map(p => p.id), terrain = makeTerrain(seed, inlets);
  return {
    seed, inlets, waves: opts.waves ?? WAVES, terrain, terrain0: Float32Array.from(terrain), saddles: terrain.saddles,
    water: new Float32Array(N), ice: new Float32Array(N),
    levee: new Uint8Array(N), leveeHp: new Float32Array(N),
    flux: [new Float32Array(N), new Float32Array(N), new Float32Array(N), new Float32Array(N)],
    structs: [], hp: BASE_HP, cash: START_CASH, wave: 0, t: 0, active: false, over: false, victory: false, tick: 0,
    stats: { inflow: 0, rain: 0, outlet: 0, pumped: 0, evap: 0, damage: 0, breaches: 0, spent: 0 },
    history: [], events: [], checkpoint: null,
  };
}

export const ground = (s, i) => s.terrain[i] + (s.levee[i] ? LEVEE[s.levee[i]].h : 0) + s.ice[i];
export const surface = (s, i) => ground(s, i) + s.water[i];
export const powerUsed = s => s.structs.reduce((a, t) => a + TOOLS[t.kind].power, 0);
export const structAt = (s, x, y) => s.structs.find(t => t.x === x && t.y === y);
export const totalWater = s => { let v = 0; for (let i = 0; i < N; i++) v += s.water[i]; return v; };
export const totalIce = s => { let v = 0; for (let i = 0; i < N; i++) v += s.ice[i]; return v; };

/** Cost of applying `kind` at (x,y), or a reason string why it is impossible. */
export function check(s, x, y, kind) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || !inside(x, y)) return { err: '보드 밖입니다.' };
  if (s.over) return { err: '게임이 끝났습니다.' };
  const tool = TOOLS[kind]; if (!tool) return { err: '알 수 없는 도구입니다.' };
  const i = idx(x, y), st = structAt(s, x, y);
  if (kind === 'remove') {
    if (st) return { cost: 0, refund: Math.floor(TOOLS[st.kind].cost / 2) };
    if (s.levee[i]) return { cost: 0, refund: Math.floor(TOOLS.levee.cost / 2) * s.levee[i] };
    return { err: '철거할 시설이 없습니다.' };
  }
  if (isBase(x, y)) return { err: '기지 부지입니다.' };
  if (inletAt(x, y, s.inlets)) return { err: '유입구에는 시공할 수 없습니다.' };
  if (st) return { err: '이미 시설이 있습니다.' };
  if (kind === 'levee') {
    if (s.levee[i] === 2 && s.leveeHp[i] >= LEVEE[2].hp) return { err: '최대 보강 상태입니다.' };
    if (s.levee[i]) { const lv = s.levee[i]; if (s.leveeHp[i] < LEVEE[lv].hp * .99 && lv === 2) return { cost: Math.ceil((1 - s.leveeHp[i] / LEVEE[2].hp) * tool.cost), note: '수리' }; return { cost: tool.upgrade, note: '콘크리트 보강' }; }
    if (s.water[i] > 0.4) return { err: '수심이 깊어 시공할 수 없습니다.' };
    return { cost: tool.cost };
  }
  if (s.levee[i]) return { err: '제방 위에는 설치할 수 없습니다.' };
  if (kind === 'trench') {
    if (s.terrain[i] - TRENCH_DEPTH < TRENCH_MIN) return { err: '더 깊이 팔 수 없습니다.' };
    if (Math.abs(x - BASE.x) <= 2 && Math.abs(y - BASE.y) <= 2) return { err: '기지 기초 주변은 굴착할 수 없습니다.' };
    return { cost: tool.cost };
  }
  if (powerUsed(s) + tool.power > POWER_CAP) return { err: `전력이 부족합니다 (${powerUsed(s)}/${POWER_CAP}).` };
  if (s.structs.some(t => Math.max(Math.abs(t.x - x), Math.abs(t.y - y)) < 2)) return { err: '다른 설비와 1칸 이상 띄우세요.' };
  return { cost: tool.cost };
}

export function apply(s, x, y, kind) {
  const c = check(s, x, y, kind); if (c.err) return c;
  if (s.cash < c.cost) return { err: '자금이 부족합니다.' };
  const i = idx(x, y);
  if (kind === 'remove') {
    const k = s.structs.findIndex(t => t.x === x && t.y === y);
    if (k >= 0) s.structs.splice(k, 1); else { s.levee[i] = 0; s.leveeHp[i] = 0; }
    s.cash += c.refund; return c;
  }
  s.cash -= c.cost; s.stats.spent += c.cost;
  if (kind === 'levee') {
    if (!s.levee[i]) { s.levee[i] = 1; s.leveeHp[i] = LEVEE[1].hp; }
    else if (c.note === '수리') s.leveeHp[i] = LEVEE[2].hp;
    else { s.levee[i] = 2; s.leveeHp[i] = LEVEE[2].hp; }
  } else if (kind === 'trench') s.terrain[i] -= TRENCH_DEPTH;
  else s.structs.push({ x, y, kind });
  return c;
}

/** Cells on a straight (Bresenham) line, for drag-to-build. */
export function lineCells(x0, y0, x1, y1) {
  const out = [], dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy;
  for (;;) { out.push([x0, y0]); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e;
    // 4-connected so water cannot slip through diagonal gaps
    if (e2 >= dy && e2 <= dx) { if (Math.abs(e2 - dy) < Math.abs(e2 - dx)) { e += dy; x0 += sx; } else { e += dx; y0 += sy; } }
    else { if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } } }
  return out;
}

export function waveIntensity(w, t) {
  const p = Math.min(1, t / w.dur);
  if (w.shape === 'flat') return p < .1 ? p / .1 : p > .85 ? (1 - p) / .15 : 1;
  if (w.shape === 'surge') return p < .08 ? p / .08 : Math.exp(-(p - .08) * 7);
  return Math.sin(Math.PI * p) ** 1.4;
}
export const nextWave = s => s.waves[s.wave] ?? null;

const snap = s => structuredCloneLite(s);
function structuredCloneLite(s) {
  return { terrain: Float32Array.from(s.terrain), water: Float32Array.from(s.water), ice: Float32Array.from(s.ice), levee: Uint8Array.from(s.levee), leveeHp: Float32Array.from(s.leveeHp),
    flux: s.flux.map(f => Float32Array.from(f)), structs: s.structs.map(t => ({ ...t })), hp: s.hp, cash: s.cash, wave: s.wave, stats: { ...s.stats }, history: s.history.map(h => ({ ...h })) };
}
export function startWave(s) {
  if (s.active || s.over || s.wave >= s.waves.length) return false;
  s.checkpoint = snap(s); s.active = true; s.t = 0; s.waveDamage = 0; s.waveBreaches = 0; s.events = [];
  return true;
}
export function retryWave(s) {
  if (!s.checkpoint) return false;
  Object.assign(s, structuredCloneLite(s.checkpoint)); s.active = false; s.over = false; s.victory = false; s.events = [];
  return true;
}

function flow(s) {
  const { water, flux } = s, sf = new Float32Array(N);
  for (let i = 0; i < N; i++) sf[i] = surface(s, i);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y), out = isOutlet(x, y);
    let tot = 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
      let sj;
      if (inside(nx, ny)) sj = sf[idx(nx, ny)];
      else if (out) sj = s.terrain[i] - SEA_DROP; else { flux[d][i] = 0; continue; }
      const f = Math.max(0, flux[d][i] * DAMP + C * DT * (sf[i] - sj));
      flux[d][i] = f; tot += f;
    }
    if (tot * DT > water[i]) { const k = tot > 0 ? water[i] / (tot * DT) : 0; for (let d = 0; d < 4; d++) flux[d][i] *= k; }
  }
  const next = Float32Array.from(water);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    for (let d = 0; d < 4; d++) {
      const f = flux[d][i] * DT; if (f <= 0) continue;
      next[i] -= f;
      const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
      if (inside(nx, ny)) next[idx(nx, ny)] += f; else s.stats.outlet += f;
    }
  }
  for (let i = 0; i < N; i++) water[i] = next[i] < 1e-7 ? 0 : next[i];
}

function addInflow(s, id, v) {
  const p = INLETS.find(q => q.id === id); const cells = [[p.x, p.y]];
  if (p.dx) cells.push([p.x, p.y - 1], [p.x, p.y + 1]); else cells.push([p.x - 1, p.y], [p.x + 1, p.y]);
  for (const [x, y] of cells) s.water[idx(x, y)] += v / cells.length;
  s.stats.inflow += v;
}

function structures(s) {
  for (const t of s.structs) {
    if (t.kind === 'pump') {
      let tot = 0; const cells = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = t.x + dx, y = t.y + dy; if (!inside(x, y)) continue; const i = idx(x, y); cells.push(i); tot += s.water[i]; }
      const take = Math.min(PUMP_RATE * DT, tot); t.load = take / (PUMP_RATE * DT);
      if (take > 0) for (const i of cells) s.water[i] -= s.water[i] / tot * take;
      s.stats.pumped += take;
    } else if (t.kind === 'cooler') {
      let made = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { if (dx * dx + dy * dy > 5) continue; const x = t.x + dx, y = t.y + dy; if (!inside(x, y)) continue; const i = idx(x, y);
        const v = Math.min(s.water[i], COOL_RATE * DT, ICE_MAX - s.ice[i]); if (v > 0) { s.water[i] -= v; s.ice[i] += v; made += v; } }
      t.load = Math.min(1, made / (COOL_RATE * 6));
    }
  }
  const cooled = new Uint8Array(N);
  for (const t of s.structs) if (t.kind === 'cooler') for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const x = t.x + dx, y = t.y + dy; if (inside(x, y) && dx * dx + dy * dy <= 5) cooled[idx(x, y)] = 1; }
  for (let i = 0; i < N; i++) {
    if (s.ice[i] > 0 && !cooled[i]) { const v = Math.min(s.ice[i], MELT * DT); s.ice[i] -= v; s.water[i] += v; }
    if (s.water[i] > 0 && s.water[i] < 0.02) { const v = Math.min(s.water[i], EVAP * DT); s.water[i] -= v; s.stats.evap += v; }
  }
}

function levees(s) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y); if (!s.levee[i]) continue;
    let hi = -Infinity, lo = Infinity;
    for (const [dx, dy] of DIRS) { const nx = x + dx, ny = y + dy; if (!inside(nx, ny)) continue; const j = idx(nx, ny); if (s.levee[j]) continue; const sj = surface(s, j); if (sj > hi) hi = sj; if (sj < lo) lo = sj; }
    const top = ground(s, i), over = s.water[i] + (s.flux[0][i] + s.flux[1][i] + s.flux[2][i] + s.flux[3][i]) * DT;
    const head = hi === -Infinity ? 0 : Math.max(0, hi - Math.max(lo, s.terrain[i]));
    // overtopping scours fast; high head difference causes slow seepage damage
    const dmg = over * 45 + Math.max(0, head - 0.55) * 1.4 + (hi > top ? (hi - top) * 30 : 0);
    if (dmg > 0) s.leveeHp[i] -= dmg * DT;
    if (s.leveeHp[i] <= 0) { s.levee[i] = 0; s.leveeHp[i] = 0; s.stats.breaches++; s.waveBreaches = (s.waveBreaches || 0) + 1; s.events.push({ tick: s.tick, type: 'breach', x, y }); }
  }
}

const BASE_DRAIN = 0.008;
function baseDrain(s) {
  let tot = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) tot += s.water[idx(BASE.x + dx, BASE.y + dy)];
  const take = Math.min(tot, BASE_DRAIN * DT); if (take <= 0) return;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const i = idx(BASE.x + dx, BASE.y + dy); s.water[i] -= s.water[i] / tot * take; }
  s.stats.pumped += take;
}
export function baseFlood(s) { let f = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) f += Math.max(0, s.water[idx(BASE.x + dx, BASE.y + dy)] - 0.03); return f; }

/** Advance one fixed tick. Returns 'idle' | 'active' | 'complete' | 'defeat' | 'victory'. */
export function step(s) {
  if (s.over) return 'idle';
  s.tick++;
  let w = null;
  if (s.active) {
    w = s.waves[s.wave]; const k = waveIntensity(w, s.t);
    for (const id in w.flow) if (w.flow[id] > 0 && s.inlets.includes(id)) addInflow(s, id, w.flow[id] * k * DT);
    if (w.rain) { const r = w.rain * Math.max(k, .3) * DT; let n = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!isBase(x, y)) { s.water[idx(x, y)] += r; n++; } s.stats.rain += r * n; }
  }
  flow(s); structures(s); levees(s); baseDrain(s);
  const f = baseFlood(s);
  if (f > 0) { const d = Math.min(f, 4) * 0.1 * DT; s.hp = Math.max(0, s.hp - d); s.stats.damage += d; s.waveDamage = (s.waveDamage || 0) + d; }
  if (s.hp <= 0) { s.active = false; s.over = true; s.events.push({ tick: s.tick, type: 'defeat' }); return 'defeat'; }
  if (!s.active) return 'idle';
  s.t++;
  if (s.t >= w.dur) {
    s.active = false;
    const reward = 100 + s.wave * 30 + Math.round(s.hp * 0.5);
    s.cash += reward;
    s.history.push({ wave: s.wave + 1, name: w.name, damage: +(s.waveDamage || 0).toFixed(1), breaches: s.waveBreaches || 0, reward, hp: Math.round(s.hp) });
    s.wave++;
    if (s.wave >= s.waves.length) { s.over = true; s.victory = true; return 'victory'; }
    return 'complete';
  }
  return 'active';
}

export const stars = s => !s.victory ? 0 : s.hp >= 80 ? 3 : s.hp >= 50 ? 2 : 1;
