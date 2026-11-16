import type { Translate } from '../i18n.ts';
import { el } from '../dom.ts';

/** Values shown by the HUD. The screen mutates one instance per frame. */
export interface HudView {
  hp: number;
  cash: number;
  wave: number;
  waveMax: number;
  level: number;
  /** Base flood ratio: core water / damage threshold (1 = damage starts). */
  flood: number;
  paused: boolean;
  speed: 1 | 2;
}

/** HUD widget handle. */
export interface Hud {
  /** Write only the DOM nodes whose value changed since the last call. */
  update(v: Readonly<HudView>): void;
}

/**
 * Build the HUD (spec 15.3): hp, cash, wave/max, Lv, base flood gauge, pause, speed.
 * @example const hud = createHud(header, t, { onPause, onSpeed }); hud.update(view);
 */
export function createHud(root: HTMLElement, t: Translate, on: { onPause(): void; onSpeed(): void }): Hud {
  const stats = el('div', 'stats');
  const stat = (icon: string, labelKey: string, extra = ''): HTMLElement => {
    const s = el('span', `stat ${extra}`);
    s.append(el('span', 'ic', icon), el('span', 'sr', t(labelKey)));
    const v = el('b');
    s.appendChild(v);
    stats.appendChild(s);
    return v;
  };
  const hp = stat('❤', 'hud.hp');
  const cash = stat('\u{1F4B0}', 'hud.cash');
  const wave = stat('\u{1F30A}', 'hud.wave');
  const level = stat('', 'hud.level', 'hide-short');
  const pause = el('button', 'hud-btn');
  const speed = el('button', 'hud-btn');
  pause.addEventListener('click', on.onPause);
  speed.addEventListener('click', on.onSpeed);
  const gauge = el('div', 'gauge');
  gauge.setAttribute('role', 'progressbar');
  gauge.setAttribute('aria-label', t('hud.flood'));
  gauge.setAttribute('aria-valuemin', '0');
  gauge.setAttribute('aria-valuemax', '100');
  const track = el('div', 'track');
  const fill = el('div', 'fill');
  track.appendChild(fill);
  gauge.append(el('span', 'ic hide-short', '\u{1F3E0}'), track);
  root.append(stats, pause, speed, gauge);

  const last = { hp: -1, cash: -1, wave: -1, waveMax: -1, level: -1, flood: -1, paused: null as boolean | null, speed: 0 };
  return {
    update(v: Readonly<HudView>): void {
      if (v.hp !== last.hp) hp.textContent = String((last.hp = v.hp));
      if (v.cash !== last.cash) cash.textContent = String((last.cash = v.cash));
      if (v.wave !== last.wave || v.waveMax !== last.waveMax) {
        last.wave = v.wave;
        last.waveMax = v.waveMax;
        wave.textContent = t('hud.waveValue', { n: v.wave, max: v.waveMax });
      }
      if (v.level !== last.level) level.textContent = t('hud.levelValue', { n: (last.level = v.level) });
      const pct = Math.min(100, Math.round(v.flood * 100));
      if (pct !== last.flood) {
        last.flood = pct;
        fill.style.width = `${pct}%`;
        gauge.setAttribute('aria-valuenow', String(pct));
        gauge.classList.toggle('danger', pct >= 100);
      }
      if (v.paused !== last.paused) {
        last.paused = v.paused;
        pause.textContent = v.paused ? '▶' : '⏸';
        pause.setAttribute('aria-label', t(v.paused ? 'hud.resume' : 'hud.pause'));
        pause.setAttribute('aria-pressed', String(v.paused));
      }
      if (v.speed !== last.speed) {
        last.speed = v.speed;
        speed.textContent = t('hud.speedValue', { x: v.speed });
        speed.setAttribute('aria-label', t('hud.speed', { x: v.speed }));
      }
    },
  };
}
