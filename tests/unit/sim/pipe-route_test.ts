import test from 'node:test';
import assert from 'node:assert/strict';
import { createGrid } from '../../../src/sim/grid.ts';
import { findPipeRoute } from '../../../src/sim/pipeRoute.ts';

test('P1-D: deterministic straight route and endpoint identity', () => {
  const g = createGrid(5, 3);
  assert.deepEqual(findPipeRoute(g, 5, 9), [5, 6, 7, 8, 9]);
  assert.deepEqual(findPipeRoute(g, 5, 9), findPipeRoute(g, 5, 9));
  assert.deepEqual(findPipeRoute(g, 5, 5), [5]);
});

test('P1-D: obstacles force shortest four-way detour', () => {
  const g = createGrid(5, 3);
  g.wall[7] = 1;
  assert.deepEqual(findPipeRoute(g, 5, 9), [5, 6, 1, 2, 3, 8, 9]);
  assert.equal(findPipeRoute(g, 5, 9, 5), null);
  assert.equal(findPipeRoute(g, 5, 9, 6)?.length, 7);
});

test('P1-D: blocked corridors and invalid endpoints are rejected', () => {
  const g = createGrid(3, 3);
  g.wall[1] = 1;
  g.tmp[4] = 1;
  g.gate[7] = 1;
  assert.equal(findPipeRoute(g, 0, 8), null);
  assert.equal(findPipeRoute(g, -1, 8), null);
  assert.equal(findPipeRoute(g, 0, 9), null);
  assert.equal(findPipeRoute(g, 0, 8, 0), null);
});

test('P1-D: base-core cells are avoided except as endpoints', () => {
  const g = createGrid(3, 2);
  g.flags[1] = 4;
  assert.deepEqual(findPipeRoute(g, 0, 2), [0, 3, 4, 5, 2]);
  assert.deepEqual(findPipeRoute(g, 0, 1), [0, 1]);
});
