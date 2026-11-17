import { W, H, N, BASE, INLETS, TOOLS, LEVEE, POWER_CAP, BASE_HP, WAVES, WAVES_ONE, idx, isOutlet, createGame, powerUsed, totalWater, check, apply, lineCells, waveIntensity, nextWave, startWave, retryWave, baseFlood, step, stars } from './engine.js';
// ---------- UI ----------
const MAPS = [
  { id: 'one-w', seed: 1, name: '입문 · 서쪽 강', note: '서쪽 한 방향에서만 물이 들어옵니다. 처음이라면 여기부터.', inlets: ['W'], waves: WAVES_ONE, hint: true, level: '쉬움' },
  { id: 's1', seed: 1, name: '청류 분지', note: '사방 유입. 안부가 뚜렷합니다.', hint: true, level: '보통' },
  { id: 's4', seed: 4, name: '쌍계 평야', note: '두 유입이 같은 배수구를 공유합니다.', level: '보통' },
  { id: 's5', seed: 5, name: '남천 저지', note: '남쪽 해일이 거셉니다.', level: '어려움' },
  { id: 's3', seed: 3, name: '고갯마루', note: '마지막 재해가 혹독합니다.', level: '매우 어려움' },
];
const activeInlets = () => INLETS.filter(p => game.inlets.includes(p.id));
const SPEEDS = [1, 2, 4], TICK_HZ = 30;
const $ = s => document.querySelector(s);
const canvas = $('#board'), ctx = canvas.getContext('2d');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let game, mapInfo, tool = 'levee', speedIx = 0, paused = false, showFlow = true, showContour = true;
let PX = 1, zoom = 1, drag = null, pending = null, hover = null, kbd = null, flash = [], lastFrame = 0, acc = 0, terrainDirty = true, toastTimer = 0;
const terrainCanvas = document.createElement('canvas'), tctx = terrainCanvas.getContext('2d');
const waterImg = document.createElement('canvas'); waterImg.width = W; waterImg.height = H; const wctx = waterImg.getContext('2d'); const wdata = wctx.createImageData(W, H);

function store(key, val) { try { if (val === undefined) return JSON.parse(localStorage.getItem(key) || 'null'); localStorage.setItem(key, JSON.stringify(val)); } catch { return null; } }
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

// ---------- new game / maps ----------
function newGame(m) {
  mapInfo = m; game = createGame(m.seed, { inlets: m.inlets, waves: m.waves }); paused = false; pending = null; drag = null; terrainDirty = true;
  $('#map-name').textContent = m.name; closeModal(); renderAll();
  toast(game.wave === 0 ? '물은 높은 곳에서 낮은 곳으로 흐릅니다. 유입 계곡과 모서리 배수구를 먼저 살펴보세요.' : '');
}
function openMaps() {
  const list = $('#map-list'); list.replaceChildren();
  for (const m of MAPS) {
    const best = store('ptd6-best-' + m.id) || 0, b = document.createElement('button');
    b.className = 'map-pick'; b.innerHTML = `<strong>${m.name} <small>${m.level}</small></strong><span>${m.note}</span><em aria-label="최고 기록 별 ${best}개">${'★'.repeat(best)}${'☆'.repeat(3 - best)}</em>`;
    b.onclick = () => newGame(m); list.append(b);
  }
  const r = document.createElement('button'); r.className = 'map-pick';
  r.innerHTML = '<strong>무작위 지형</strong><span>매번 다른 지형. 클리어를 보장하지 않습니다.</span><em></em>';
  r.onclick = () => newGame({ seed: 100 + Math.floor(Math.random() * 1e6), name: '무작위 지형', note: '', level: '?' }); list.append(r);
  showModal('#maps');
}
function showModal(id) { document.querySelectorAll('.modal').forEach(m => m.hidden = m !== $(id)); $('#scrim').hidden = false; $(id).querySelector('button')?.focus(); }
function closeModal() { document.querySelectorAll('.modal').forEach(m => m.hidden = true); $('#scrim').hidden = true; }

// ---------- canvas sizing ----------
function resize() {
  const box = $('#board-wrap').getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(240, Math.floor(box.width * zoom));
  canvas.style.touchAction = zoom > 1 ? 'pan-x pan-y' : 'none';
  canvas.style.width = w + 'px'; canvas.style.height = Math.round(w * H / W) + 'px';
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(w * H / W * dpr);
  PX = canvas.width / w; // device pixels per CSS pixel: all hairlines and text are sized in CSS px
  terrainDirty = true;
}

// ---------- terrain cache (hypsometric tint + hillshade + contours) ----------
const STOPS = [[-0.7, [76, 122, 112]], [-0.1, [122, 160, 118]], [0.4, [178, 186, 128]], [0.85, [196, 168, 112]], [1.25, [164, 132, 102]], [1.7, [226, 220, 204]]];
function tint(h) {
  for (let k = 1; k < STOPS.length; k++) if (h <= STOPS[k][0] || k === STOPS.length - 1) {
    const [h0, c0] = STOPS[k - 1], [h1, c1] = STOPS[k], t = Math.max(0, Math.min(1, (h - h0) / (h1 - h0)));
    return c0.map((v, j) => v + (c1[j] - v) * t);
  }
}
function drawTerrain() {
  terrainCanvas.width = canvas.width; terrainCanvas.height = canvas.height;
  const dark = matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.dataset.theme !== 'light' || document.documentElement.dataset.theme === 'dark';
  const small = document.createElement('canvas'); small.width = W; small.height = H; const sc = small.getContext('2d'), img = sc.createImageData(W, H), T = game.terrain;
  const at = (x, y) => T[idx(Math.max(0, Math.min(W - 1, x)), Math.max(0, Math.min(H - 1, y)))];
  // Lambert hillshade, light from the north-west at 45° (cartographic convention).
  // Slopes facing NW are lit, slopes facing SE are shaded, so basins read as basins.
  const tiny = terrainCanvas.width / W / PX < 16; // cells under 16 CSS px (phones)
  const Z = tiny ? 3.4 : 2.4, L = [-0.5, -0.5, Math.SQRT1_2];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const h = at(x, y), gx = (at(x + 1, y) - at(x - 1, y)) / 2 * Z, gy = (at(x, y + 1) - at(x, y - 1)) / 2 * Z;
    const nl = Math.hypot(gx, gy, 1), lambert = (-gx * L[0] - gy * L[1] + L[2]) / nl;
    const shade = Math.max(tiny ? .5 : .58, Math.min(tiny ? 1.4 : 1.32, lambert / L[2]));
    const c = tint(h).map(v => Math.min(255, v * shade * (dark ? .62 : 1))), o = (y * W + x) * 4;
    img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
  }
  sc.putImageData(img, 0, 0);
  tctx.imageSmoothingEnabled = true; tctx.drawImage(small, 0, 0, terrainCanvas.width, terrainCanvas.height);
  const cs = terrainCanvas.width / W;
  // grid
  tctx.strokeStyle = dark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.06)'; tctx.lineWidth = Math.max(1, PX * .5); tctx.beginPath();
  for (let x = 1; x < W; x++) { tctx.moveTo(x * cs, 0); tctx.lineTo(x * cs, terrainCanvas.height); }
  for (let y = 1; y < H; y++) { tctx.moveTo(0, y * cs); tctx.lineTo(terrainCanvas.width, y * cs); }
  tctx.stroke();
  if (showContour) contours(cs, dark);
  // outlets
  tctx.fillStyle = dark ? 'rgba(120,190,255,.25)' : 'rgba(30,90,170,.18)';
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (isOutlet(x, y)) tctx.fillRect(x * cs, y * cs, cs, cs);
  terrainDirty = false;
}
function contours(cs, dark) {
  const T = game.terrain, c = (x, y) => T[idx(x, y)], labels = [];
  const ink = dark ? [255, 240, 220] : [70, 45, 20];
  for (let L = -0.5; L <= 1.6; L += 0.25) {
    const major = Math.abs(L * 2 - Math.round(L * 2)) < 1e-6, segs = [];
    for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
      const a = c(x, y), b = c(x + 1, y), d = c(x, y + 1), e = c(x + 1, y + 1), pts = [];
      const edge = (h0, h1, x0, y0, x1, y1) => { if ((h0 < L) !== (h1 < L)) { const t = (L - h0) / (h1 - h0); pts.push([(x0 + (x1 - x0) * t + .5) * cs, (y0 + (y1 - y0) * t + .5) * cs]); } };
      edge(a, b, x, y, x + 1, y); edge(b, e, x + 1, y, x + 1, y + 1); edge(e, d, x + 1, y + 1, x, y + 1); edge(d, a, x, y + 1, x, y);
      // downhill direction of this cell (cell-space gradient points uphill)
      const gx = (b + e - a - d) / 2, gy = (d + e - a - b) / 2;
      for (let k = 0; k + 1 < pts.length; k += 2) segs.push([pts[k], pts[k + 1], -gx, -gy]);
    }
    tctx.strokeStyle = `rgba(${ink},${dark ? (major ? .5 : .24) : (major ? .6 : .3)})`;
    tctx.lineWidth = (major ? 1.6 : 1) * PX; tctx.lineJoin = tctx.lineCap = 'round'; tctx.beginPath();
    for (const [p, q] of segs) { tctx.moveTo(...p); tctx.lineTo(...q); }
    tctx.stroke();
    if (!major) continue;
    // downhill ticks on index contours: short strokes pointing toward lower ground
    tctx.beginPath();
    segs.forEach(([p, q, dx, dy], k) => { if (k % 3) return; const m = Math.hypot(dx, dy); if (m < 1e-4) return;
      const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2; tctx.moveTo(mx, my); const tl = Math.max(cs * .32, 4 * PX); tctx.lineTo(mx + dx / m * tl, my + dy / m * tl); });
    tctx.stroke();
    // elevation labels, spread out
    for (const [p, q] of segs) {
      const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
      if (mx < cs * 1.5 || my < cs * 1.5 || mx > terrainCanvas.width - cs * 1.5 || my > terrainCanvas.height - cs * 1.5) continue;
      if (labels.some(([lx, ly]) => Math.hypot(lx - mx, ly - my) < cs * 7)) continue;
      labels.push([mx, my, L]);
    }
  }
  tctx.font = `600 ${Math.round(Math.max(10 * PX, cs * .5))}px ${css('--font')}`; tctx.textAlign = 'center'; tctx.textBaseline = 'middle';
  for (const [x, y, L] of labels) {
    const t = (L > 0 ? '' : L < 0 ? '−' : '') + Math.abs(L).toFixed(1);
    tctx.lineWidth = 3 * PX; tctx.strokeStyle = dark ? 'rgba(20,28,32,.85)' : 'rgba(255,255,255,.85)'; tctx.strokeText(t, x, y);
    tctx.fillStyle = `rgb(${ink})`; tctx.fillText(t, x, y);
  }
}
function buildLegend() {
  const lo = STOPS[0][0], hi = STOPS.at(-1)[0], pct = h => ((h - lo) / (hi - lo) * 100).toFixed(1) + '%';
  $('#legend-bar').style.background = `linear-gradient(to right, ${STOPS.map(([h, c]) => `rgb(${c.map(Math.round)}) ${pct(h)}`).join(', ')})`;
  $('#legend-ticks').replaceChildren(...[-0.5, 0, 0.5, 1, 1.5].map(h => { const e = document.createElement('span'); e.style.insetInlineStart = pct(h); e.textContent = (h < 0 ? '−' : '') + Math.abs(h).toFixed(1); return e; }));
}

// ---------- frame render ----------
function render(now) {
  if (terrainDirty) drawTerrain();
  const cs = canvas.width / W;
  ctx.drawImage(terrainCanvas, 0, 0);
  // water (bilinear-smoothed depth image)
  const d = wdata.data;
  for (let i = 0; i < N; i++) {
    const w = game.water[i], o = i * 4;
    if (w < 0.008) { d[o + 3] = 0; continue; }
    const k = Math.min(1, w / 1.2);
    d[o] = 70 - 45 * k; d[o + 1] = 140 - 75 * k; d[o + 2] = 225 - 40 * k; d[o + 3] = Math.min(235, 70 + 220 * Math.sqrt(k));
  }
  wctx.putImageData(wdata, 0, 0); ctx.imageSmoothingEnabled = true; ctx.drawImage(waterImg, 0, 0, canvas.width, canvas.height);
  // ice
  for (let i = 0; i < N; i++) if (game.ice[i] > 0.02) {
    const x = i % W, y = (i / W) | 0, a = Math.min(.85, .25 + game.ice[i] * .6);
    ctx.fillStyle = `rgba(214,240,250,${a})`; ctx.fillRect(x * cs + 1, y * cs + 1, cs - 2, cs - 2);
    ctx.strokeStyle = `rgba(120,180,210,${a})`; ctx.lineWidth = PX; ctx.beginPath(); ctx.moveTo(x * cs + cs * .2, y * cs + cs * .8); ctx.lineTo(x * cs + cs * .8, y * cs + cs * .2); ctx.stroke();
  }
  // flow arrows
  if (showFlow) {
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = Math.max(PX, cs * .07); ctx.lineCap = 'round'; ctx.beginPath();
    for (let i = 0; i < N; i++) {
      if (game.water[i] < 0.03) continue;
      const vx = game.flux[0][i] - game.flux[1][i], vy = game.flux[2][i] - game.flux[3][i], m = Math.hypot(vx, vy);
      if (m < 0.004) continue;
      const x = (i % W + .5) * cs, y = (((i / W) | 0) + .5) * cs, L = Math.min(.45, .12 + m * 4) * cs, ux = vx / m, uy = vy / m;
      ctx.moveTo(x - ux * L * .5, y - uy * L * .5); ctx.lineTo(x + ux * L * .5, y + uy * L * .5);
      ctx.lineTo(x + ux * L * .5 - (ux * .6 - uy * .45) * L * .5, y + uy * L * .5 - (uy * .6 + ux * .45) * L * .5);
    }
    ctx.stroke();
  }
  // levees
  for (let i = 0; i < N; i++) if (game.levee[i]) {
    const x = i % W, y = (i / W) | 0, lv = game.levee[i], hpk = game.leveeHp[i] / LEVEE[lv].hp, p = cs * .1;
    ctx.fillStyle = lv === 2 ? css('--concrete') : css('--earth');
    roundRect(x * cs + p, y * cs + p, cs - 2 * p, cs - 2 * p, cs * (lv === 2 ? .08 : .25)); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = PX; ctx.stroke();
    if (hpk < .999) { ctx.fillStyle = hpk < .35 ? '#d23a2a' : hpk < .7 ? '#e7a321' : '#5fae5a'; ctx.fillRect(x * cs + p, y * cs + cs - p - cs * .12, (cs - 2 * p) * hpk, cs * .12); }
  }
  // base
  {
    const x = (BASE.x - 1) * cs, y = (BASE.y - 1) * cs, s = cs * 3, k = game.hp / BASE_HP;
    ctx.fillStyle = css('--base'); roundRect(x + cs * .25, y + cs * .25, s - cs * .5, s - cs * .5, cs * .3); ctx.fill();
    ctx.strokeStyle = '#1d2b33'; ctx.lineWidth = Math.max(1.5, cs * .08); ctx.stroke();
    ctx.fillStyle = '#1d2b33'; ctx.font = `700 ${Math.round(cs * .8)}px ${css('--font')}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('기지', x + s / 2, y + s / 2 - cs * .2);
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x + cs * .5, y + s - cs * .75, s - cs, cs * .22);
    ctx.fillStyle = k > .6 ? '#4fa45a' : k > .3 ? '#e7a321' : '#d23a2a'; ctx.fillRect(x + cs * .5, y + s - cs * .75, (s - cs) * k, cs * .22);
    if (baseFlood(game) > 0 && !reduceMotion && (now / 300 | 0) % 2) { ctx.strokeStyle = '#d23a2a'; ctx.lineWidth = cs * .15; ctx.strokeRect(x + cs * .1, y + cs * .1, s - cs * .2, s - cs * .2); }
  }
  // structures
  for (const t of game.structs) drawStruct(t.x, t.y, t.kind, 1, now, t.load || 0);
  // inlets & forecast
  const w = game.active ? game.waves[game.wave] : nextWave(game), k = game.active ? waveIntensity(w, game.t) : 0;
  for (const p of activeInlets()) {
    const f = w ? (w.flow[p.id] || 0) : 0, x = (p.x + .5) * cs, y = (p.y + .5) * cs, ang = Math.atan2(p.dy, p.dx);
    const live = game.active ? f * k : f, len = cs * (0.8 + Math.min(3, live * 6));
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.fillStyle = game.active ? `rgba(35,95,200,${.35 + Math.min(.6, live * 2)})` : css('--forecast');
    ctx.beginPath(); ctx.moveTo(-cs * .3, -cs * .55); ctx.lineTo(len, 0); ctx.lineTo(-cs * .3, cs * .55); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // breach flashes
  flash = flash.filter(f => now - f.t < 1200);
  for (const f of flash) { const a = 1 - (now - f.t) / 1200; ctx.strokeStyle = `rgba(230,50,30,${a})`; ctx.lineWidth = cs * .15; ctx.beginPath(); ctx.arc((f.x + .5) * cs, (f.y + .5) * cs, cs * (.6 + (1 - a) * 1.4), 0, 7); ctx.stroke(); }
  if (mapInfo?.hint && game.wave < 3) {
    ctx.setLineDash([cs * .25, cs * .2]); ctx.strokeStyle = css('--accent'); ctx.lineWidth = Math.max(1.5, cs * .08);
    for (const sd of game.saddles) { ctx.beginPath(); ctx.arc((sd.sx + .5) * cs, (sd.sy + .5) * cs, cs * 1.3, 0, 7); ctx.stroke();
      const dx = Math.sign(sd.c[0] - sd.sx), dy = Math.sign(sd.c[1] - sd.sy); ctx.beginPath(); ctx.moveTo((sd.sx + .5 + dx * 1.6) * cs, (sd.sy + .5 + dy * 1.6) * cs); ctx.lineTo((sd.sx + .5 + dx * 3.2) * cs, (sd.sy + .5 + dy * 3.2) * cs); ctx.stroke(); }
    ctx.setLineDash([]);
  }
  drawPreview(cs, now);
}
function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
function drawStruct(x, y, kind, alpha, now, load) {
  const cs = canvas.width / W, cx = (x + .5) * cs, cy = (y + .5) * cs, r = cs * .42;
  ctx.globalAlpha = alpha;
  if (kind === 'pump') {
    ctx.strokeStyle = 'rgba(30,90,170,.35)'; ctx.lineWidth = PX; ctx.strokeRect((x - 1) * cs, (y - 1) * cs, cs * 3, cs * 3);
    ctx.fillStyle = css('--pump'); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill(); ctx.strokeStyle = css('--ink'); ctx.lineWidth = Math.max(1, cs * .07); ctx.stroke();
    const a = reduceMotion ? 0 : now / 1000 * (1 + load * 10);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1.2, cs * .09); ctx.beginPath();
    for (let k = 0; k < 3; k++) { const b = a + k * 2.094; ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(b) * r * .7, cy + Math.sin(b) * r * .7); }
    ctx.stroke();
  } else if (kind === 'cooler') {
    ctx.strokeStyle = 'rgba(120,200,235,.5)'; ctx.setLineDash([cs * .2, cs * .2]); ctx.lineWidth = PX; ctx.beginPath(); ctx.arc(cx, cy, cs * 2.3, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = css('--cooler'); ctx.beginPath();
    for (let k = 0; k < 6; k++) { const b = k * 1.047 + .52; ctx.lineTo(cx + Math.cos(b) * r, cy + Math.sin(b) * r); }
    ctx.closePath(); ctx.fill(); ctx.strokeStyle = css('--ink'); ctx.lineWidth = Math.max(1, cs * .07); ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, cs * .07); ctx.beginPath();
    for (let k = 0; k < 3; k++) { const b = k * 1.047; ctx.moveTo(cx - Math.cos(b) * r * .6, cy - Math.sin(b) * r * .6); ctx.lineTo(cx + Math.cos(b) * r * .6, cy + Math.sin(b) * r * .6); }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
function previewCells() {
  const p = drag || pending; if (!p) return [];
  const cells = TOOLS[p.tool].line ? lineCells(p.x0, p.y0, p.x1, p.y1) : [[p.x0, p.y0]];
  let cash = game.cash;
  return cells.map(([x, y]) => { const c = check(game, x, y, p.tool); let ok = !c.err; if (ok && c.cost > cash) { ok = false; c.err = '자금 부족'; } if (ok) cash -= c.cost; return { x, y, ok, c }; });
}
function drawPreview(cs) {
  const cells = previewCells();
  for (const { x, y, ok } of cells) {
    ctx.fillStyle = ok ? 'rgba(242,194,48,.38)' : 'rgba(210,58,42,.35)'; ctx.fillRect(x * cs, y * cs, cs, cs);
    ctx.strokeStyle = ok ? css('--accent') : '#d23a2a'; ctx.lineWidth = Math.max(1.5, cs * .08); ctx.strokeRect(x * cs + 1, y * cs + 1, cs - 2, cs - 2);
  }
  const p = drag || pending;
  if (p && !TOOLS[p.tool].line && cells[0]?.ok) drawStruct(p.x0, p.y0, p.tool, .6, 0, 0);
  const cur = !p && (kbd || hover);
  if (cur) { ctx.strokeStyle = css('--accent'); ctx.lineWidth = Math.max(2, cs * .1); ctx.strokeRect(cur.x * cs + 1, cur.y * cs + 1, cs - 2, cs - 2); }
}

// ---------- input ----------
function cellOf(e) {
  const r = canvas.getBoundingClientRect();
  return { x: Math.max(0, Math.min(W - 1, Math.floor((e.clientX - r.left) / r.width * W))), y: Math.max(0, Math.min(H - 1, Math.floor((e.clientY - r.top) / r.height * H))) };
}
canvas.addEventListener('pointerdown', e => {
  if (e.button === 2) { cancel(); return; }
  if (game.over) return;
  kbd = null; const c = cellOf(e), mouse = e.pointerType === 'mouse';
  if (mouse || zoom === 1) canvas.setPointerCapture(e.pointerId);
  drag = { tool, x0: c.x, y0: c.y, x1: c.x, y1: c.y, mouse, moved: false, sx: e.clientX, sy: e.clientY };
  if (!mouse && pending && TOOLS[pending.tool].line && pending.tool === tool) drag.extend = true; // second tap may extend the pending line
  else { pending = null; hideConfirm(); }
});
canvas.addEventListener('pointermove', e => {
  const c = cellOf(e);
  if (e.pointerType === 'mouse') hover = c;
  if (drag) {
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) drag.moved = true;
    if (drag.extend && drag.moved) { drag.extend = false; pending = null; hideConfirm(); }
    if (TOOLS[drag.tool].line) { drag.x1 = c.x; drag.y1 = c.y; } else { drag.x0 = drag.x1 = c.x; drag.y0 = drag.y1 = c.y; }
  }
  updateCellInfo(drag ? { x: drag.x1, y: drag.y1 } : c);
});
canvas.addEventListener('pointerleave', () => { hover = null; });
canvas.addEventListener('pointerup', e => {
  if (!drag) return;
  const d = drag; drag = null; updateCellInfo({ x: d.x1, y: d.y1 });
  if (d.mouse) { commit(d); return; }
  if (d.extend && !d.moved) { pending.x1 = d.x0; pending.y1 = d.y0; showConfirm(); return; }
  pending = d; showConfirm();
});
canvas.addEventListener('pointercancel', () => { drag = null; }); // browser took over for panning
canvas.addEventListener('contextmenu', e => e.preventDefault());

function commit(p) {
  const cells = previewCells.call(null, (pending = p)); pending = null; hideConfirm();
  let ok = 0, cost = 0, refund = 0, err = '';
  for (const { x, y, ok: can, c } of cells) {
    if (!can) { err = err || c.err; continue; }
    const r = apply(game, x, y, p.tool); if (r.err) { err = err || r.err; continue; }
    ok++; cost += r.cost || 0; refund += r.refund || 0;
    if (p.tool === 'trench') terrainDirty = true;
  }
  const name = TOOLS[p.tool].name;
  if (ok) toast(p.tool === 'remove' ? `${ok}칸 철거 · $${refund} 환급` : `${name} ${ok}칸 · $${cost}` + (err ? ` · 일부 불가: ${err}` : ''));
  else if (err) toast(err, true);
  renderAll();
}
function showConfirm() {
  const cells = previewCells(), ok = cells.filter(c => c.ok), cost = ok.reduce((a, c) => a + (c.c.cost || 0), 0), refund = ok.reduce((a, c) => a + (c.c.refund || 0), 0);
  const p = pending, name = TOOLS[p.tool].name;
  $('#confirm-text').textContent = !ok.length ? (cells[0]?.c.err || '시공할 수 없습니다.') : p.tool === 'remove' ? `${ok.length}칸 철거 · $${refund} 환급` : `${name} ${ok.length}칸 · $${cost}` + (ok.length < cells.length ? ` (${cells.length - ok.length}칸 불가)` : '');
  if (TOOLS[p.tool].line && p.x0 === p.x1 && p.y0 === p.y1 && ok.length) $('#confirm-text').textContent += ' · 다른 칸을 탭하면 직선 연결';
  $('#confirm-ok').disabled = !ok.length; $('#confirm').hidden = false;
}
function hideConfirm() { $('#confirm').hidden = true; }
function cancel() { drag = null; pending = null; hideConfirm(); }
$('#confirm-ok').onclick = () => { if (pending) commit(pending); };
$('#confirm-cancel').onclick = cancel;

function setTool(t) {
  tool = t; cancel();
  document.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', b.dataset.tool === t));
  $('#tool-hint').textContent = TOOL_HINT[t];
}
const TOOL_HINT = {
  levee: '드래그로 일렬 시공. 기존 제방에 다시 시공하면 콘크리트로 보강(높이 0.95m)합니다.',
  trench: '지반을 0.35m 낮춥니다. 계곡 옆 낮은 안부를 파 모서리 배수구로 물길을 돌리세요.',
  pump: '주변 3×3의 물을 맵 밖으로 배출합니다. 전력 2.',
  cooler: '반경 2칸의 물을 얼려 임시 댐을 만듭니다. 철거하면 녹습니다. 전력 3.',
  remove: '드래그로 철거. 비용의 50%를 돌려받습니다. 굴착은 되돌릴 수 없습니다.',
};
document.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => setTool(b.dataset.tool));

addEventListener('keydown', e => {
  if (e.target.closest('input,textarea') || !$('#scrim').hidden && e.key !== 'Escape') return;
  const k = e.key;
  const t = Object.entries(TOOLS).find(([, v]) => v.key === k); if (t) { setTool(t[0]); return; }
  if (k === 'Escape') { if (!$('#scrim').hidden && game) closeModal(); else cancel(); return; }
  if (k === ' ') { e.preventDefault(); primary(); return; }
  if (k === 'p' || k === 'P') { togglePause(); return; }
  if (k === 'f' || k === 'F') { cycleSpeed(); return; }
  if (k === 'v' || k === 'V') { toggleFlow(); return; }
  if (k === 'c' || k === 'C') { toggleContour(); return; }
  if (k.startsWith('Arrow')) {
    e.preventDefault(); kbd = kbd || { x: BASE.x, y: BASE.y - 3 };
    kbd.x = Math.max(0, Math.min(W - 1, kbd.x + (k === 'ArrowRight') - (k === 'ArrowLeft')));
    kbd.y = Math.max(0, Math.min(H - 1, kbd.y + (k === 'ArrowDown') - (k === 'ArrowUp'))); updateCellInfo(kbd); return;
  }
  if (k === 'Enter' && kbd) { commit({ tool, x0: kbd.x, y0: kbd.y, x1: kbd.x, y1: kbd.y }); }
});

// ---------- controls ----------
function primary() {
  if (game.over) { endScreen(); return; }
  if (!game.active) { if (startWave(game)) { paused = false; toast(`${game.waves[game.wave].name} 시작`); } }
  else togglePause();
  renderAll();
}
function togglePause() { if (game.over) return; paused = !paused; renderAll(); }
function cycleSpeed() { speedIx = (speedIx + 1) % SPEEDS.length; renderAll(); }
function toggleFlow() { showFlow = !showFlow; renderAll(); }
function toggleContour() { showContour = !showContour; terrainDirty = true; renderAll(); }
$('#start').onclick = primary; $('#pause').onclick = togglePause; $('#speed').onclick = cycleSpeed;
$('#flow').onclick = toggleFlow; $('#contour').onclick = toggleContour;
$('#retry').onclick = () => { if (retryWave(game)) { terrainDirty = true; paused = false; closeModal(); toast('웨이브 시작 직전으로 되돌렸습니다.'); renderAll(); } };
$('#menu').onclick = openMaps;
$('#zoom').onclick = () => { zoom = zoom === 1 ? 2 : 1; resize(); renderAll(); if (zoom > 1) { const wrap = $('#board-wrap'); wrap.scrollLeft = (wrap.scrollWidth - wrap.clientWidth) / 2; } };
document.querySelectorAll('[data-close]').forEach(b => b.onclick = closeModal);
$('#end-retry').onclick = () => $('#retry').onclick();
$('#end-maps').onclick = openMaps;
$('#end-again').onclick = () => newGame(mapInfo);

// ---------- HUD ----------
function setText(sel, v) { const el = $(sel); if (el.textContent !== String(v)) el.textContent = v; }
function renderAll() {
  const g = game, w = g.active ? g.waves[g.wave] : nextWave(g), WV = g.waves;
  setText('#hp', Math.ceil(g.hp)); $('#hp-bar').style.inlineSize = g.hp + '%'; $('#hp-bar').dataset.level = g.hp > 60 ? 'ok' : g.hp > 30 ? 'warn' : 'bad';
  setText('#cash', '$' + g.cash); setText('#power', `${powerUsed(g)}/${POWER_CAP}`);
  setText('#wave', `${Math.min(g.wave + (g.active ? 1 : 0), WV.length)}/${WV.length}`);
  $('#progress').style.inlineSize = g.active ? (g.t / WV[g.wave].dur * 100) + '%' : '0%';
  setText('#start', g.over ? '결과 보기' : g.active ? (paused ? '계속' : '일시정지') : g.wave === 0 ? '첫 재해 시작' : '다음 재해 시작');
  $('#pause').hidden = true; // primary button already toggles pause during a wave
  setText('#speed', SPEEDS[speedIx] + '배속'); $('#zoom').setAttribute('aria-pressed', zoom > 1);
  $('#flow').setAttribute('aria-pressed', showFlow); $('#contour').setAttribute('aria-pressed', showContour);
  $('#retry').disabled = !g.checkpoint;
  // forecast
  if (w) {
    setText('#fc-title', (g.active ? '진행 중 · ' : '다음 · ') + w.name);
    setText('#fc-tip', w.tip);
    const max = Math.max(...WV.flatMap(q => Object.values(q.flow)));
    for (const p of INLETS) {
      const on = g.inlets.includes(p.id); $(`#fc-${p.id}`).hidden = !on; if (!on) continue;
      const f = w.flow[p.id] || 0, vol = f * w.dur * (w.shape === 'surge' ? .19 : w.shape === 'flat' ? .87 : .55);
      $(`#fc-${p.id} i`).style.inlineSize = (f / max * 100) + '%'; setText(`#fc-${p.id} b`, Math.round(vol));
    }
    setText('#fc-rain', w.rain ? `강우 ${Math.round(w.rain * w.dur * 1000)}mm` : '강우 없음');
  } else { setText('#fc-title', '모든 재해를 막았습니다'); setText('#fc-tip', ''); }
  setText('#st-in', (g.stats.inflow + g.stats.rain).toFixed(0)); setText('#st-out', g.stats.outlet.toFixed(0)); setText('#st-pump', g.stats.pumped.toFixed(0)); setText('#st-now', totalWater(g).toFixed(0));
  const hist = $('#history'); if (hist.childElementCount !== g.history.length) {
    hist.replaceChildren(...g.history.map(h => { const tr = document.createElement('tr'); tr.innerHTML = `<td>${h.wave}</td><td>${h.name}</td><td>${h.damage}</td><td>${h.breaches}</td><td>+$${h.reward}</td>`; return tr; }));
  }
}
function updateCellInfo(c) {
  if (!c || !game) return;
  const i = idx(c.x, c.y), parts = [`(${c.x}, ${c.y})`, `지반 ${game.terrain[i].toFixed(2)}m`];
  if (game.water[i] > .005) parts.push(`수심 ${game.water[i].toFixed(2)}m`);
  if (game.ice[i] > .01) parts.push(`얼음 ${game.ice[i].toFixed(2)}m`);
  if (game.levee[i]) parts.push(`${game.levee[i] === 2 ? '콘크리트' : '흙'} 제방 ${Math.ceil(game.leveeHp[i])}/${LEVEE[game.levee[i]].hp}`);
  if (isOutlet(c.x, c.y)) parts.push('배수구');
  const ch = check(game, c.x, c.y, tool); parts.push(ch.err ? '— ' + ch.err : `— ${TOOLS[tool].name} $${ch.cost ?? 0}${ch.note ? ' (' + ch.note + ')' : ''}`);
  setText('#cell-info', parts.join(' · '));
}
function toast(msg, bad) {
  if (!msg) return; const t = $('#toast'); t.textContent = msg; t.dataset.bad = !!bad; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, 3200);
}
function endScreen() {
  const st = stars(game);
  setText('#end-title', game.victory ? '방어 성공' : '기지가 침수되었습니다');
  setText('#end-stars', game.victory ? '★'.repeat(st) + '☆'.repeat(3 - st) : '');
  setText('#end-body', game.victory ? `남은 체력 ${Math.ceil(game.hp)} · 배수구로 ${game.stats.outlet.toFixed(0)}, 펌프로 ${game.stats.pumped.toFixed(0)}만큼 내보냈습니다.` : `${game.waves[game.wave]?.name ?? ''}에서 방어선이 무너졌습니다. 웨이브 직전으로 되돌려 배치를 바꿔 보세요.`);
  $('#end-retry').hidden = game.victory;
  if (game.victory && mapInfo.id) { const k = 'ptd6-best-' + mapInfo.id; if (st > (store(k) || 0)) store(k, st); }
  showModal('#end');
}

// ---------- loop (fixed timestep) ----------
let hudTimer = 0;
function frame(now) {
  const dt = Math.min(.25, (now - (lastFrame || now)) / 1000); lastFrame = now;
  if (game && $('#scrim').hidden && !paused && !game.over) {
    acc += dt * SPEEDS[speedIx];
    let n = 0;
    while (acc >= 1 / TICK_HZ && n < 16) {
      acc -= 1 / TICK_HZ; n++;
      const evBefore = game.events.length, r = step(game);
      for (const ev of game.events.slice(evBefore)) if (ev.type === 'breach') { flash.push({ x: ev.x, y: ev.y, t: now }); toast(`제방 붕괴 (${ev.x}, ${ev.y})`, true); navigator.vibrate?.(60); }
      if (r === 'complete') { const h = game.history.at(-1); toast(`${h.name} 종료 · 피해 ${h.damage} · 보상 $${h.reward}`); renderAll(); }
      if (r === 'defeat' || r === 'victory') { navigator.vibrate?.(200); renderAll(); endScreen(); break; }
    }
    if (n === 16) acc = 0;
  }
  if (game) {
    render(now);
    if ((hudTimer += dt) > .15) { hudTimer = 0; renderAll(); if (hover && !drag) updateCellInfo(hover); }
  }
  requestAnimationFrame(frame);
}

new ResizeObserver(resize).observe($('#board-wrap'));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => terrainDirty = true);
setTool('levee'); buildLegend();
mapInfo = MAPS[0]; game = createGame(mapInfo.seed, { inlets: mapInfo.inlets, waves: mapInfo.waves }); resize(); renderAll(); openMaps();
requestAnimationFrame(frame);
