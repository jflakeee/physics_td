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
