# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [0.5.7] - 2026-08-15

- Report the `audible` state of every tab (`list_firefox_tabs`, `get_active_firefox_tab`) so agents can find which tabs are playing audio.
- Rebuild and re-sign the extension as v0.5.7 through the AMO unlisted channel.

## [0.5.6] - 2026-08-15

- Fix selector dispatch for `pin_firefox_tab`, `unpin_firefox_tab`, and `duplicate_firefox_tab` (the background script now unwraps `selector` before calling the controller; without this fix the tools returned `INVALID_SELECTOR`).
- Map ignored programmatic mute changes to a dedicated `MUTE_REQUIRES_USER_GESTURE` error (Firefox silently ignores mute without a user gesture).
- Rebuild and re-sign the extension as v0.5.6 through the AMO unlisted channel.

## [0.5.5] - 2026-08-15

- Add `pin_firefox_tab` / `unpin_firefox_tab` (verified pinned state) and `duplicate_firefox_tab` (verified duplicate).
- Add `set_firefox_tab_group_color` (validated color set) and `move_firefox_tab_to_window` (bare cross-window move, optional index).
- Add `open_firefox_tabs_into_group`: atomic batch open-and-group (creates the group only if missing) with rollback of opened tabs on failure.
- Add `move_firefox_tabs_to_group`: batch move into one exact group with one overall verification (cross-window with explicit windowId).
- Add `restore_firefox_tab` (sessions.restore with `sessions` permission).
- Add `get_active_firefox_tab` and event-driven `wait_for_firefox_tab` (the extension pushes `tabs.onUpdated` completions to the broker; waiting agents are answered instantly when the event arrives).
- Rebuild and re-sign the extension as v0.5.5 through the AMO unlisted channel.

## [0.5.4] - 2026-08-15

- Add `list_firefox_windows`: per-window tab and group counts with each group's title, collapsed state, and size — the target-picker for cross-window moves.
- Add `new_firefox_window`: create a background Firefox window (optionally with an explicit http(s) URL) and verify the returned window ID and first tab.
- Rebuild and re-sign the extension as v0.5.3 through the AMO unlisted channel.

## [0.5.2] - 2026-08-15

- Add `close_firefox_tabs` (batch close by tabId with existence checks and verification) and `close_firefox_tab_group` (close a whole exact group and remove the empty group).
- Add `merge_firefox_tab_groups`: atomically move every tab of one exact group into another (including across windows), remove the empty source group, and verify every tab.
- Extend `move_firefox_tab_to_group` with an explicit `windowId` to move a tab into a group in another window via `tabs.moveToWindow`; cross-window moves still require the explicit target.
- Add `rename_firefox_tab_group` (exact rename, duplicate-title rejection) and `set_firefox_tab_group_collapsed` (verified collapse/expand).
- Rebuild and re-sign the extension as v0.5.2 through the AMO unlisted channel.

## [0.5.1] - 2026-08-15

- Add the `move_firefox_tab` tool: move one exactly identified tab to a target position within its own window (0-based index or `-1` for the end), with index validation, out-of-range clamping, no-op detection, and post-move verification.
- Rebuild and re-sign the extension as v0.5.1 through the AMO unlisted channel.

## [0.5.0] - 2026-08-15

- Add a shared broker that multiplexes multiple MCP agents over the single Firefox connection: the first server instance becomes the broker on the extension port plus a new agent port (`127.0.0.1:8767`), and later instances connect as authenticated clients.
- Keep the extension and its manifest unchanged; `nativeMessaging`, WebSocket auth, and the loopback-only binding are untouched.
- Add the `FIREFOX_TABS_BRIDGE_BROKER_PORT` override (default `8767`) and a `doctor` broker-port check.
- Rebuild and re-sign the extension as v0.5.0 through the AMO unlisted channel.

## [0.4.1] - 2026-08-15

- Switch the extension options page UI from Chinese to English (status labels, buttons, and background error messages).
- Rebuild and re-sign the extension as v0.4.1 through the AMO unlisted channel.

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
