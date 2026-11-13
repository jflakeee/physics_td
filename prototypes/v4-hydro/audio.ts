/**
 * Sound effects for the V4 prototype: short synthesized notes (no audio files).
 * `SFX` is data (testable without a browser); `createSfx` plays it through WebAudio.
 * Screens never call WebAudio directly: they call `sfx.play(name)`.
 */
export type SfxName =
  | 'wood' | 'stone' | 'coin' | 'build' | 'upgrade' | 'deny' | 'levelup' | 'card'
  | 'forecast' | 'disaster' | 'heart' | 'spirit' | 'season' | 'win' | 'lose' | 'start';

/** One note: frequency (Hz), start (s), length (s), wave, loudness (0..1), optional slide to another frequency. */
export interface Note { f: number; at: number; len: number; wave: 'sine' | 'square' | 'triangle' | 'sawtooth' | 'noise'; vol: number; to?: number }

export const SFX: Readonly<Record<SfxName, readonly Note[]>> = {
  wood: [{ f: 180, at: 0, len: 0.06, wave: 'square', vol: 0.25, to: 120 }, { f: 0, at: 0, len: 0.05, wave: 'noise', vol: 0.2 }],
  stone: [{ f: 420, at: 0, len: 0.04, wave: 'triangle', vol: 0.3, to: 300 }, { f: 0, at: 0, len: 0.03, wave: 'noise', vol: 0.25 }],
  coin: [{ f: 988, at: 0, len: 0.06, wave: 'square', vol: 0.18 }, { f: 1319, at: 0.06, len: 0.12, wave: 'square', vol: 0.18 }],
  build: [{ f: 196, at: 0, len: 0.08, wave: 'square', vol: 0.25 }, { f: 262, at: 0.08, len: 0.08, wave: 'square', vol: 0.25 }, { f: 392, at: 0.16, len: 0.14, wave: 'square', vol: 0.25 }],
  upgrade: [{ f: 392, at: 0, len: 0.07, wave: 'triangle', vol: 0.3 }, { f: 523, at: 0.07, len: 0.07, wave: 'triangle', vol: 0.3 }, { f: 659, at: 0.14, len: 0.07, wave: 'triangle', vol: 0.3 }, { f: 784, at: 0.21, len: 0.16, wave: 'triangle', vol: 0.3 }],
  deny: [{ f: 160, at: 0, len: 0.09, wave: 'sawtooth', vol: 0.2 }, { f: 120, at: 0.1, len: 0.12, wave: 'sawtooth', vol: 0.2 }],
  levelup: [{ f: 523, at: 0, len: 0.09, wave: 'square', vol: 0.22 }, { f: 659, at: 0.09, len: 0.09, wave: 'square', vol: 0.22 }, { f: 784, at: 0.18, len: 0.09, wave: 'square', vol: 0.22 }, { f: 1047, at: 0.27, len: 0.25, wave: 'square', vol: 0.22 }],
  card: [{ f: 660, at: 0, len: 0.05, wave: 'triangle', vol: 0.3 }, { f: 880, at: 0.05, len: 0.1, wave: 'triangle', vol: 0.3 }],
  forecast: [{ f: 440, at: 0, len: 0.12, wave: 'sine', vol: 0.3 }, { f: 440, at: 0.18, len: 0.12, wave: 'sine', vol: 0.3 }],
  disaster: [{ f: 110, at: 0, len: 0.5, wave: 'sawtooth', vol: 0.28, to: 55 }, { f: 0, at: 0, len: 0.4, wave: 'noise', vol: 0.2 }],
  heart: [{ f: 330, at: 0, len: 0.14, wave: 'square', vol: 0.25, to: 220 }, { f: 220, at: 0.16, len: 0.22, wave: 'square', vol: 0.25, to: 147 }],
  spirit: [{ f: 880, at: 0, len: 0.08, wave: 'sine', vol: 0.22, to: 1320 }, { f: 1320, at: 0.08, len: 0.14, wave: 'sine', vol: 0.18, to: 1760 }],
  season: [{ f: 392, at: 0, len: 0.12, wave: 'triangle', vol: 0.28 }, { f: 494, at: 0.12, len: 0.12, wave: 'triangle', vol: 0.28 }, { f: 587, at: 0.24, len: 0.22, wave: 'triangle', vol: 0.28 }],
  win: [{ f: 523, at: 0, len: 0.12, wave: 'square', vol: 0.24 }, { f: 659, at: 0.12, len: 0.12, wave: 'square', vol: 0.24 }, { f: 784, at: 0.24, len: 0.12, wave: 'square', vol: 0.24 }, { f: 1047, at: 0.36, len: 0.12, wave: 'square', vol: 0.24 }, { f: 1319, at: 0.48, len: 0.4, wave: 'square', vol: 0.24 }],
  lose: [{ f: 392, at: 0, len: 0.2, wave: 'triangle', vol: 0.3 }, { f: 330, at: 0.2, len: 0.2, wave: 'triangle', vol: 0.3 }, { f: 262, at: 0.4, len: 0.2, wave: 'triangle', vol: 0.3 }, { f: 196, at: 0.6, len: 0.5, wave: 'triangle', vol: 0.3 }],
  start: [{ f: 330, at: 0, len: 0.08, wave: 'square', vol: 0.22 }, { f: 494, at: 0.08, len: 0.16, wave: 'square', vol: 0.22 }],
};

/** Shortest gap (s) between two plays of the same sound, so rapid taps do not stack into noise. */
export const MIN_GAP = 0.05;

export interface Sfx { play(name: SfxName): void; setOn(on: boolean): void; readonly on: boolean; /** Names played since creation (tests, dev). */ readonly log: SfxName[] }

/**
 * Player. `makeCtx` is called on the first sound (browsers only allow audio after a tap).
 * With sound off, or where WebAudio is missing, `play` only records the name.
 */
export function createSfx(makeCtx: () => AudioContext | null, on = true): Sfx {
  let ctx: AudioContext | null = null, enabled = on, noise: AudioBuffer | null = null;
  const last = new Map<SfxName, number>(), log: SfxName[] = [];
  return {
    get on() { return enabled; }, log,
    setOn(v) { enabled = v; },
    play(name) {
      log.push(name); if (log.length > 200) log.shift();
      if (!enabled) return;
      try {
        ctx ??= makeCtx();
        if (!ctx) return;
        if (ctx.state === 'suspended') void ctx.resume();
        const t0 = ctx.currentTime;
        if (t0 - (last.get(name) ?? -1) < MIN_GAP) return;
        last.set(name, t0);
        for (const n of SFX[name]) {
          const gain = ctx.createGain(), s = t0 + n.at;
          gain.gain.setValueAtTime(n.vol * 0.5, s);
          gain.gain.exponentialRampToValueAtTime(0.001, s + n.len);
          gain.connect(ctx.destination);
          if (n.wave === 'noise') {
            if (!noise) { noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate); const d = noise.getChannelData(0); let x = 12345; for (let i = 0; i < d.length; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; d[i] = x / 0x3fffffff - 1; } }
            const src = ctx.createBufferSource(); src.buffer = noise; src.connect(gain); src.start(s); src.stop(s + n.len);
          } else {
            const o = ctx.createOscillator(); o.type = n.wave; o.frequency.setValueAtTime(n.f, s);
            if (n.to) o.frequency.exponentialRampToValueAtTime(n.to, s + n.len);
            o.connect(gain); o.start(s); o.stop(s + n.len + 0.02);
          }
        }
      } catch { /* audio not available: stay silent */ }
    },
  };
}
