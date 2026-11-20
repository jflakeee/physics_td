import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectGameTools } from '../scripts/audit-game-tools.mjs';

function withProject(fn) {
  const root = mkdtempSync(join(tmpdir(), 'ptd-tools-'));
  try {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'fixture', dependencies: {}, devDependencies: {} }));
    fn(root);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test('audit reports optional tools absent without project manifests', () => withProject(root => {
  const report = inspectGameTools(root);
  assert.equal(report.length, 5);
  assert.ok(report.every(x => x.detected === false));
}));

test('audit distinguishes a generic skills directory from a router skill', () => withProject(root => {
  mkdirSync(join(root, '.claude', 'skills'), { recursive: true });
  assert.equal(inspectGameTools(root)[1].detected, false);
  mkdirSync(join(root, '.claude', 'skills', 'router'), { recursive: true });
  writeFileSync(join(root, '.claude', 'skills', 'router', 'SKILL.md'), '# router');
  assert.equal(inspectGameTools(root)[1].detected, true);
}));

test('audit recognizes runtime dependencies and dream-loop manifest', () => withProject(root => {
  writeFileSync(join(root, 'package.json'), JSON.stringify({ dependencies: { plinkfx: '^1.0.0', pixelfx: 'github:patch-gg/pixelfx' } }));
  mkdirSync(join(root, '.agents', 'skills', 'dream-loop'), { recursive: true });
  writeFileSync(join(root, '.agents', 'skills', 'dream-loop', 'SKILL.md'), '# dream loop');
  const report = inspectGameTools(root);
  assert.equal(report[2].detected, true);
  assert.equal(report[3].detected, true);
  assert.equal(report[4].detected, true);
}));
