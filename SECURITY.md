# Security Policy

## Supported versions

Security fixes are currently provided for the latest `0.5.x` release and the default branch. Earlier development builds are unsupported.

## Reporting a vulnerability

Report vulnerabilities through GitHub's private vulnerability-reporting or Security Advisory interface for `Johnnyzlee/agent-bridge-for-tab-management-in-firefox`. Do not publish tokens, browser data, proof-of-concept exploits, or unpatched vulnerability details in a public issue.

Keep the report private and wait for a repository security contact to be published. There is currently no guaranteed response-time service level, but reports will be acknowledged and triaged as maintainership permits.

## Security design

- The WebSocket server binds only to `127.0.0.1` and rejects non-`moz-extension://` origins.
- The first WebSocket frame must authenticate with a shared token of at least 16 characters, compared with a timing-safe comparison. There is no token-less compatibility mode and no automatic downgrade to unauthenticated connections.
- The token is generated with Node.js `crypto.randomBytes(32)` and never appears in console output, error messages, documentation examples, MCP client configuration, command-line arguments, or Git-tracked files. Configuration files are written with mode `0600` on macOS/Linux.
- The extension obtains the token from the user's own Native Messaging Host instead of the user. Firefox launches the host only for extensions in the host manifest's `allowed_extensions`, and the host refuses to serve the configuration unless its registration authorizes exactly `firefox-tabs-mcp@local.invalid` and the calling extension's ID (passed by Firefox as a command-line argument since Firefox 55) matches the expected ID.
- The extension requests only `tabs`, `tabGroups`, `storage`, `nativeMessaging`, and loopback host access. It has no content scripts and cannot inspect page bodies.
- The manifest declares `browsingActivity` because requested tab URLs, titles, and group metadata cross from Firefox into the local MCP process.
- The MCP server exposes a fixed tool set. It cannot execute arbitrary page JavaScript.
- HTTP(S)-only URL validation, exact matching, pinned-tab protection, same-window checks, and post-write verification are deliberate safety boundaries.

## Trust boundaries and known limitations

The token protects the Firefox extension from unauthenticated local WebSocket clients; it does not sandbox or authenticate the MCP client itself. Any client that can reach the loopback bridge with the token can request the exposed operations and receive the returned tab metadata. Only configure trusted local MCP clients, and review their own data-handling policies.

Firefox's Native Messaging authorization is enforced against the host manifest's `allowed_extensions`, and Firefox passes the calling extension's ID to the host as a command-line argument (since Firefox 55). The host independently verifies both the registered manifest and the caller ID before serving the configuration (defense in depth).

Version 0.4.0 supports one stdio MCP server instance on one configured bridge port. Competing instances fail to bind rather than sharing the connection. The bridge is not intended to be exposed through port forwarding, containers with public port mappings, or non-loopback proxies.

## Credential handling

Treat the bridge token as a local secret even though users never see it. Do not commit it, paste it into logs or issues, or reuse it for another service. Deleting the user-level configuration directory (for example with `firefox-tab-management-agent-mcp uninstall --purge`) generates a fresh token on the next `setup`. The environment-variable overrides (`FIREFOX_TABS_BRIDGE_TOKEN` / `FIREFOX_TABS_BRIDGE_PORT` / `FIREFOX_TABS_BRIDGE_BROKER_PORT`) remain supported for development and compatibility; if they are set, they take precedence over the configuration file and must be managed with the same care.
