/**
 * HUD (DETAILED_DESIGN_V2 §15.3): ❤ hp, 💰 cash, 🌊 wave/5, Lv, flood gauge.
 * DOM is written only when a value changes (AC: "값이 바뀔 때만 DOM 쓰기").
 */

/** Minimal element surface used by the HUD (lets tests count writes). */
export interface TextSink { textContent: string | null; }
export interface StyleSink { style: { width: string }; setAttribute(k: string, v: string): void; }

export interface HudValues { hp: number; cash: number | null; wave: number; waves: number; level: number; flood: number; threshold: number; }

export interface HudSinks { hp: TextSink; cash: TextSink; wave: TextSink; level: TextSink; gauge: StyleSink; gaugeText: TextSink; }

/** Create an updater that skips unchanged values. Returns the number of DOM writes per call. */
export function createHud(s: HudSinks) {
  const last: Record<string, string> = {};
  const set = (k: string, v: string, write: (v: string) => void): number => {
    if (last[k] === v) return 0;
    last[k] = v; write(v); return 1;
  };
  return (v: HudValues): number => {
    let n = 0;
    n += set('hp', String(v.hp), x => { s.hp.textContent = x; });
    n += set('cash', v.cash === null ? '∞' : String(v.cash), x => { s.cash.textContent = x; });
    n += set('wave', `${Math.max(1, v.wave)}/${v.waves}`, x => { s.wave.textContent = x; });
    n += set('level', String(v.level), x => { s.level.textContent = x; });
    const pct = Math.min(100, Math.round(v.flood / v.threshold * 100));
    n += set('gauge', String(pct), x => { s.gauge.style.width = x + '%'; s.gauge.setAttribute('aria-valuenow', x); });
    n += set('gaugeText', `${v.flood.toFixed(2)}/${v.threshold}`, x => { s.gaugeText.textContent = x; });
    return n;
  };
}
