/** Story 004 AC: fixed-placement bots on glacier-meadow — single means lose, mixed clear (GD §26.2). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadMap } from '../../../src/game/map.ts';
import { STRATEGIES, runStrategy } from '../../../bots/strategies.ts';
import { byId } from './fixtures.ts';

for (const [name, s] of Object.entries(STRATEGIES)) {
  test(`glacier-meadow: ${name} → ${s.mixed ? 'clear' : 'defeat'}`, () => {
    const r = runStrategy(() => loadMap(byId('glacier-meadow')), name);
    assert.equal(r.result, s.mixed ? 'clear' : 'defeat', JSON.stringify(r));
  });
}
