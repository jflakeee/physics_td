/**
 * Balance through player commands only (DETAILED §21 home/challenge bots, GD §17 targets).
 * The fixed-placement bots (tests/integration/maps) prove single means lose; these prove the
 * game is winnable — and not trivial — with zone skills, pumps and cards.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS } from '../../../src/data/maps.ts';
import { CHARACTERS } from '../../../src/data/catalog.ts';
import { runSkillBot } from '../../../bots/skillBot.ts';

const [DK, WR] = CHARACTERS;
const map = (id: string) => MAPS.find(m => m.id === id)!;
const SEEDS = [1, 2, 3];

// HP bands: GD §17 home target is 50–80 (bands allow seed spread).
for (const [mapId, char, label, maxHp] of [
  ['dike-village', DK, '정석 둑지기 @ 둑마을', 90],
  ['willow-fields', WR, '정석 습지 연구원 @ 버드나무 들', 90],
  ['glacier-meadow', DK, '중립 둑지기 @ 얼음 목초지', 90],
  ['glacier-lake-valley', WR, '중립 습지 연구원 @ 빙하호 계곡', 100],
] as const) {
  test(`${label}: clears with HP ≥ 50 (≤ ${maxHp})`, () => {
    for (const s of SEEDS) {
      const r = runSkillBot(map(mapId), char, s);
      assert.equal(r.result, 'clear', JSON.stringify(r));
      assert.ok(r.hp >= 50 && r.hp <= maxHp, `HP ${r.hp}`);
    }
  });
}

test('도전 습지 연구원 @ 둑마을: wins most runs (target ≥ 60%)', () => {
  const runs = [1, 2, 3, 4, 5].map(s => runSkillBot(map('dike-village'), WR, s));
  assert.ok(runs.filter(r => r.result === 'clear').length >= 3, JSON.stringify(runs.map(r => [r.result, r.hp])));
});

test('도전 둑지기 @ 버드나무 들: the levee square closes on plain zones (≥ 60%)', () => {
  const runs = [1, 2, 3, 4, 5].map(s => runSkillBot(map('willow-fields'), DK, s));
  assert.ok(runs.filter(r => r.result === 'clear').length >= 3, JSON.stringify(runs.map(r => [r.result, r.hp])));
});
