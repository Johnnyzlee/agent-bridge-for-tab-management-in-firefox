# Security Policy

## Supported versions

Security fixes are currently provided for the latest `0.3.x` release and the default branch. Earlier development builds are unsupported.

## Reporting a vulnerability

After the public repository is created, report vulnerabilities through GitHub's private vulnerability-reporting or Security Advisory interface for `Johnnyzlee/agent-bridge-for-tab-management-in-firefox`. Do not publish tokens, browser data, proof-of-concept exploits, or unpatched vulnerability details in a public issue.

Until private reporting is enabled, keep the report private and wait for a repository security contact to be published. There is currently no guaranteed response-time service level, but reports will be acknowledged and triaged as maintainership permits.

## Security design

- The WebSocket server binds only to `127.0.0.1` and rejects non-`moz-extension://` origins.
- The first WebSocket frame must authenticate with a shared token of at least 16 characters.
- The extension requests only `tabs`, `tabGroups`, `storage`, and loopback host access. It has no content scripts and cannot inspect page bodies.
- The manifest declares `browsingActivity` because requested tab URLs, titles, and group metadata cross from Firefox into the local MCP process.
- The MCP server exposes a fixed tool set. It cannot execute arbitrary page JavaScript.
- HTTP(S)-only URL validation, exact matching, pinned-tab protection, same-window checks, and post-write verification are deliberate safety boundaries.

## Trust boundaries and known limitations

The token protects the Firefox extension from unauthenticated local WebSocket clients; it does not sandbox or authenticate the MCP client itself. Any client configured with the token can request the exposed operations and receive the returned tab metadata. Only configure trusted local MCP clients, and review their own data-handling policies.

Version 0.3.1 supports one stdio MCP server instance on one fixed bridge port. Competing instances fail to bind rather than sharing the connection. The bridge is not intended to be exposed through port forwarding, containers with public port mappings, or non-loopback proxies.

## Credential handling

Treat the bridge token as a local secret. Do not commit it, paste it into logs or issues, or reuse it for another service. Generate a new token if it may have been disclosed, and update both Firefox and the MCP client configuration.
