# External game-dev tools integration (2026-11-20)

## Safety and scope
- Integration branch: `chore/gamedev-tooling-install-20261120`; **do not deploy or merge to main before checks**.
- Physics TD runs a custom **TypeScript / Canvas2D / Web Audio** engine. The project already contains Claude Code Game Studios (`.claude/agents`, `.claude/skills`, `project.yaml`, `CLAUDE.md`). Do not overwrite it.
- No hook/permission/CI automation is modified; existing gameplay, save schema and package manifests remain unchanged.
- This branch installs **six skill entrypoint files**, representing four external skill sources. They are copied under isolated names and are *not* the full upstream packages; references/scripts mentioned by those skills are not bundled here and must be separately checked before execution.
- Full installer commands for tools that need an executable are below; commands are instructions only, **not executed** in the branch.

| Requested source | Reference main SHA | Status and integration approach |
|---|---|---|
| [awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills) | `c6ca6c41c839b68319ffc08430b99ab768debc32` | Installed router, game-feel and game-ui-ux SKILL.md entrypoints. Only 3 selected of 79+router; references are not copied. |
| [Claude-Code-Game-Studios](https://github.com/Donchitos/Claude-Code-Game-Studios) | `abc0de79d6ceb0b5d7aa693945849b3937afbe6a` | **Already present** in Physics TD; no destructive overlay. Existing project config states framework version 1.3.0. |
| [claude-gamedev-kit](https://github.com/dudwns0921/claude-gamedev-kit) | `86b5b6ddd33a542ef4ca1cc2de067feb82763cc2` | Not installed as an active plugin. Its CEO/cycle hooks and dashboard compete with CCGS. Isolated opt-in recommended, not automatic startup. |
| [dream-loop](https://github.com/achimala/dream-loop) | `9bddb901f7d071cfefdd21e264267c757177a9df` | Copied skill entrypoint only; Blender/image-generation prerequisites not provisioned. |
| [plinkfx](https://github.com/maximilianfeix/plinkfx) | `7e5f6a477037679a29df9c5141e9853b1267e7d8` | Copied skill entrypoint only; runtime package not installed. |
| [pixelfx](https://github.com/patch-gg/pixelfx) | `5294518ce7c72e48b6100a744596e0acf57f2826` | Copied skill entrypoint only; JS FX runtime/assets not installed. |

## Full installation on developer machine (optional, not executed)
Use Claude Code from the Physics TD project root; existing CCGS remains the only active studio orchestrator. Do **not** run CCGS setup over the existing project.

```bash
# selective game-dev engine skills for web, or use the copied entrypoints as a starting point
claude plugin marketplace add gamedev-skills/awesome-gamedev-agent-skills
claude plugin install router@awesome-gamedev-agent-skills
claude plugin install web-engines@awesome-gamedev-agent-skills

# Kit in isolated test project only, NOT alongside current CCGS hooks
# claude plugin marketplace add dudwns0921/claude-gamedev-kit
# claude plugin install gamedev-kit@claude-gamedev-kit --scope project

# SFX + VFX are optional dependencies; do not add to production package manifest until smoke tests
# npm i plinkfx
# npm i github:patch-gg/pixelfx
```

## Acceptance checks before activating
1. Inspect skill names and linked references. If missing, install the corresponding complete package rather than treating the SKILL.md alone as a full functional install.
2. `npm test`, `npm run typecheck`, `npm run build`, `npm run e2e` all pass without regression.
3. Verify CC Game Studios commands `/start`, `/project-stage-detect`, `/map-systems` are discoverable in a real Claude Code session.
4. Try plinkfx via user gesture only; enforce mute, reduced-motion preferences and audio gain limits. Compare download/CPU footprint.
5. For pixelfx: small pilot in V4 only, benchmark low-end mobile at 30 TPS; avoid shipping all 244 effects. Honor license and notices.
6. Confirm native mobile touch UI and previously deployed Pages unaffected; only then approve PR/merge and report deployment separately.
