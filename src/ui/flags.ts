/** Persistent first-run flags in localStorage (private mode / blocked storage = flag never set). */
const PREFIX = 'physics-td.v2.';

/**
 * Read a flag; false when storage is unavailable.
 * @example if (!getFlag('firstRunDone')) showBadge();
 */
export function getFlag(key: string): boolean {
  try {
    return localStorage.getItem(PREFIX + key) === '1';
  } catch {
    return false;
  }
}

/**
 * Set a flag; silently ignored when storage is unavailable.
 * @example setFlag('tutorialDone');
 */
export function setFlag(key: string): void {
  try {
    localStorage.setItem(PREFIX + key, '1');
  } catch {
    // Storage blocked: the flag lives only for this page load.
  }
}
