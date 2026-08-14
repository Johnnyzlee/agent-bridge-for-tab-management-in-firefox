# Privacy Policy

Effective date: 15 August 2026

Agent Bridge for Tab Management in Firefox combines a local Firefox extension, a Native Messaging Host, a Model Context Protocol (MCP) server, and an optional Agent Skill. This policy describes the data handled by the software distributed from the `Johnnyzlee/agent-bridge-for-tab-management-in-firefox` repository.

## Data the software processes

When an MCP client calls one of the provided tools, the extension may read and return the minimum browser state needed for that operation:

- tab identifiers, URLs, titles, active and pinned state;
- window identifiers;
- tab-group identifiers and titles; and
- connection status and operation results.

The extension caches the local bridge port and the automatically provisioned shared token in Firefox extension storage so it can reconnect when the Native Messaging Host is temporarily unavailable. The Native Messaging Host reads the same port and token from the user-level bridge configuration file and sends them to the extension over Firefox's Native Messaging channel. Neither the host nor the extension sends this configuration anywhere else.

The software does not read page bodies, form contents, browsing history outside the currently open tabs, cookies, passwords, or arbitrary page JavaScript.

## How data is used and transmitted

Tab and group data is used only to perform the MCP operation requested by the user and to verify its result. It is transmitted from the Firefox extension to the local MCP server over an authenticated WebSocket connection bound to `127.0.0.1`.

Bridge configuration data (port, protocol version, token) travels only between local processes: the extension, the Native Messaging Host, and the MCP server. It is never sent over the network.

This project does not operate a remote backend, collect analytics or telemetry, serve advertising, sell personal data, or transmit browser data to the project maintainers. The Native Messaging Host connects to no remote service.

The MCP client or AI agent that invokes the tools receives the tool results. That client may store or transmit those results according to its own configuration and privacy policy. Users should review the policy of their chosen MCP client and model provider. Opening an `http://` or `https://` URL also connects Firefox to that website in the ordinary way.

## Storage and retention

The extension retains a cached copy of the port and shared token until the user clears the extension's storage or uninstalls the extension. The user-level bridge configuration file (`bridge.json`, mode `0600` on macOS/Linux) retains the port, protocol version, and token until it is removed by `firefox-tab-management-agent-mcp uninstall --purge` or manually. The local MCP server does not persist tab or group data to disk. Browser metadata exists only in memory while requests are processed and while the local connection is active.

## User controls

Users can stop the MCP server, disable or uninstall the extension, clear extension storage, remove the Native Messaging Host registration (`firefox-tab-management-agent-mcp uninstall`), and delete the local configuration (`uninstall --purge`). The token is regenerated automatically by the next `setup`; no manual reconfiguration of either Firefox or the MCP client is needed because both sides read from the same local configuration.

## Security

The bridge listens only on loopback, requires a shared token, restricts WebSocket origins to Firefox extensions, restricts Native Messaging access to the signed extension ID, exposes a fixed operation set, and verifies browser state after write operations. See [SECURITY.md](SECURITY.md) for details and reporting instructions.

## Changes and contact

Material changes will be documented in this repository and reflected by updating the effective date above. General privacy questions may be opened in the repository's issue tracker. Security-sensitive reports must use the private reporting process described in [SECURITY.md](SECURITY.md).
