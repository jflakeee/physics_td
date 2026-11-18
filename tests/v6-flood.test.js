import test from 'node:test'; import assert from 'node:assert/strict';
import * as E from '../prototypes/v6-flood/engine.js';
const balance = s => s.stats.inflow + s.stats.rain - s.stats.outlet - s.stats.pumped - s.stats.evap - E.totalWater(s) - E.totalIce(s);

test('water mass is conserved through flow, pumps, ice and outlets', () => {
  const s = E.createGame(1); s.cash = 1e4;
  E.apply(s, 16, 12, 'pump'); E.apply(s, 24, 12, 'cooler');
  for (const [x, y] of E.lineCells(5, 4, 1, 1)) E.apply(s, x, y, 'trench');
  for (let w = 0; w < 3; w++) { E.startWave(s); while (E.step(s) === 'active'); }
  assert.ok(Math.abs(balance(s)) < 1e-3, 'balance error ' + balance(s));
  assert.ok(s.stats.pumped > 0 && s.stats.inflow > 0);
});
test('no NaN and water never negative', () => {
  const s = E.createGame(3); E.startWave(s); for (let i = 0; i < 400; i++) E.step(s);
  for (let i = 0; i < E.N; i++) { assert.ok(Number.isFinite(s.water[i])); assert.ok(s.water[i] >= 0); }
});
test('simulation is deterministic per seed', () => {
  const run = () => { const s = E.createGame(7); E.startWave(s); for (let i = 0; i < 300; i++) E.step(s); return E.totalWater(s); };
  assert.equal(run(), run());
});
test('outlets drain water off-map, sealed edges do not', () => {
  const s = E.createGame(1); s.water[E.idx(0, 0)] = 1; s.water[E.idx(10, 0)] = 1;
  for (let i = 0; i < 200; i++) E.step(s);
  assert.ok(s.stats.outlet > 0.5);
});
test('levee blocks water until overtopped, then breaches', () => {
  const s = E.createGame(1); s.cash = 1e4;
  const i = E.idx(10, 8); E.apply(s, 10, 8, 'levee'); assert.equal(s.levee[i], 1);
  for (let k = 0; k < 30 && s.levee[i]; k++) { s.water[i] = 0.3; E.step(s); }
  assert.equal(s.levee[i], 0); assert.ok(s.stats.breaches >= 1);
});
test('levee upgrade, removal refund and placement rules', () => {
  const s = E.createGame(1); const c0 = s.cash;
  E.apply(s, 10, 6, 'levee'); E.apply(s, 10, 6, 'levee'); assert.equal(s.levee[E.idx(10, 6)], 2);
  assert.equal(s.cash, c0 - E.TOOLS.levee.cost - E.TOOLS.levee.upgrade);
  assert.ok(E.check(s, E.BASE.x, E.BASE.y, 'levee').err);
  assert.ok(E.check(s, 0, 12, 'levee').err);
  E.apply(s, 10, 6, 'remove'); assert.equal(s.levee[E.idx(10, 6)], 0);
});
test('power cap limits pumps and coolers', () => {
  const s = E.createGame(1); s.cash = 1e4; let n = 0;
  for (let x = 3; x < 38; x += 3) if (!E.apply(s, x, 6, 'pump').err) n++;
  assert.equal(n, Math.floor(E.POWER_CAP / E.TOOLS.pump.power));
});
test('undefended base takes damage in wave 1 but survives', () => {
  const s = E.createGame(1); E.startWave(s); while (E.step(s) === 'active');
  assert.ok(s.hp < 100 && s.hp > 40, 'hp ' + s.hp);
});
test('retry restores checkpoint', () => {
  const s = E.createGame(1); E.apply(s, 10, 6, 'levee'); const cash = s.cash;
  E.startWave(s); for (let i = 0; i < 200; i++) E.step(s); E.apply(s, 12, 6, 'levee');
  assert.ok(E.retryWave(s)); assert.equal(s.cash, cash); assert.equal(s.wave, 0); assert.equal(s.levee[E.idx(12, 6)], 0);
});
test('line tool is 4-connected (no diagonal leaks)', () => {
  const c = E.lineCells(0, 0, 5, 3);
  for (let k = 1; k < c.length; k++) assert.equal(Math.abs(c[k][0] - c[k - 1][0]) + Math.abs(c[k][1] - c[k - 1][1]), 1);
});
test('beginner map: water enters only from the west inlet', () => {
  const s = E.createGame(1, { inlets: ['W'], waves: E.WAVES_ONE });
  assert.equal(s.saddles.length, 1); assert.equal(s.waves.length, 6);
  E.startWave(s); for (let i = 0; i < 120; i++) E.step(s);
  for (const p of E.INLETS) if (p.id !== 'W') assert.equal(s.water[E.idx(p.x, p.y)], 0, p.id);
  assert.ok(s.water[E.idx(0, 12)] > 0);
  assert.equal(E.check(s, 20, 0, 'levee').err, undefined); // inactive inlet cell is buildable
});
test('beginner map is winnable by diverting through the saddle', () => {
  const s = E.createGame(1, { inlets: ['W'], waves: E.WAVES_ONE }), { idx } = E;
  const ring = () => { for (let y = 10; y <= 14; y++) for (let x = 18; x <= 22; x++) if (Math.max(Math.abs(x - 20), Math.abs(y - 12)) === 2) E.apply(s, x, y, 'levee'); };
  const spill = () => { const sd = s.saddles[0], vh = s.terrain[idx(sd.sx, sd.sy)];
    for (const [x, y] of E.lineCells(sd.sx, sd.sy, sd.c[0], sd.c[1])) { let g = 0; while (s.terrain[idx(x, y)] > vh - 0.1 && g++ < 4) if (E.apply(s, x, y, 'trench').err) break; }
    for (let k = -3; k <= 3; k++) { E.apply(s, sd.sx + 2, sd.sy + k, 'levee'); E.apply(s, sd.sx + 2, sd.sy + k, 'levee'); } };
  while (!s.over) { if (s.wave === 0) ring(); else spill(); ring(); E.startWave(s); while (E.step(s) === 'active'); for (let k = 0; k < 300 && !s.over; k++) E.step(s); }
  assert.ok(s.victory, 'should win'); assert.ok(s.hp > 90);
});
test('gate blocks when closed, passes water when open; toggling is free', () => {
  const s = E.createGame(1), i = E.idx(10, 6), g0 = s.terrain[i];
  assert.equal(E.apply(s, 10, 6, 'gate').cost, E.TOOLS.gate.cost);
  assert.ok(Math.abs(E.ground(s, i) - g0 - E.LEVEE[E.GATE].h) < 1e-6);
  const cash = s.cash; E.apply(s, 10, 6, 'gate'); assert.equal(s.cash, cash);
  assert.equal(s.gateOpen[i], 1); assert.ok(Math.abs(E.ground(s, i) - g0) < 1e-6);
  assert.ok(E.check(s, 10, 6, 'levee').err);
  E.apply(s, 10, 6, 'remove'); assert.equal(s.levee[i], 0); assert.equal(s.gateOpen[i], 0);
});
test('open gate takes no scour damage', () => {
  const s = E.createGame(1), i = E.idx(10, 6); E.apply(s, 10, 6, 'gate'); E.apply(s, 10, 6, 'gate');
  for (let k = 0; k < 30; k++) { s.water[i] = 0.3; E.step(s); }
  assert.equal(s.leveeHp[i], E.LEVEE[E.GATE].hp);
});
test('repairAll fixes the most damaged levee first, within budget', () => {
  const s = E.createGame(1); s.cash = 1e4;
  E.apply(s, 10, 6, 'levee'); E.apply(s, 12, 6, 'levee');
  s.leveeHp[E.idx(10, 6)] = 20; s.leveeHp[E.idx(12, 6)] = 90;
  const q = E.repairQuote(s); assert.equal(q.list[0].i, E.idx(10, 6));
  s.cash = q.list[0].cost; const r = E.repairAll(s);
  assert.equal(r.n, 1); assert.equal(r.left, 1); assert.equal(s.leveeHp[E.idx(10, 6)], 100); assert.equal(s.leveeHp[E.idx(12, 6)], 90);
});
test('retry restores gate state', () => {
  const s = E.createGame(1); E.apply(s, 10, 6, 'gate'); E.startWave(s); E.apply(s, 10, 6, 'gate');
  assert.equal(s.gateOpen[E.idx(10, 6)], 1); E.retryWave(s); assert.equal(s.gateOpen[E.idx(10, 6)], 0);
});

// ---- polluted water and the intake (docs/REDESIGN_V6_FLOOD.md §5) ----
const dirtTotal = s => s.dirt.reduce((a, b) => a + b, 0);
const dirtBalance = s => { const t = s.stats; return t.dirtIn - t.dirtOut - t.dirtPumped - t.dirtSettled - dirtTotal(s); };
const TWO = { inlets: ['W', 'N'], waves: E.WAVES_TWO, intake: 'N' };
const TWO_SEED = 8;

test('pollutant mass is conserved and never exceeds the water it is in', () => {
  const s = E.createGame(TWO_SEED, TWO); s.cash = 1e4;
  E.apply(s, 16, 12, 'pump'); E.apply(s, 24, 10, 'cooler');
  for (let w = 0; w < 3; w++) { E.startWave(s); while (E.step(s) === 'active'); }
  assert.ok(s.stats.dirtIn > 1);
  assert.ok(Math.abs(dirtBalance(s)) < 1e-3, 'balance ' + dirtBalance(s));
  for (let i = 0; i < E.N; i++) assert.ok(s.dirt[i] >= 0 && s.dirt[i] <= s.water[i] + 1e-6);
});
test('only the listed inlet is polluted; clean waves add no pollutant', () => {
  const s = E.createGame(TWO_SEED, TWO); E.startWave(s); for (let i = 0; i < 60; i++) E.step(s);
  assert.ok(E.pollution(s, E.idx(20, 0)) > 0.9, 'north inlet is dirty');
  assert.equal(E.pollution(s, E.idx(0, 12)), 0, 'west inlet is clean');
  const c = E.createGame(1); E.startWave(c); for (let i = 0; i < 60; i++) E.step(c);
  assert.equal(c.stats.dirtIn, 0);
});
test('intake: polluted outflow costs base HP, clean outflow does not', () => {
  const s = E.createGame(TWO_SEED, TWO), [cx, cy] = s.intake;
  assert.ok(E.isIntake(s, cx, cy));
  const i = E.idx(cx, cy);
  s.water[i] = 0.5; s.dirt[i] = 0.5; for (let k = 0; k < 40; k++) E.step(s);
  assert.ok(s.stats.intakeDirt > 0.1); assert.ok(s.hp < 100);
  const t = E.createGame(TWO_SEED, TWO); t.water[i] = 0.5; for (let k = 0; k < 40; k++) E.step(t);
  assert.ok(t.stats.outlet > 0.1); assert.equal(t.stats.intakeDirt, 0); assert.equal(t.hp, 100);
});

// The design claim: on "두 갈래 강" pollution decides the route. Same river, same natural spillway:
// clean -> win, polluted -> lose; digging to the far outlet instead -> win while polluted.
function playTwoRivers(dirty, route) {
  const s = E.createGame(TWO_SEED, { ...TWO, waves: E.WAVES_TWO.map(w => ({ ...w, dirty: dirty ? ['N'] : [] })) }), { idx } = E;
  const sN = s.saddles.find(q => q.id === 'N'), sW = s.saddles.find(q => q.id === 'W');
  const vN = s.terrain[idx(sN.sx, sN.sy)], vW = s.terrain[idx(sW.sx, sW.sy)];
  const ring = () => { for (let y = 10; y <= 14; y++) for (let x = 18; x <= 22; x++) if (Math.max(Math.abs(x - 20), Math.abs(y - 12)) === 2) E.apply(s, x, y, 'levee'); };
  const divert = (id, sx, sy, c, vh, lv2) => {
    for (const [x, y] of E.lineCells(sx, sy, c[0], c[1])) { let g = 0; while (s.terrain[idx(x, y)] > vh - 0.1 && g++ < 6) if (E.apply(s, x, y, 'trench').err) break; }
    const p = E.INLETS.find(q => q.id === id), dx = Math.sign(E.BASE.x - p.x), dy = Math.sign(E.BASE.y - p.y), cx = sx + dx * 2, cy = sy + dy * 2;
    for (let k = -3; k <= 3; k++) { const x = cx + (dy ? k : 0), y = cy + (dx ? k : 0); E.apply(s, x, y, 'levee'); if (lv2) E.apply(s, x, y, 'levee'); }
  };
  while (!s.over) {
    ring();
    if (s.wave >= 1) {
      if (route === 'natural') divert('N', sN.sx, sN.sy, sN.c, vN, s.wave >= 3);
      else divert('N', E.W - 1 - sN.sx, sN.sy, [E.W - 1 - sN.c[0], sN.c[1]], vN, s.wave >= 3);
      if (s.wave >= 2) divert('W', sW.sx, sW.sy, sW.c, vW, s.wave >= 4);
    }
    E.startWave(s); while (E.step(s) === 'active'); for (let k = 0; k < 300 && !s.over; k++) E.step(s);
  }
  return s;
}
test('두 갈래 강: clean north river is safe through its natural spillway', () => {
  assert.ok(playTwoRivers(false, 'natural').victory);
});
test('두 갈래 강: the same spillway loses once the north river is polluted', () => {
  const s = playTwoRivers(true, 'natural');
  assert.ok(!s.victory); assert.ok(s.stats.intakeDirt > 1);
});
test('두 갈래 강: routing the polluted river to the far outlet wins', () => {
  const s = playTwoRivers(true, 'far');
  assert.ok(s.victory, 'hp ' + s.hp); assert.ok(s.stats.dirtOut > 100);
});
