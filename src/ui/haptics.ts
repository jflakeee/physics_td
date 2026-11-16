/** Shake amplitude and duration replacing vibration where `navigator.vibrate` is missing (iOS, spec 17). */
const SHAKE_PX = 2;
const SHAKE_MS = 80;

/** Fire a haptic pattern (ms, or on/off list). */
export type Haptic = (pattern: number | number[]) => void;

/**
 * Vibrate when supported, else a tiny 2px / 80ms shake of `shakeEl` (skipped under
 * prefers-reduced-motion).
 * @example const haptic = createHaptics(boardWrap); haptic(10);
 */
export function createHaptics(shakeEl: HTMLElement): Haptic {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const canVibrate = typeof navigator.vibrate === 'function';
  return (pattern) => {
    if (canVibrate) {
      navigator.vibrate(pattern);
      return;
    }
    if (reduced.matches || typeof shakeEl.animate !== 'function') return;
    shakeEl.animate(
      [
        { transform: 'translate(0,0)' },
        { transform: `translate(${SHAKE_PX}px,0)` },
        { transform: `translate(-${SHAKE_PX}px,0)` },
        { transform: 'translate(0,0)' },
      ],
      { duration: SHAKE_MS },
    );
  };
}
