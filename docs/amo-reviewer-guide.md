# AMO Reviewer Guide

This guide describes the review materials for the v0.4.0 development branch. It has **not** been submitted to AMO yet. The last Mozilla-reviewed and production-signed release is v0.3.1, which preserves the permanent Gecko ID `firefox-tabs-mcp@local.invalid`.

## Source and build environment

- Source repository: `https://github.com/Johnnyzlee/agent-bridge-for-tab-management-in-firefox`
- Release under review: `0.4.0` (development)
- Operating system: any platform supported by Node.js and Firefox
- Node.js: 20 or newer
- Package manager: npm using the committed `package-lock.json`

No generated JavaScript is included in the AMO source package. Install the locked dependencies and build from its root:

```bash
npm ci
npm run build
```

The reviewable extension is generated in `dist/firefox-extension/`. `extension/background.ts` is bundled by `esbuild`; `extension/manifest.json`, `options.html`, `options.css`, and `options.js` are copied without transformation. The Native Messaging Host sources live in `native-host/` and are bundled into `dist/native-host/index.js`; both are part of the repository for review. Source maps are included.

To run the full local verification, including Firefox's linter:

```bash
npm run check
```

## Permissions

The manifest requests `tabs`, `tabGroups`, `storage`, `nativeMessaging`, `sessions`, and loopback host access. `sessions` is used only by `restore_firefox_tab` (restoring a recently closed tab or window); the extension never reads browsing history beyond the sessions-restore call the user requested.

## New in v0.4.0: Native Messaging permission and automatic pairing

v0.4.0 removes the manual token entry from the options page and adds the `nativeMessaging` permission so the extension can fetch its bridge configuration from a local Native Messaging Host:

1. `npm run setup` creates a user-level `bridge.json` (port, protocol version, token) and registers the host manifest with `allowed_extensions: ["firefox-tabs-mcp@local.invalid"]`.
2. The extension sends `{ "type": "get_bridge_config", "protocolVersion": 1 }` over Native Messaging and validates the response type, protocol version, port, and token length before using it.
3. The host refuses to serve the configuration unless its own registration authorizes exactly the expected extension ID, and it never writes the token to logs.

The host is a minimal stdio process that reads length-prefixed JSON from stdin and writes one framed JSON response per request. It accepts only `ping`/`get_status` and `get_bridge_config`, rejects unknown message types and unsupported protocol versions, verifies both the registered manifest's `allowed_extensions` and the calling extension's ID (a command-line argument Firefox passes since Firefox 55), and does not connect to any remote service. The registered manifest `path` points to a generated launcher script (`firefox_tabs_agent_bridge.sh`/`.cmd`) that executes the absolute Node.js binary and the bundled host, because macOS runs native apps in a restricted environment where `node` is not on `PATH`.

## Functional review

The add-on is the browser component of Agent Bridge for Tab Management in Firefox. It does not require an account or a remote service. To exercise it:

1. Build the project and load `dist/firefox-extension/manifest.json` as a temporary add-on.
2. Run `node dist/server/index.js setup` (or `npm run setup`) to create the local configuration and register the Native Messaging Host for the current user. The token is generated automatically and never displayed.
3. Start the MCP server (`node dist/server/index.js`). It reads the port and token from the same configuration file.
4. Configure a local stdio-compatible MCP client to launch the server. No token or environment variables are needed:

   ```json
   {
     "mcpServers": {
       "firefox-tabs": {
         "command": "node",
         "args": ["/absolute/path/to/dist/server/index.js"]
       }
     }
   }
   ```

5. Confirm the extension options page shows an automatic configuration status and a connected MCP server state, then call the status and list tools, and optionally open an HTTP(S) URL and create, move, or remove a tab group.

For review convenience the v0.3.1 environment overrides `FIREFOX_TABS_BRIDGE_TOKEN` and `FIREFOX_TABS_BRIDGE_PORT` still work, and `FIREFOX_TABS_BRIDGE_CONFIG_DIR` can redirect the configuration root. The server must remain running for the extension to show a connected state. Version 0.4.0 permits only one server instance on the configured port.

## Native Messaging manifest

The registered manifest has the fixed host name `firefox_tabs_agent_bridge`, `type: stdio`, an absolute `path` to the built host, and `allowed_extensions` containing only `firefox-tabs-mcp@local.invalid`. Registration locations: macOS `~/Library/Application Support/Mozilla/NativeMessagingHosts/`, Linux `~/.mozilla/native-messaging-hosts/`, Windows `HKCU\Software\Mozilla\NativeMessagingHosts` (with a `.cmd` launcher).

## Data behavior

The extension reads the URL, title, tab/window/group identifiers, active state, and pinned state of currently open tabs only when required by an MCP call. It sends those values solely over an authenticated `127.0.0.1` WebSocket to the user's local MCP server. Bridge configuration travels only between the extension, the Native Messaging Host, and the local MCP server. There is no analytics, advertising, remote project backend, page-content access, or arbitrary script injection. See [PRIVACY.md](../PRIVACY.md).
