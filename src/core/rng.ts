/** A seeded sfc32 pseudo random stream. */
export interface Rng {
  /** Next float in [0, 1). */
  next(): number;
  /** Next integer in [0, n). */
  int(n: number): number;
  /** Snapshot of the 4 state words (for save/replay). */
  getState(): number[];
}

/** The three independent streams of a run (rerolling cards must not shift events). */
export interface RngStreams {
  cards: Rng;
  events: Rng;
  weather: Rng;
}

/** Integer avalanche used to turn a seed into well mixed state words. */
function mix(x: number): number {
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}

/**
 * Create an sfc32 stream from 4 raw state words.
 * @example const r = sfc32FromState([1, 2, 3, 4]); r.next();
 */
export function sfc32FromState(state: readonly number[]): Rng {
  let a = state[0] >>> 0;
  let b = state[1] >>> 0;
  let c = state[2] >>> 0;
  let d = state[3] >>> 0;
  const nextU32 = (): number => {
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + t) >>> 0;
    return t;
  };
  for (let i = 0; i < 12; i++) nextU32(); // warm-up
  return {
    next: () => nextU32() / 4294967296,
    int: (n) => Math.floor((nextU32() / 4294967296) * n),
    getState: () => [a, b, c, d],
  };
}

/**
 * Create an sfc32 stream from one integer seed.
 * @example const r = createSfc32(123); const x = r.next();
 */
export function createSfc32(seed: number): Rng {
  const s = seed >>> 0;
  return sfc32FromState([mix(s), mix(s + 0x9e3779b9), mix(s + 0x3c6ef372), mix(s + 0xdaa66d2b)]);
}

/**
 * Create the three independent streams (cards, events, weather) from one run seed.
 * @example const { events } = createRngStreams(42); events.next();
 */
export function createRngStreams(seed: number): RngStreams {
  return {
    cards: createSfc32(mix(seed ^ 0x1111)),
    events: createSfc32(mix(seed ^ 0x2222)),
    weather: createSfc32(mix(seed ^ 0x3333)),
  };
}
