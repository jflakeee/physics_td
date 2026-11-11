import type { SimGrid } from '../core/types.ts';

/**
 * Deterministic 4-neighbour pipe route. This computes a proposed route only:
 * it does not build pipes, spend cash or change pump water transfer.
 *
 * A cell with a permanent/temporary wall, a closed gate or base-core flag
 * cannot be traversed, except for the selected endpoints.
 * Tie-break order: east, south, west, north.
 */
export function findPipeRoute(grid: SimGrid, from: number, to: number, maxLength = Infinity): number[] | null {
  const { width: W, height: H } = grid, n = W * H;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= n || to >= n) return null;
  if (from === to) return [from];
  if (maxLength < 1) return null;
  const prev = new Int32Array(n).fill(-1);
  const distance = new Int32Array(n);
  const queue = new Int32Array(n);
  let head = 0, tail = 0;
  queue[tail++] = from;
  prev[from] = from;
  while (head < tail) {
    const cell = queue[head++], x = cell % W, y = (cell / W) | 0;
    if (distance[cell] >= maxLength) continue;
    const neighbors = [x + 1 < W ? cell + 1 : -1, y + 1 < H ? cell + W : -1,
      x > 0 ? cell - 1 : -1, y > 0 ? cell - W : -1];
    for (const next of neighbors) {
      if (next < 0 || prev[next] !== -1) continue;
      if (next !== to && (grid.wall[next] > 0 || grid.tmp[next] > 0 || grid.gate[next] > 0 || (grid.flags[next] & 4) !== 0)) continue;
      prev[next] = cell;
      distance[next] = distance[cell] + 1;
      if (next === to) {
        const route = [to];
        for (let at = to; at !== from;) { at = prev[at]; route.push(at); }
        return route.reverse();
      }
      queue[tail++] = next;
    }
  }
  return null;
}
