#!/bin/sh
set -e

# Upgrade Agent Bridge for Tab Management in Firefox from source.
# Usage: bash scripts/upgrade.sh
# Steps: pull latest code, rebuild, restart the Hermes MCP server (if Hermes
# is present), open the newest signed XPI in Firefox, and run doctor.
# The Firefox installation prompt is the only manual step (browser security).

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

if command -v hermes >/dev/null 2>&1; then
  echo "[5/6] Restarting the Hermes MCP server so the new build becomes the broker..."
  hermes gateway restart
else
  echo "[5/6] Hermes not found on PATH; restart your MCP clients manually."
fi

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

echo ""
echo "Done. After you confirm the Firefox install, verify with:"
echo "  npm run doctor"
