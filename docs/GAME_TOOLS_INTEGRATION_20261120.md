# Game development tools integration (2026-11-20)

Status: **integration preparation only**. No npm dependencies installed, no gameplay files changed, and no deployment performed.

## Baseline
- Project: Physics TD, TypeScript/ES modules, static GitHub Pages build.
- Node requirement: >=22.18 (see package.json).
- Claude Code Game Studios is already represented in the main README and project template. Do not overwrite `.claude/`, `CLAUDE.md`, or `project.yaml` without a diff review.
- Preserve the current main branch and the existing save format, mobile UX, build, and tests.

## Tool installation (run locally in the project root)
```sh
# Inspect before installing to avoid duplicate/overlapping agent instructions.
npx skills add gamedev-skills/awesome-gamedev-agent-skills -a claude-code --list
npx skills add achimala/dream-loop -a claude-code --list
npx skills add maximilianfeix/plinkfx -a claude-code --list

# Install only selected agent skills after reviewing the list.
npx skills add gamedev-skills/awesome-gamedev-agent-skills -a claude-code
npx skills add achimala/dream-loop -a claude-code
npx skills add maximilianfeix/plinkfx -a claude-code

# Optional workflow plugin: inspect overlap with the existing Game Studios template first.
claude plugin marketplace add dudwns0921/claude-gamedev-kit
claude plugin install gamedev-kit@claude-gamedev-kit --scope project

# Optional visual effects skill.
claude plugin marketplace add patch-gg/pixelfx
claude plugin install pixelfx@pixelfx
```

Game Studios is a project template, not a drop-in dependency. For a clean trial, clone https://github.com/Donchitos/Claude-Code-Game-Studios into a separate directory and compare its files with this project before selectively merging anything.

## Runtime effects (optional, separate commit)
```sh
npm install plinkfx
npm install github:patch-gg/pixelfx
```
Do not install either runtime package until a specific in-game effect has been selected. Test asset size, audio unlock on mobile browsers, transparency, and frame pacing. For pixel effects in a Godot/Android target, export spritesheets rather than adding the JS runtime.

## Acceptance checks
```sh
npm ci
npm run typecheck
npm test
npm run build
npm run e2e
```
Then verify mobile touch input, effects, audio mute behavior, save/load compatibility, and GitHub Pages deployment **in a real browser**. Keep automated test results distinct from actual browser/deployment verification.

## Integration decision
Start with the agent skill router and a single non-gameplay effects proof of concept on this branch. Review the two game-development workflow frameworks for overlapping commands/hooks before activating both. Never claim installation or deployment from a documentation-only commit.
