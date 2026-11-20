import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

for (const path of ['prototypes/tools-sfx/index.html', 'prototypes/tools-vfx/index.html']) {
  test(`prototype module syntax: ${path}`, () => {
    const html = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
    const scripts = [...html.matchAll(/<script\s+type="module"[^>]*>([\s\S]*?)<\/script>/g)];
    assert.equal(scripts.length, 1, 'expected exactly one inline module');
    const result = spawnSync(process.execPath, ['--check', '--input-type=module'], {
      input: scripts[0][1], encoding: 'utf8'
    });
    assert.equal(result.status, 0, result.stderr);
  });
}
