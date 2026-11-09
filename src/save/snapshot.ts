import type { Play } from '../game/play.ts';
import { restoreCheckpoint, takeCheckpoint } from '../game/checkpoint.ts';
import type { Card } from '../rules/cards.ts';

/**
 * Run snapshot ↔ string (DETAILED §16): the current state (checkpoint format) plus phase,
 * pending draft offer and retry count. Saved only outside waves, so the retry checkpoint is
 * not stored (the next wave start makes a new one). Typed arrays → zero-RLE → base64.
 */

const TYPED: Record<string, { new (b: ArrayBuffer): ArrayBufferView }> = {
  Float64Array, Float32Array, Uint16Array, Uint8Array, Uint32Array,
};

function b64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function unb64(s: string): Uint8Array {
  const bin = atob(s), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Zero-run RLE: 0x00 is followed by a run length 1..255; most sim layers are mostly zeros. */
function rle(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.length * 2 + 2);
  let o = 0;
  for (let i = 0; i < bytes.length;) {
    if (bytes[i] !== 0) { out[o++] = bytes[i++]; continue; }
    let n = 0;
    while (i < bytes.length && bytes[i] === 0 && n < 255) { i++; n++; }
    out[o++] = 0; out[o++] = n;
  }
  return out.subarray(0, o);
}
function unrle(src: Uint8Array, size: number): Uint8Array {
  const out = new Uint8Array(size);
  let o = 0;
  for (let i = 0; i < src.length;) {
    if (src[i] !== 0) { out[o++] = src[i++]; continue; }
    o += src[i + 1]; i += 2;
  }
  return out;
}

function encode(_k: string, v: unknown): unknown {
  if (ArrayBuffer.isView(v)) {
    const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    return { $ta: v.constructor.name, n: bytes.length, b: b64(rle(bytes)) };
  }
  if (v instanceof Set) return { $set: [...v] };
  return v;
}
function decode(_k: string, v: unknown): unknown {
  if (v && typeof v === 'object') {
    const o = v as { $ta?: string; n?: number; b?: string; $set?: unknown[] };
    if (o.$ta && o.b !== undefined) return new TYPED[o.$ta](unrle(unb64(o.b), o.n ?? 0).buffer as ArrayBuffer);
    if (o.$set) return new Set(o.$set);
  }
  return v;
}

export interface RunSnapshot { cp: ReturnType<typeof takeCheckpoint>; phase: Play['phase']; offer: Card[] | null; retries: number; }

/**
 * Serialise the run. In prepare / levelup it is the current state; during a wave it is the
 * state the wave started from (its checkpoint), so a resume lands in that wave's prepare.
 */
export function serializeRun(p: Play): string | null {
  const inWave = p.phase === 'wave' || p.phase === 'defeat';
  if (inWave && !p.checkpoint) return null;
  if (p.phase === 'result') return null;
  const snap: RunSnapshot = inWave
    ? { cp: p.checkpoint!, phase: 'prepare', offer: null, retries: p.retries }
    : { cp: takeCheckpoint(p), phase: p.phase, offer: p.draft?.offer ?? null, retries: p.retries };
  return JSON.stringify(snap, encode);
}

/** Restore a serialised run into a fresh play of the same map / character / seed. */
export function restoreRun(p: Play, s: string): void {
  const snap = JSON.parse(s, decode) as RunSnapshot;
  restoreCheckpoint(p, snap.cp);
  p.phase = snap.phase === 'wave' ? 'prepare' : snap.phase;
  p.retries = snap.retries;
  p.checkpoint = null; // the next wave start takes a fresh one
  if (p.draft) p.draft.offer = snap.offer;
}
