# AMO Listing Draft

Working copy for the AMO listing of Tab Management Agent Bridge for Firefox. Keep this in sync with the current toolset whenever tools change.

## Name

Tab Management Agent Bridge for Firefox

## Summary

Let trusted local AI agents inspect, open, and organize Firefox tabs and native tab groups.

## Description

Tab Management Agent Bridge for Firefox is the browser extension in Agent Bridge for Tab Management in Firefox. Together with its local MCP server it lets a trusted AI agent manage the user's live Firefox session: list tabs, groups, and windows; open explicit HTTP(S) pages; pin, duplicate, restore, close, and move tabs; and create, merge, rename, recolor, collapse, and close native tab groups — including across windows. An event-driven wait tool answers as soon as a page finishes loading.

The bridge uses Firefox's own WebExtension APIs with exact identifiers and matching rules. It protects pinned tabs, rejects ambiguous matches, and verifies browser state after every change. It does not inject scripts into pages or read page bodies.

A separately installed local MCP server is required; the extension and server authenticate over a loopback-only WebSocket connection. Setup instructions and source code are available from the project homepage.

## Permissions rationale

- `tabs`, `tabGroups` — the tab and group operations above.
- `storage` — caches the automatically provisioned bridge configuration for reconnection.
- `nativeMessaging` — fetches the bridge configuration from the user's local Native Messaging Host.
- `sessions` — used only by the restore tool (undo a closed tab or window).
- `*://127.0.0.1/*` — loopback WebSocket connection to the local MCP server.

## Proposed metadata

- Homepage: `https://github.com/Johnnyzlee/agent-bridge-for-tab-management-in-firefox`
- Support: `https://github.com/Johnnyzlee/agent-bridge-for-tab-management-in-firefox/issues`
- License: Mozilla Public License 2.0
- Privacy policy: `https://github.com/Johnnyzlee/agent-bridge-for-tab-management-in-firefox/blob/main/PRIVACY.md`
- Distribution: Listed on addons.mozilla.org

## Assets still required

- [ ] Final icon and required icon sizes in the manifest.
- [ ] Clean options-page and tab-group screenshots.
