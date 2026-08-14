#!/bin/sh
set -e

# Upgrade Agent Bridge for Tab Management in Firefox from source.
# Usage: bash scripts/upgrade.sh
# Steps: pull latest code, rebuild, restart clients we can (Hermes), open
# the newest signed XPI in Firefox, and run doctor. The Firefox install
# prompt and restarting non-Hermes clients are the manual parts.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "[1/6] Pulling latest code..."
git fetch origin
git pull --ff-only origin main

echo "[2/6] Installing locked dependencies..."
npm ci

echo "[3/6] Building server, native host, and extension..."
npm run build

VERSION="$(node -p "require('./package.json').version")"
echo "[4/6] Version: ${VERSION}"

echo "[5/6] Restarting MCP clients..."
RESTARTED=""
if command -v hermes >/dev/null 2>&1; then
  hermes gateway restart || true
  RESTARTED="Hermes"
fi
if [ -n "$RESTARTED" ]; then
  echo "      Restarted: ${RESTARTED} (becomes the shared broker with the new build)."
else
  echo "      No Hermes CLI found; no client restarted automatically."
fi
echo "      Other connected MCP clients:"
echo "        - OpenClaw:   run 'openclaw mcp reload' (or restart its gateway)"
echo "        - Claude Code / Codex / opencode / WorkBuddy: restart the client"
echo "          or its session so it spawns the new server build."
echo "      Their configs do not change."

XPI="packages/tab_management_agent_bridge_for_firefox-${VERSION}.xpi"
if [ ! -f "$XPI" ]; then
  echo "      Downloading the AMO-signed XPI for v${VERSION} from the latest GitHub release..."
  if command -v gh >/dev/null 2>&1; then
    gh release download --pattern "tab_management_agent_bridge_for_firefox-*.xpi" --dir packages --clobber
  else
    curl -fsSL "https://api.github.com/repos/Johnnyzlee/agent-bridge-for-tab-management-in-firefox/releases/latest" \
      | python3 -c "import json,sys; d=json.load(sys.stdin); print(next(a['browser_download_url'] for a in d['assets'] if a['name'].endswith('.xpi')))" \
      | xargs curl -fL -o "$XPI"
  fi
fi

echo "[6/6] Opening the signed XPI in Firefox. Confirm the installation prompt."
open -a Firefox "$XPI"

echo "[7/7] Syncing the Agent Skill to hosts where it is already installed..."
SKILL_SRC="skills/firefox-tab-manager"
SYNCED=""
# Official default paths. Environment-variable overrides are honored where
# the products define them; hosts installed elsewhere are simply not found
# here and can be copied manually (see README).
for dir in \
  "${HERMES_HOME:-${HOME}/.hermes}/skills" \
  "${CODEX_HOME:-${HOME}/.codex}/skills" \
  "${CLAUDE_CONFIG_DIR:-${HOME}/.claude}/skills" \
  "${OPENCODE_CONFIG_DIR:-${HOME}/.config/opencode}/skills" \
  "${OPENCLAW_HOME:-${HOME}/.openclaw}/skills"; do
  if [ -d "${dir}/firefox-tab-manager" ]; then
    rm -rf "${dir}/firefox-tab-manager"
    cp -R "$SKILL_SRC" "${dir}/"
    echo "      Updated: ${dir}/firefox-tab-manager"
    SYNCED=1
  fi
done
if [ -z "$SYNCED" ]; then
  echo "      No existing skill install found in the default locations;"
  echo "      skip or copy skills/firefox-tab-manager manually."
else
  echo "      Note: skills load at session start — restart the agent's session to pick up the update."
fi

echo ""
echo "Done. After you confirm the Firefox install and refresh your clients,"
echo "verify with: npm run doctor"
