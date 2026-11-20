#!/usr/bin/env node
// Read-only audit: detect project-local optional tools without installing anything.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function inspectGameTools(root) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const present = path => existsSync(join(root, path));
  const template = ['CLAUDE.md', 'project.yaml', '.claude'].every(present);
  return [
    { name: 'Game Studios project template', detected: template, evidence: template ? 'CLAUDE.md + project.yaml + .claude' : null },
    { name: 'gamedev agent skills (project local)', detected: present('.claude/skills/router/SKILL.md') || present('.agents/skills/router/SKILL.md'), evidence: 'router/SKILL.md' },
    { name: 'dream-loop (project local)', detected: present('.claude/skills/dream-loop/SKILL.md') || present('.agents/skills/dream-loop/SKILL.md'), evidence: 'dream-loop/SKILL.md' },
    { name: 'plinkfx runtime dependency', detected: Boolean(deps.plinkfx), evidence: deps.plinkfx ?? null },
    { name: 'pixelfx runtime dependency', detected: Boolean(deps.pixelfx), evidence: deps.pixelfx ?? null },
  ];
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  const report = inspectGameTools(process.cwd());
  if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else {
    console.log('Physics TD optional tool audit (read-only)');
    for (const item of report) console.log(`[${item.detected ? 'detected' : 'not detected'}] ${item.name}`);
    console.log('Global Claude plugins/skills are outside this audit; detected files do not prove functionality.');
  }
}
