# Claude Code Game Studios v1.3.0 upgrade

- Source: https://github.com/Donchitos/Claude-Code-Game-Studios/releases/tag/v1.3.0
- Target: Physics TD (existing v1.2.0 -> v1.3.0)
- Applied: .claude/scripts, hooks, genres, engines, skills, shared document templates, settings hooks/allow-list, project.yaml version and Web engine.
- Preserved: Physics TD game source, tests, pages workflows, existing design documents, CLAUDE.md, .claude/agents, custom docs, local configuration and permission denials.
- Old skill aliases remain to avoid breaking existing usage. No hard delete was used.
- This repository change installs the project files; the Claude Code CLI must separately be installed and run on the user's computer.
- Verification: check GitHub Actions, run /project-stage-detect and /start from repository root in Claude Code.
