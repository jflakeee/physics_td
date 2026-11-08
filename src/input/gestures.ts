/**
 * Gesture recognition (DETAILED_DESIGN_V2 §14.1). Pure: feed pointer samples, get gestures.
 * tap: moved < 10px and < 350 ms · longPress: moved < 10px and ≥ 450 ms (fires while held)
 * swipe: moved ≥ 24px, path resampled every 8px · second pointer ignored.
 */

export const GESTURE = { tapMove: 10, tapMs: 350, longMs: 450, swipeMin: 24, sampleEvery: 8 } as const;

export type Gesture =
  | { t: 'tap'; x: number; y: number }
  | { t: 'longPress'; x: number; y: number }
  | { t: 'swipe'; path: [number, number][] };

export interface GestureTracker {
  /** Pointer went down. Returns false if ignored (second pointer). */
  down(id: number, x: number, y: number, ms: number): boolean;
  move(id: number, x: number, y: number, ms: number): void;
  /** Pointer released: returns the finished gesture, if any. */
  up(id: number, x: number, y: number, ms: number): Gesture | null;
  /** Poll while held: returns a longPress once when the hold threshold passes. */
  poll(ms: number): Gesture | null;
  cancel(): void;
}

/** Create a tracker for one surface. */
export function createGestureTracker(): GestureTracker {
  let id = -1, x0 = 0, y0 = 0, t0 = 0, maxMove = 0, longFired = false;
  let path: [number, number][] = [];
  const reset = () => { id = -1; path = []; longFired = false; maxMove = 0; };
  const track = (x: number, y: number) => {
    maxMove = Math.max(maxMove, Math.hypot(x - x0, y - y0));
    const last = path[path.length - 1];
    if (Math.hypot(x - last[0], y - last[1]) >= GESTURE.sampleEvery) path.push([x, y]);
  };
  return {
    down(pid, x, y, ms) {
      if (id >= 0) return false;
      id = pid; x0 = x; y0 = y; t0 = ms; maxMove = 0; longFired = false; path = [[x, y]];
      return true;
    },
    move(pid, x, y) { if (pid === id) track(x, y); },
    up(pid, x, y, ms) {
      if (pid !== id) return null;
      track(x, y);
      const dt = ms - t0, moved = maxMove, fired = longFired, p = path;
      const last = p[p.length - 1];
      if (last[0] !== x || last[1] !== y) p.push([x, y]);
      reset();
      if (fired) return null;
      if (moved < GESTURE.tapMove) {
        if (dt < GESTURE.tapMs) return { t: 'tap', x, y };
        if (dt >= GESTURE.longMs) return { t: 'longPress', x, y };
        return null; // 350–450 ms: ambiguous hold, ignored
      }
      if (moved >= GESTURE.swipeMin) return { t: 'swipe', path: p };
      return null;
    },
    poll(ms) {
      if (id < 0 || longFired || maxMove >= GESTURE.tapMove || ms - t0 < GESTURE.longMs) return null;
      longFired = true;
      return { t: 'longPress', x: x0, y: y0 };
    },
    cancel: reset,
  };
}
