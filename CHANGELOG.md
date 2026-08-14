# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [0.4.0] - 2026-08-15

- Publish v0.4.0 as an AMO-signed XPI through the automatic unlisted-channel signing service (public listed review still pending).
- Remove the manual token copy-and-paste workflow: the extension now obtains its bridge configuration automatically from a local Native Messaging Host.
- Add a user-level bridge configuration directory shared by the MCP server, the CLI, and the Native Messaging Host (macOS/Linux/Windows paths, mode `0600` on POSIX, atomic writes).
- Add the `nativeMessaging` permission and automatic configuration retrieval, caching, and re-detection in the extension; the options page no longer asks for a token.
- Add a minimal Native Messaging Host with length-prefixed framing, message/version validation, caller-extension-ID verification, and registration-based authorization; `setup` registers a launcher script with an absolute Node.js path because macOS runs native apps in a restricted environment.
- Add `setup`, `doctor`, and `uninstall`/`unregister-host` (with `--purge`) CLI subcommands; the default entry still starts the MCP stdio server.
- Migrate the v0.3.1 `.local/bridge-token.txt` token on first setup and preserve tokens on rerun.
- Keep `FIREFOX_TABS_BRIDGE_TOKEN` and `FIREFOX_TABS_BRIDGE_PORT` as explicit development/compatibility overrides and generate token-free MCP client configuration.
- Keep the WebSocket authentication, loopback-only binding, exact matching, pinned-tab protection, and post-write verification unchanged.

## [0.3.1] - 2026-08-15

- Prepare public repository documentation, automation, and AMO review materials.
- Rename the umbrella project to Agent Bridge for Tab Management in Firefox and the add-on to Tab Management Agent Bridge for Firefox.
- Present the MCP server, Firefox extension, and Agent Skill as three explicit top-level components.
- Add a pre-AMO quick-start flow that builds locally and generates protected MCP configuration helpers.
- Add a focused reading-queue workflow for collecting webpages into a dedicated Firefox tab group through an Agent.
- Preserve the production Gecko ID so v0.3.1 upgrades the Mozilla-signed v0.3.0 installation in place.

## [0.3.0] - 2026-08-15

- Pass Mozilla review and receive a production-signed XPI under the stable Gecko ID `firefox-tabs-mcp@local.invalid`.
- Add the `open_firefox_tab` tool.
- Add exact creation, movement, and removal operations for Firefox tab groups.
- Add authenticated loopback communication between the MCP server and extension.
- Add post-write verification and explicit error handling for ambiguous, pinned, grouped, and cross-window tabs.
- Add an extension options page for the bridge port, token generation, reconnection, and status inspection.
