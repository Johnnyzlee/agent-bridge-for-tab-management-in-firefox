# Architecture and Trust Boundaries

## Components

1. An AI agent, optionally guided by the Firefox Tab Manager Skill, starts Firefox Tab Management Agent MCP as a local stdio server.
2. The MCP server reads the user-level bridge configuration (port, protocol version, token) and opens an authenticated WebSocket listener on `127.0.0.1`. `FIREFOX_TABS_BRIDGE_TOKEN` and `FIREFOX_TABS_BRIDGE_PORT` remain supported as explicit development/compatibility overrides.
3. Tab Management Agent Bridge for Firefox requests its bridge configuration from the Native Messaging Host through Firefox's Native Messaging channel. Firefox only launches the host for extensions listed in the host manifest's `allowed_extensions`; the host additionally refuses to serve the configuration when its own registration does not authorize exactly `firefox-tabs-mcp@local.invalid`.
4. The extension caches the received configuration in `browser.storage.local` (falling back to it when the host is temporarily unavailable), connects to the configured port, and authenticates with the shared token.
5. The extension performs a small fixed set of operations through Firefox's `tabs` and `tabGroups` APIs.
6. Write operations read the resulting browser state before reporting success.

```mermaid
flowchart LR
    A["AI agent + optional Skill"] -->|"stdio"| B["Firefox Tab Management Agent MCP"]
    B <-->|"127.0.0.1 WebSocket\nshared token"| C["Tab Management Agent Bridge for Firefox"]
    C <-->|"Firefox Native Messaging\n(length-prefixed JSON)"| E["Native Messaging Host"]
    C <-->|"tabs + tabGroups APIs"| D["Firefox"]
    B <-->|"reads\nbridge.json"| F["User-level bridge config"]
    E <-->|"reads\nbridge.json"| F
```

## User-level bridge configuration

A single shared module (`shared/config.ts`) owns all configuration path logic. The directory depends on the platform:

- macOS: `~/Library/Application Support/Agent Bridge for Tab Management in Firefox/`
- Linux: `$XDG_CONFIG_HOME/agent-bridge-for-firefox/` or `~/.config/agent-bridge-for-firefox/`
- Windows: `%APPDATA%\Agent Bridge for Tab Management in Firefox\`

`bridge.json` stores the protocol version, the WebSocket port, and the token. It is written atomically with mode `0600` on macOS/Linux. `FIREFOX_TABS_BRIDGE_CONFIG_DIR` overrides the root for development and tests.

The extension does not read this file directly; it receives the same values from the Native Messaging Host, which keeps the browser and the MCP server in sync without user involvement.

## Native Messaging Host

The host (`native-host/`) is a minimal length-prefixed JSON message loop. Firefox specifies the 4-byte length prefix in native byte order; all supported platforms are little-endian. Messages are capped at 1 MiB. The host accepts `ping`/`get_status` and `get_bridge_config`, validates the message type and protocol version, and replies with typed `status`, `bridge_config`, or `error` messages. `get_bridge_config` is served only when the host's own registered manifest authorizes exactly the expected extension ID. Error messages never include the token.

The host manifest is registered per platform: `~/Library/Application Support/Mozilla/NativeMessagingHosts/` on macOS, `~/.mozilla/native-messaging-hosts/` on Linux, and the user-level `HKCU\Software\Mozilla\NativeMessagingHosts` registry key (with a `.cmd` launcher) on Windows. The Windows path logic is implemented and unit-tested but has not been exercised on a real Windows machine.

## Protocol

The first extension frame over the WebSocket is an authentication message. Later frames are typed request/response messages with request identifiers. Requests have a timeout, and malformed, unauthenticated, or unsupported messages are rejected. Connections that never authenticate are closed.

The MCP surface intentionally contains only these operations: bridge status, list tabs, list groups, open an HTTP(S) tab, create a group, move a tab to a group, and ungroup a tab.

## Write safety

Selectors use a tab ID, exact URL, or exact title. Ambiguous matches are returned as errors instead of being guessed. Group names are exact within one window. Grouping across windows is rejected. Pinned tabs require explicit opt-in because Firefox may unpin them during grouping. Every successful write is followed by a state read and invariant check.

## Data boundary

Open-tab metadata crosses from Firefox into the local MCP process and then to the invoking MCP client. It is not sent to a project-operated service. See [the privacy policy](../PRIVACY.md) for the complete disclosure.

## Current limitations

Version 0.4.0 retains the server-per-client architecture and one configurable bridge port: only one MCP client can own that port at a time, and competing instances fail to bind rather than sharing the connection. A future shared broker/daemon could multiplex multiple authenticated MCP clients while keeping the Firefox connection local. The bridge is not intended to be exposed through port forwarding, containers with public port mappings, or non-loopback proxies.
