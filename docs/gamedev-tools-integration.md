# Game development tools — integration audit (2026-11-22)

Target: `jflakeee/physics_td`. Working branch: `chore/gamedev-tools-integration-20261122`. The main branch is untouched.

## Verified existing setup
- Claude Code Game Studios v1.2.0 is already present: `CLAUDE.md`, `.claude/settings.json`, `THIRD_PARTY_NOTICES.md`.
- Custom JavaScript/TypeScript Canvas2D web engine, not Godot or Unity.
- `package.json` scripts: `npm test`, `npm run build`, `npm run typecheck`, `npm run e2e`.
- GitHub Pages web demo exists. No Android build configuration was confirmed.

## Upstream source and license audit
| Tool | License verified | Installation indicated by upstream | Integration role |
|---|---|---|---|
| [awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills) | Apache-2.0 | `npx skills add gamedev-skills/awesome-gamedev-agent-skills` | Optional agent skills; avoid irrelevant engine specialists |
| [Claude-Code-Game-Studios](https://github.com/Donchitos/Claude-Code-Game-Studios) | MIT (existing project notice) | Already integrated, v1.2.0 | Keep current orchestrator; no duplicate install |
| [claude-gamedev-kit](https://github.com/dudwns0921/claude-gamedev-kit) | MIT | `claude plugin marketplace add dudwns0921/claude-gamedev-kit` then `claude plugin install gamedev-kit@claude-gamedev-kit --scope project` | Optional workflow; evaluate conflicts before enabling |
| [dream-loop](https://github.com/achimala/dream-loop) | MIT | `npx skills add achimala/dream-loop` | Optional screenshot/critic loop; requires image generation and vision |
| [plinkfx](https://github.com/maximilianfeix/plinkfx) | MIT (sound assets described as CC0) | `npm i plinkfx` | Web Audio game SFX; enable only after audio UX review |
| [pixelfx](https://github.com/patch-gg/pixelfx) | MIT | Review README usage and package before adding | Pixel visual effects; test visual fit and mobile performance |

## Proposed installation order (not executed)
1. Preserve `main` and existing Game Studios configuration; do not overwrite `.claude/` or `CLAUDE.md`.
2. Trial `plinkfx` and `pixelfx` separately, with no gameplay changes; verify licenses, bundle size, touch interaction, and performance.
3. Add only relevant agent skills; compare command names, hooks, permissions, and responsibilities with existing Game Studios.
4. Run `npm test`, `npm run typecheck`, `npm run build`, and `npm run e2e` in a suitable environment.
5. Review visual and audio output on mobile, then merge through a PR only after validation.

## Execution status
- **Verified:** upstream README and LICENSE files for five additional tools, plus current repository configuration.
- **Committed:** this audit document on the integration branch.
- **Not performed:** package installation, plugin activation, runtime integration, test execution, Android build, deployment.
- **Environment limitation:** the available execution container cannot resolve github.com, so upstream packages could not be downloaded for local testing.
