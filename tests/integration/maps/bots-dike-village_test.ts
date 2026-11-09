/** Story 004 AC: fixed-placement bots on dike-village — single means lose, mixed clear (GD §26.2). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadMap } from '../../../src/game/map.ts';
import { STRATEGIES, runStrategy } from '../../../bots/strategies.ts';
import { byId } from './fixtures.ts';

for (const [name, s] of Object.entries(STRATEGIES)) {
  test(`dike-village: ${name} → ${s.mixed ? 'clear' : 'defeat'}`, () => {
    const r = runStrategy(() => loadMap(byId('dike-village')), name);
    assert.equal(r.result, s.mixed ? 'clear' : 'defeat', JSON.stringify(r));
  });
}
