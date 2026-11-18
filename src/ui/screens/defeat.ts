import { el } from '../dom.ts';
import type { Translate } from '../i18n.ts';

/** Inputs to the defeat panel. */
export interface DefeatOptions {
  t: Translate;
  /** The wave that was lost. */
  wave: number;
  /** Retry from the wave-start checkpoint. */
  onRetry(): void;
  /** New run on the same map (new seed). */
  onRestart(): void;
  onMaps(): void;
}

/**
 * Defeat panel (docs/DETAILED_DESIGN_V2.md 15.5) rendered into `box` over the board:
 * [이 웨이브부터] [처음부터] [맵 선택]. The flood-source heatmap is not part of Story 006.
 * @example mountDefeat(endBox, { t, wave: run.wave, onRetry, onRestart, onMaps });
 */
export function mountDefeat(box: HTMLElement, o: DefeatOptions): void {
  const { t } = o;
  box.textContent = '';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', t('defeat.title'));
  box.append(el('h2', 'defeat-title', t('defeat.title')), el('p', '', t('defeat.wave', { n: o.wave })));
  const add = (key: string, on: () => void): void => {
    const b = el('button', 'end-btn', t(key));
    b.setAttribute('aria-label', t(key));
    b.addEventListener('click', on);
    box.appendChild(b);
  };
  add('defeat.retry', o.onRetry);
  add('defeat.restart', o.onRestart);
  add('defeat.toMaps', o.onMaps);
}
