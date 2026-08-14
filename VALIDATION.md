# Validation Report

Validated locally on 15 August 2026 with Node.js 22.17.0 and npm 10.9.2.

## v0.4.0 development branch (automatic pairing) — work in progress

| Check | Result |
|---|---|
| TypeScript `tsc --noEmit` | Passed |
| Vitest | 76 tests passed across 6 files (config, CLI, native host, extension assets, bridge, controller) |
| Production build (MCP server + Native Messaging Host + extension) | Passed |
| Firefox `web-ext lint --warnings-as-errors` | 0 errors, 0 notices, 0 warnings |
| `npm pack --dry-run` | Passed; includes `dist/server/index.js`, `dist/native-host/index.js`, README, LICENSE |
| Smoke test in a temporary HOME + config root | Passed; setup created `bridge.json` (mode 600), the launcher script (mode 700), and the host manifest (mode 600) with `allowed_extensions` = the signed Gecko ID; doctor all-passed; MCP server started from the config file; host served `bridge_config` over framed stdin/stdout; no token appeared in any output |
| v0.3.1 token migration | Passed; first setup migrated `.local/bridge-token.txt` into the temp config root |
| Token hygiene | Verified: setup/doctor/uninstall reports, MCP config, and errors never contain the token |
| Native host caller-ID check | Passed; host refuses `get_bridge_config` for an unexpected caller ID argument and serves it for the expected one |
| Live Firefox automatic pairing | Passed on 15 August 2026; loaded the development add-on, the options page showed “已自动获取（Native Messaging）” and a connected MCP server, and an MCP client discovered all 7 tools and listed the real focused-window tabs. Required a launcher script because macOS runs native apps with a restricted `PATH` |

The v0.4.0 WebSocket security boundaries are unchanged and covered by tests: loopback-only binding, `moz-extension://` origin check, timing-safe token authentication, rejection of unauthenticated connections, and request timeouts.

## v0.3.1 stable release (previously validated)

| Check | Result |
|---|---|
| TypeScript `tsc --noEmit` | Passed |
| Vitest | 19 tests passed across 2 files |
| Production build | Passed |
| Firefox `web-ext lint --warnings-as-errors` | 0 errors, 0 notices, 0 warnings |
| `npm audit` | 0 vulnerabilities in the project dependency tree |
| Production dependency audit | 0 vulnerabilities |
| Repository and installed Agent Skill `quick_validate.py` | Both passed |
| GitHub YAML parsing | All workflow and issue-form files passed |
| MCP Inspector `tools/list` | Passed; 7 tools discovered |
| `quickstart` | Passed; generated protected local config and preserved its token on rerun |
| Extension ZIP integrity | Passed for Tab Management Agent Bridge for Firefox |
| Mozilla-signed v0.3.1 XPI | Production AMO certificate chain present; version, branded name, and stable Gecko ID verified |
| Firefox in-place upgrade to v0.3.1 | Passed; the same add-on ID remained active and the installed XPI matched the downloaded signed artifact |
| MCP package install | Passed; the installed CLI exposed all 7 tools |
| Agent Skill ZIP | Passed `quick_validate.py` after clean extraction |
| AMO source-package rebuild | Passed; the archived v0.3.1 review source reproduced every unsigned business file in the signed XPI |
| Live Firefox v0.3.0 | Passed; opened an HTTPS tab, created a group, and independently verified the exact URL and group ID |

Discovered MCP tools:

1. `get_firefox_bridge_status`
2. `list_firefox_tabs`
3. `list_firefox_tab_groups`
4. `open_firefox_tab`
5. `create_firefox_tab_group`
6. `move_firefox_tab_to_group`
7. `ungroup_firefox_tab`

The Inspector schema for tab selectors contains three closed alternatives (`tabId`, URL, or title) with `additionalProperties: false`.

The live smoke test used the temporary extension only after explicit user confirmation. It opened the requested public URL, created the requested exact group title, and independently verified the final tab-to-group relationship. Session-specific tab, window, and group identifiers are intentionally omitted from this public report.

The first public GitHub Actions run passed on both Node.js 20 and 22. The workflow uses the same `npm run check` command validated locally and current Node 24-based major versions of GitHub's official checkout and setup-node actions.
