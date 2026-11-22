#!/usr/bin/env bash
# Optional developer-tool installer. Run locally from the repository root.
# This script intentionally does not modify the existing Claude Game Studios files.
set -euo pipefail

if [[ ! -f package.json || ! -f CLAUDE.md ]]; then
  echo "Run from the physics_td repository root." >&2
  exit 1
fi
if ! command -v npm >/dev/null || ! command -v npx >/dev/null; then
  echo "Node.js/npm are required." >&2
  exit 1
fi

echo "Installing browser effect libraries (package-lock.json will be updated)..."
npm install --save-exact plinkfx@0.3.0 github:patch-gg/pixelfx#main

echo "Game Studios is already installed; leaving .claude/ unchanged."
echo "Optional agent skills (run separately after reviewing prompts and conflicts):"
echo "  npx skills add gamedev-skills/awesome-gamedev-agent-skills"
echo "  npx skills add achimala/dream-loop"
echo "Optional Claude plugin (requires Claude Code CLI):"
echo "  claude plugin marketplace add dudwns0921/claude-gamedev-kit"
echo "  claude plugin install gamedev-kit@claude-gamedev-kit --scope project"

echo "Checking current game without activating new effects..."
npm test
npm run typecheck
npm run build
echo "Run npm run e2e in an environment with its browser dependencies installed."
echo "Installation complete locally; review lockfile, licenses and bundle size before committing."
