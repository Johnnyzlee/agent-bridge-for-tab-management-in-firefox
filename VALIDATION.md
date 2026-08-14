# Validation Report

Validated locally on 15 August 2026 with Node.js 22.17.0 and npm 10.9.2. Historical validation records for earlier releases are archived in the release notes; this file tracks the current development cycle.

## v0.5.7 development (audible reporting) — work in progress

| Check | Result |
|---|---|
| TypeScript `tsc --noEmit` | Passed |
| Vitest | 127 tests across 6 files (includes audible-state reporting) |
| Production build + web-ext lint | Passed |
| Live Firefox | To be re-run after signing |

## v0.5.6 (released)

| Check | Result |
|---|---|
| Real Firefox regression re-test | Passed — `pin`/`unpin`/`duplicate` fixed (previously `INVALID_SELECTOR`); event-driven `wait_for_firefox_tab`, `get_active_firefox_tab`, `list_firefox_windows`, open/close/restore all verified live |
| Vitest | 128 tests across 6 files |
| `npm pack --dry-run` | Passed; includes `dist/server/index.js`, `dist/native-host/index.js`, README, LICENSE |

## Baseline guarantees (unchanged since v0.4.0)

- WebSocket bridge binds only to loopback; `moz-extension://` origin check on the extension port; timing-safe token authentication on both ports; no token-less fallback; the token never appears in logs, errors, docs, or client configs.
- URL restriction (HTTP(S) only), exact matching, ambiguity rejection, pinned-tab protection, same-window checks, and post-write verification are covered by tests.
- `npm run check` gates every release: `tsc --noEmit`, Vitest, production build, `web-ext lint --warnings-as-errors`, and `npm audit` in CI (Node 20 and 22).
