/** Toasts (§15.3): board top, 2 s, at most 2 queued (oldest dropped). */
export const TOAST_MS = 2000;
export const TOAST_MAX = 2;

export interface ToastQueue { items: { text: string; until: number }[]; }

export function pushToast(q: ToastQueue, text: string, now: number): void {
  if (q.items.length && q.items[q.items.length - 1].text === text) { q.items[q.items.length - 1].until = now + TOAST_MS; return; }
  q.items.push({ text, until: now + TOAST_MS });
  while (q.items.length > TOAST_MAX) q.items.shift();
}

/** Drop expired toasts. Returns true when the visible list changed. */
export function expireToasts(q: ToastQueue, now: number): boolean {
  const n = q.items.length;
  q.items = q.items.filter(t => t.until > now);
  return q.items.length !== n;
}
