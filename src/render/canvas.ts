import { GRID_H, GRID_W } from '../sim/constants.ts';

/** Board size in CSS pixels and backing-store pixels. */
export interface BoardSize {
  cssW: number;
  cssH: number;
  dpr: number;
  pxW: number;
  pxH: number;
}

/** Device pixel ratio cap (spec 13). */
export const MAX_DPR = 2;

/**
 * Fit the board canvas into the available box (spec 13): cssH = min(availH, availW * 1.5),
 * cssW = cssH / 1.5, backing store x DPR (max 2).
 * @example const size = fitBoard(canvas, wrap.clientWidth, wrap.clientHeight);
 */
export function fitBoard(canvas: HTMLCanvasElement, availW: number, availH: number): BoardSize {
  const ratio = GRID_H / GRID_W;
  const cssH = Math.max(GRID_H, Math.floor(Math.min(availH, availW * ratio)));
  const cssW = Math.floor(cssH / ratio);
  const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
  const pxW = Math.round(cssW * dpr);
  const pxH = Math.round(cssH * dpr);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  if (canvas.width !== pxW) canvas.width = pxW;
  if (canvas.height !== pxH) canvas.height = pxH;
  return { cssW, cssH, dpr, pxW, pxH };
}
