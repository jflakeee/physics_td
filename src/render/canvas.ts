/**
 * Board sizing (DETAILED_DESIGN_V2 §13): fit a 2:3 board into the available box,
 * internal resolution × DPR (max 2).
 */

/** CSS size of the board for an available box; aspect = gridH / gridW. */
export function fitBoard(availW: number, availH: number, aspect = 1.5): { cssW: number; cssH: number } {
  const cssH = Math.max(0, Math.floor(Math.min(availH, availW * aspect)));
  return { cssW: Math.floor(cssH / aspect), cssH };
}

/** Resize a canvas for its CSS size and device pixel ratio. Returns the scale used. */
export function sizeCanvas(c: HTMLCanvasElement, cssW: number, cssH: number, dpr: number): number {
  const d = Math.min(2, Math.max(1, dpr));
  c.style.width = cssW + 'px';
  c.style.height = cssH + 'px';
  const w = Math.round(cssW * d), h = Math.round(cssH * d);
  if (c.width !== w) c.width = w;
  if (c.height !== h) c.height = h;
  return d;
}
