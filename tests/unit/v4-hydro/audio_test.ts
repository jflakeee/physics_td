// V4 sound effects: data sanity and the player's on/off and rate rules (no browser needed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSfx, MIN_GAP, SFX, type SfxName } from '../../../prototypes/v4-hydro/audio.ts';
import { defaultMeta, loadMeta, META_KEY } from '../../../prototypes/v4-hydro/meta.ts';

/** A stand-in AudioContext that counts what would sound. */
function fakeCtx() {
  const c = { currentTime: 0, sampleRate: 8000, state: 'running', destination: {}, started: 0,
    resume: async () => {},
    createGain: () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }),
    createOscillator: () => ({ type: '', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() { c.started++; }, stop() {} }),
    createBuffer: (_ch: number, len: number) => ({ getChannelData: () => new Float32Array(len) }),
    createBufferSource: () => ({ buffer: null, connect() {}, start() { c.started++; }, stop() {} }),
  };
  return c;
}

test('every_sound_is_short_and_not_too_loud', () => {
  for (const [name, notes] of Object.entries(SFX)) {
    assert.ok(notes.length >= 1 && notes.length <= 6, name);
    for (const n of notes) {
      assert.ok(n.vol > 0 && n.vol <= 0.3, `${name} volume`);
      assert.ok(n.at >= 0 && n.len > 0 && n.at + n.len <= 1.2, `${name} length`);
      if (n.wave !== 'noise') assert.ok(n.f >= 50 && n.f <= 2000, `${name} pitch`);
    }
  }
});

test('playing_sounds_every_note_and_muting_sounds_none', () => {
  const ctx = fakeCtx(), sfx = createSfx(() => ctx as unknown as AudioContext);
  sfx.play('build');
  assert.equal(ctx.started, SFX.build.length);
  sfx.setOn(false); sfx.play('upgrade');
  assert.equal(ctx.started, SFX.build.length, 'muted');
  assert.deepEqual(sfx.log, ['build', 'upgrade'], 'the log keeps what was asked for');
});

test('the_same_sound_does_not_stack_within_a_moment', () => {
  const ctx = fakeCtx(), sfx = createSfx(() => ctx as unknown as AudioContext);
  sfx.play('wood'); sfx.play('wood');
  assert.equal(ctx.started, SFX.wood.length);
  ctx.currentTime += MIN_GAP * 2; sfx.play('wood');
  assert.equal(ctx.started, SFX.wood.length * 2);
});

test('no_audio_support_is_silent_not_an_error', () => {
  const none = createSfx(() => null);
  none.play('coin' as SfxName);
  const broken = createSfx(() => { throw new Error('blocked'); });
  broken.play('coin');
  assert.equal(broken.log.length, 1);
});

test('the_sound_setting_is_saved_and_defaults_to_on', () => {
  assert.equal(defaultMeta().sound, true);
  const m = new Map<string, string>(), store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  store.setItem(META_KEY, JSON.stringify({ gems: 1 }));
  assert.equal(loadMeta(store).sound, true, 'old saves get sound on');
  store.setItem(META_KEY, JSON.stringify({ sound: false }));
  assert.equal(loadMeta(store).sound, false);
});
