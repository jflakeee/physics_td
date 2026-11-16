import { el } from '../dom.ts';

/** Toast lifetime and visible queue length (spec 15.3). */
const TOAST_MS = 2000;
const MAX_TOASTS = 2;

/** Show a short message at the top of the board. */
export type Toast = (text: string) => void;

/**
 * Toast stack inside `root` (role=status, newest last, at most 2 visible).
 * @example const toast = createToaster(wrap); toast(t('toast.paused'));
 */
export function createToaster(root: HTMLElement): Toast {
  const box = el('div', 'toasts');
  box.setAttribute('role', 'status');
  box.setAttribute('aria-live', 'polite');
  root.appendChild(box);
  return (text) => {
    while (box.childElementCount >= MAX_TOASTS) box.firstElementChild?.remove();
    const item = el('div', 'toast', text);
    box.appendChild(item);
    window.setTimeout(() => item.remove(), TOAST_MS);
  };
}
