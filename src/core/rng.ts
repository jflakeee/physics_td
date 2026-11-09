/**
 * Seeded PRNG (sfc32) with independent named streams.
 * Spec: docs/DETAILED_DESIGN_V2.md §1 (난수) — `rng.cards`, `rng.events`, `rng.weather`.
 * No `Math.random`, no time dependence. State is a plain 4-int array so it can be serialized.
 */

/** Serializable sfc32 state: four uint32 words. */
export type RngState = [number, number, number, number];

/** A seeded uniform generator. */
export interface Rng {
  /** Next float in [0, 1). */
  next(): number;
  /** Next integer in [0, n). */
  int(n: number): number;
  /** Copy of the internal state (for save / replay). */
  state(): RngState;
}

/** splitmix32 — used only to expand a seed into sfc32 state words. */
function splitmix32(a: number): () => number {
  return () => {
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    t ^= t >>> 15;
    return t >>> 0;
  };
}

/** Derive an sfc32 state from a seed and a stream salt. */
export function seedState(seed: number, salt = 0): RngState {
  const sm = splitmix32((seed ^ Math.imul(salt + 1, 0x85ebca6b)) | 0);
  const s: RngState = [sm(), sm(), sm(), sm()];
  // warm up so nearby seeds diverge
  const r = createRng(s);
  for (let i = 0; i < 12; i++) r.next();
  return r.state();
}

/** Create an sfc32 generator from a state (the array is copied). */
export function createRng(init: RngState): Rng {
  let a = init[0] | 0, b = init[1] | 0, c = init[2] | 0, d = init[3] | 0;
  const nextU32 = (): number => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
  return {
    next: () => nextU32() / 4294967296,
    int: (n: number) => Math.floor((nextU32() / 4294967296) * n),
    state: () => [a >>> 0, b >>> 0, c >>> 0, d >>> 0],
  };
}

/** The three independent streams (§1). Rerolling cards never shifts events or weather. */
export interface RngStreams { cards: Rng; events: Rng; weather: Rng; }
export type RngStreamsState = { cards: RngState; events: RngState; weather: RngState };

const SALT = { cards: 1, events: 2, weather: 3 } as const;

/** Create the three streams from one run seed. */
export function createStreams(seed: number): RngStreams {
  return {
    cards: createRng(seedState(seed, SALT.cards)),
    events: createRng(seedState(seed, SALT.events)),
    weather: createRng(seedState(seed, SALT.weather)),
  };
}

/** Snapshot all stream states. */
export function streamsState(s: RngStreams): RngStreamsState {
  return { cards: s.cards.state(), events: s.events.state(), weather: s.weather.state() };
}

/** Restore streams from a snapshot. */
export function restoreStreams(st: RngStreamsState): RngStreams {
  return { cards: createRng(st.cards), events: createRng(st.events), weather: createRng(st.weather) };
}

/**
 * Deterministic integer hash noise in [0, 1) — replaces `Math.sin` noise (§1, §11.2).
 * Same constants as `prototypes/v2-calibrate.mjs`, but with exact 32-bit `Math.imul`
 * (the prototype's float multiply loses precision, so noise values differ slightly).
 */
export function hash2(x: number, y: number): number {
  let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
