// Regressions from play feedback (2026-11-09):
// "물이 들어오는 곳이 없는데 집이 물에 잠긴다" and "물레방아를 지으면 물이 없어진다".
// Both were water that existed but was not drawn (thin, fast water) or was removed at once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHydro, inChannel, start, tick, VILLAGE, W } from '../../../prototypes/v4-hydro/core.ts';
import { AW, createArt, paintTerrain, paintWater, S } from '../../../prototypes/v4-hydro/art.ts';
import { T } from '../../../prototypes/v4-hydro/tuning.ts';

const steady = () => { const w = createHydro(1); start(w); for (let k = 0; k < 30 * 20; k++) { if (w.phase === 'levelup') w.phase = 'run'; tick(w); } return w; };

test('rapids_are_drawn_as_water_not_as_a_dry_bed', () => {
  const w = steady(), a = createArt();
  paintTerrain(a, w); paintWater(a, w, 0);
  // rows of rapid 1 (22–32): every wet channel cell shows water on at least one of its 3×3 pixels
  let cells = 0, shown = 0;
  const differs = (o: number) => a.rgba[o] !== a.terrain[o] || a.rgba[o + 1] !== a.terrain[o + 1] || a.rgba[o + 2] !== a.terrain[o + 2];
  for (let y = 22; y <= 32; y++) for (let x = 0; x < W; x++) {
    if (!inChannel(x, y) || w.g.w[y * W + x] < 0.004) continue;
    cells++;
    let any = false;
    for (let dy = 0; dy < S && !any; dy++) for (let dx = 0; dx < S && !any; dx++) any = differs(((y * S + dy) * AW + x * S + dx) * 4);
    if (any) shown++;
  }
  assert.ok(cells > 30, `cells ${cells}`);
  assert.equal(shown, cells, `${cells - shown} wet rapid cells drawn as dry ground`);
});

test('flood_water_stays_visible_in_the_village_and_drains_slowly', () => {
  const w = createHydro(1); start(w);
  const vill: number[] = [];
  for (let i = 0; i < w.village.length; i++) if (w.village[i]) vill.push(i);
  for (const i of vill) w.g.w[i] = (T.villageFloodLimit * 1.5) / vill.length;
  tick(w);
  assert.equal(w.events.lostHeart, 'flood');
  let left = 0; for (const i of vill) left += w.g.w[i];
  assert.ok(left > T.villageFloodLimit, `water still there after the heart: ${left}`);
  // a heart at most once per cooldown even while the village stays flooded
  let hearts = 0;
  for (let k = 0; k < 30 * 5; k++) { tick(w); if (w.events.lostHeart === 'flood') hearts++; }
  assert.equal(hearts, 0);
});

test('a_flood_records_the_village_edge_where_water_came_in', () => {
  const w = createHydro(1); start(w);
  // water arriving along the village's top edge (spread out, so one tick of flow keeps it inside)
  for (let x = VILLAGE.x0; x <= VILLAGE.x1; x++) w.g.w[VILLAGE.y0 * W + x] = (T.villageFloodLimit * 2) / (VILLAGE.x1 - VILLAGE.x0 + 1);
  tick(w);
  assert.equal(w.events.lostHeart, 'flood');
  assert.ok(w.floodFrom >= 0 && w.village[w.floodFrom] === 1);
  const fx = w.floodFrom % W, fy = (w.floodFrom / W) | 0;
  assert.ok(fy === VILLAGE.y0 || fy === VILLAGE.y1 || fx === VILLAGE.x0 || fx === VILLAGE.x1, 'on the edge');
});
