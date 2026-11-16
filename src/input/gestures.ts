/** Gesture thresholds (spec 14.1). */
export const TAP_MAX_MOVE = 10;
export const TAP_MAX_MS = 350;
export const LONG_PRESS_MS = 450;
export const SWIPE_MIN_MOVE = 24;
export const SWIPE_SAMPLE_PX = 8;

/** Callbacks receive client coordinates; a swipe path is flat [x0, y0, x1, y1, ...]. */
export interface GestureHandlers {
  onTap?(x: number, y: number): void;
  onLongPress?(x: number, y: number): void;
  onSwipe?(path: number[]): void;
}

/**
 * Recognise tap / longPress / swipe on an element with pointer events. Only the first
 * pointer is tracked (multi-touch ignored). A long press fires while the finger is still
 * down, so the following pointerup produces nothing.
 * @returns Detach function.
 * @example const off = attachGestures(canvas, { onTap: (x, y) => select(x, y) });
 */
export function attachGestures(el: HTMLElement, h: GestureHandlers): () => void {
  let id = -1;
  let sx = 0;
  let sy = 0;
  let t0 = 0;
  let maxMove = 0;
  let fired = false;
  let timer = 0;
  let path: number[] = [];

  const clear = (): void => {
    if (timer) clearTimeout(timer);
    timer = 0;
    id = -1;
  };
  const down = (e: PointerEvent): void => {
    if (id !== -1 || !e.isPrimary || e.button > 0) return;
    id = e.pointerId;
    sx = e.clientX;
    sy = e.clientY;
    t0 = e.timeStamp;
    maxMove = 0;
    fired = false;
    path = [sx, sy];
    try {
      el.setPointerCapture(id);
    } catch {
      // Capture is best-effort (synthetic or already-released pointers); recognition still works.
    }
    if (h.onLongPress) {
      timer = window.setTimeout(() => {
        timer = 0;
        if (id !== -1 && maxMove < TAP_MAX_MOVE) {
          fired = true;
          h.onLongPress?.(sx, sy);
        }
      }, LONG_PRESS_MS);
    }
  };
  const move = (e: PointerEvent): void => {
    if (e.pointerId !== id) return;
    maxMove = Math.max(maxMove, Math.hypot(e.clientX - sx, e.clientY - sy));
    const lx = path[path.length - 2];
    const ly = path[path.length - 1];
    if (Math.hypot(e.clientX - lx, e.clientY - ly) >= SWIPE_SAMPLE_PX) path.push(e.clientX, e.clientY);
  };
  const up = (e: PointerEvent): void => {
    if (e.pointerId !== id) return;
    const dt = e.timeStamp - t0;
    clear();
    if (fired) return;
    if (maxMove < TAP_MAX_MOVE && dt < TAP_MAX_MS) h.onTap?.(e.clientX, e.clientY);
    else if (maxMove >= SWIPE_MIN_MOVE) {
      path.push(e.clientX, e.clientY);
      h.onSwipe?.(path);
    }
  };
  const cancel = (e: PointerEvent): void => {
    if (e.pointerId === id) clear();
  };
  const noMenu = (e: Event): void => e.preventDefault();
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('contextmenu', noMenu);
  return () => {
    clear();
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', cancel);
    el.removeEventListener('contextmenu', noMenu);
  };
}
