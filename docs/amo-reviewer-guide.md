# AMO Reviewer Guide

Version 0.3.0 passed Mozilla review and was signed by the AMO production signing service. The signed artifact retains the pre-rebrand display name `Local Tab Groups MCP Bridge` and the permanent Gecko ID `firefox-tabs-mcp@local.invalid`. Future updates must keep that ID even when the display name changes.

## Source and build environment

- Source repository: `https://github.com/Johnnyzlee/agent-bridge-for-tab-management-in-firefox`
- Release: `0.3.0`
- Operating system: any platform supported by Node.js and Firefox
- Node.js: 20 or newer
- Package manager: npm using the committed `package-lock.json`

For an exact rebuild of the signed v0.3.0 artifact, use the release attachment `local_tab_groups_mcp_bridge-0.3.0-amo-source.zip`. No generated JavaScript is included in that source package. Install the locked dependencies and build from its root:

```bash
npm ci
npm run build
```

The reviewable extension is generated in `dist/firefox-extension/`. In the v0.3.0 review source, `src/extension/background.ts` is bundled by `esbuild`; `extension/manifest.json`, `options.html`, `options.css`, and `options.js` are copied without transformation. Source maps are included. The current default branch uses clearer top-level component directories but preserves the same operation set.

To run the full local verification, including Firefox's linter:

```bash
npm run check
```

## Functional review

The add-on is the browser component of Agent Bridge for Tab Management in Firefox. It does not require an account or a remote service. To exercise it:

1. Build the project and load `dist/firefox-extension/manifest.json` as a temporary add-on.
2. Choose a local test token of at least 16 characters and leave the extension port at `8765`.
3. Configure a local stdio-compatible MCP client to launch the server with the same values. For clients using the common `mcpServers` JSON shape:

   ```json
   {
     "mcpServers": {
       "firefox-tabs": {
         "command": "node",
         "args": ["/absolute/path/to/dist/server/index.js"],
         "env": {
           "FIREFOX_TABS_BRIDGE_PORT": "8765",
           "FIREFOX_TABS_BRIDGE_TOKEN": "review-only-token-change-me"
         }
       }
     }
   }
   ```

4. Start or restart the MCP client, then save the matching values in the extension options so the extension reconnects.
5. Call the status and list tools, then optionally open an HTTP(S) URL and create, move, or remove a tab group.

The server must remain running for the extension to show a connected state. Version 0.3.0 permits only one server instance on the configured port.

## Data behavior

The extension reads the URL, title, tab/window/group identifiers, active state, and pinned state of currently open tabs only when required by an MCP call. It sends those values solely over an authenticated `127.0.0.1` WebSocket to the user's local MCP server. There is no analytics, advertising, remote project backend, page-content access, or arbitrary script injection. See [PRIVACY.md](../PRIVACY.md).
