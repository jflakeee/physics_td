# Game development tool integration

Target: `jflakeee/physics_td` (Android-first physics tower defense)

## Upstream tools (not yet installed)
- https://github.com/gamedev-skills/awesome-gamedev-agent-skills — catalog; select individual skills rather than copying everything
- https://github.com/Donchitos/Claude-Code-Game-Studios — Claude Code workflow
- https://github.com/dudwns0921/claude-gamedev-kit — Claude game-development kit
- https://github.com/achimala/dream-loop — development iteration workflow
- https://github.com/maximilianfeix/plinkfx — visual effects
- https://github.com/patch-gg/pixelfx — pixel effects

## Safe integration checklist
1. Review upstream LICENSE, README, install commands, dependencies and supported runtime versions.
2. Separate developer-only Claude Code tooling from shipped game/runtime assets.
3. Install only applicable skills and effects; pin reviewed upstream commits or releases.
4. Keep existing game save format and Android build behavior unchanged.
5. Run existing tests and Android build; visually verify effects on device.
6. Record commands, exact revisions, licenses, and test evidence before merging.

This file records the requested integration scope. It does not claim that external tools have been installed, tested or deployed.
