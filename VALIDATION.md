# Validation Report

Validated locally on 15 August 2026 with Node.js 22.17.0 and npm 10.9.2.

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
