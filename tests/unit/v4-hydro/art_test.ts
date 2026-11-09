// V4 pixel renderer (docs/ART_DIRECTION_V4_PIXEL.md §3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHydro, start, tick, W } from '../../../prototypes/v4-hydro/core.ts';
import { AH, AW, blit, createArt, paintTerrain, paintWater, S } from '../../../prototypes/v4-hydro/art.ts';
import { SPRITES } from '../../../prototypes/v4-hydro/sprites.ts';

const warm = () => { const w = createHydro(1); start(w); for (let k = 0; k < 300; k++) { if (w.phase === 'levelup') w.phase = 'run'; tick(w); } return w; };

test('the_art_grid_is_three_pixels_per_cell', () => {
  assert.equal(S, 3);
  assert.equal(AW, 192);
  assert.equal(AH, 288);
});

test('dry_cells_show_terrain_and_the_river_shows_water_with_a_shoreline', () => {
  const w = warm(), a = createArt();
  paintTerrain(a, w); paintWater(a, w);
  // a far-from-river cell is untouched terrain
  const far = (10 * S + 1) * AW + 60 * S + 1;
  assert.deepEqual([...a.rgba.slice(far * 4, far * 4 + 3)], [...a.terrain.slice(far * 4, far * 4 + 3)]);
  let wet = 0, shore = 0;
  for (let k = 0; k < AW * AH; k++) if (a.wet[k]) { wet++; if (a.rgba[k * 4] === 232 && a.rgba[k * 4 + 1] === 247) shore++; }
  assert.ok(wet > 1000, `wet ${wet}`);
  assert.ok(shore > 100 && shore < wet, `shore ${shore} of ${wet}`);
});

test('upsampled_water_follows_the_cells_it_came_from', () => {
  const w = createHydro(1), a = createArt();
  w.g.w.fill(0);
  const c = 40 * W + 10; // one wet cell, far from the river
  w.g.w[c] = 0.5;
  paintTerrain(a, w); paintWater(a, w);
  // the cell's own 3×3 block is wet; nothing two cells away is
  for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) assert.equal(a.wet[(40 * S + dy) * AW + 10 * S + dx], 1);
  for (let y = 0; y < AH; y++) for (let x = 0; x < AW; x++) {
    if (Math.abs(((x / S) | 0) - 10) <= 1 && Math.abs(((y / S) | 0) - 40) <= 1) continue;
    assert.equal(a.wet[y * AW + x], 0, `stray water at ${x},${y}`);
  }
});

test('rendering_is_deterministic', () => {
  const w = warm(), a = createArt(), b = createArt();
  paintTerrain(a, w); paintWater(a, w); paintTerrain(b, w); paintWater(b, w);
  assert.deepEqual(a.rgba, b.rgba);
});

test('sprites_blit_opaque_pixels_only', () => {
  const a = createArt();
  a.rgba.fill(7);
  blit(a.rgba, SPRITES.site, 0, 0);
  assert.equal(a.rgba[0], 7, 'transparent corner stays');
  const o = (0 * AW + 2) * 4; // '6' at (2,0)
  assert.deepEqual([...a.rgba.slice(o, o + 3)], [246, 243, 232]);
  for (const s of [SPRITES.house, ...SPRITES.wheel]) assert.equal(s.px.length, s.w * s.h);
});
