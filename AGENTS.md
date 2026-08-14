# AGENTS.md

Project conventions and workflows for agents working in this repository. Read this before any task; follow it unless the user explicitly says otherwise.

## What this is

Agent Bridge for Tab Management in Firefox — a local-first toolkit letting AI agents manage the user's live Firefox tabs and native tab groups. Three cooperating components: Firefox WebExtension (`extension/`), MCP server (`mcp-server/`, incl. shared broker), and Native Messaging Host (`native-host/`). TS + Node 20+, MPL-2.0. Latest release: v0.5.7 (25 MCP tools). Extension Gecko ID: `firefox-tabs-mcp@local.invalid` — never change it.

## Commands

```bash
npm run check        # REQUIRED before every commit: typecheck + vitest + build + web-ext lint
npm run build        # rebuild dist/ (server, native host, extension)
npm run setup        # local pairing (config + Native Host registration)
npm run doctor       # health check (config, permissions, host registration)
npm test             # vitest only
npm pack --dry-run   # verify the npm package contents
```

## Development workflow

1. Branch from `main` (e.g. `feat/v0.5.8-...`); never commit to `main` directly.
2. Implement, add tests for every behavior change, run `npm run check` until green.
3. Update docs in the same commit: README.md + README.zh-CN.md (both, always), CHANGELOG.md, docs/architecture.md when the MCP surface changes, VALIDATION.md, docs/release-checklist.md.
4. If the Agent Skill changed, keep `skills/firefox-tab-manager/SKILL.md` in sync (it follows the Agent Skills format).
5. Merge to `main` with `--no-ff` and push. Never push the feature branch's release commits without merging.

## Versioning and release workflow

- Bump the version in ALL of: `package.json`, `package-lock.json`, `extension/manifest.json`, `mcp-server/mcp.ts`, `cli/commands.ts` (APP_VERSION), `tests/extension.test.ts`, and the XPI filename in both READMEs.
- CI auto-releases on `git tag vX.Y.Z` (`.github/workflows/release.yml`): version guard → check → packaging → AMO unlisted signing → GitHub Release. The AMO API credentials live in GitHub Secrets; do NOT ask for or print them.
- The ONLY manual step the user performs is the AMO signing when requested, or the Firefox install confirmation prompt.
- When the user runs `web-ext sign` themselves, they paste a command I prepare; never ask for their API key/secret in chat.

## Hard rules and history

- The token is automatically managed; it must NEVER appear in code, logs, docs, MCP configs, or commits.
- AMO locks version numbers that were uploaded then deleted — a 409 means bump to the next version. Always `npm run build` and confirm `dist/firefox-extension/manifest.json` matches before asking the user to sign.
- Firefox silently ignores programmatic `tabs.update({muted})` without a user gesture — the mute tool was removed for this reason; do not re-add it. Do report `audible` state instead.
- Extension code changes (e.g. background.ts) require re-signing; server-only changes do not. Version must still bump if the XPI is re-signed.
- Real-browser testing has caught bugs unit tests missed (selector dispatch, mute). After signing, verify new tools against the live Firefox session when feasible, then record results in VALIDATION.md.
- Do not remove authentication, open unauthenticated endpoints, or add remote services to work around limitations — report the limitation and options instead.

## Testing notes

- Tests never touch the real user config: use temp dirs and `FIREFOX_TABS_BRIDGE_CONFIG_DIR` overrides.
- Broker tests cover multi-agent routing, event-driven waits, disconnect isolation.
- Controller tests cover every tool's validation, no-op, rollback, and verification paths.

## Documentation style

- README is user-facing and product-oriented: what it does, use cases first, install, per-client configs (Claude Code, Codex, Hermes, OpenClaw, OpenCode, WorkBuddy), upgrade via `scripts/upgrade.sh`.
- The bridge complements (does not overlap with) the official Firefox DevTools MCP — README states this.
- Keep VALIDATION.md slim: current cycle + baseline guarantees; history lives in release notes.
