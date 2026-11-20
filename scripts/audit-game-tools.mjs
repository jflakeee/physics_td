#!/usr/bin/env node
// Read-only audit of optional game-development tooling. No packages are installed.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
const tools = [
  { name: 'Game Studios project template', path: '.claude', installed: existsSync(join(root, 'CLAUDE.md')) && existsSync(join(root, 'project.yaml')) && existsSync(join(root, '.claude')) },
  { name: 'gamedev agent skills', path: '.claude/skills', installed: existsSync(join(root, '.claude/skills')) },
  { name: 'dream-loop', path: '.claude/skills/dream-loop', installed: existsSync(join(root, '.claude/skills/dream-loop')) },
  { name: 'plinkfx runtime', installed: Boolean(deps.plinkfx) },
  { name: 'pixelfx runtime', installed: Boolean(deps.pixelfx) },
];
console.log('Physics TD optional tool audit (read-only)');
for (const tool of tools) {
  console.log(`[${tool.installed ? 'present' : 'not detected'}] ${tool.name}`);
}
console.log('Note: agent skills may also be installed globally or as Claude plugins; this audit cannot detect those.');
console.log('Note: presence is not proof of functional installation. Run tests and inspect Claude plugin list separately.');
