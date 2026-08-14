# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

- Prepare public repository documentation, automation, and AMO review materials.
- Rename the umbrella project to Agent Bridge for Tab Management in Firefox and the add-on to Tab Management Agent Bridge for Firefox.
- Present the MCP server, Firefox extension, and Agent Skill as three explicit top-level components.
- Add a pre-AMO quick-start flow that builds locally and generates protected MCP configuration helpers.

## [0.3.0] - 2026-08-15

- Pass Mozilla review and receive a production-signed XPI under the stable Gecko ID `firefox-tabs-mcp@local.invalid`.
- Add the `open_firefox_tab` tool.
- Add exact creation, movement, and removal operations for Firefox tab groups.
- Add authenticated loopback communication between the MCP server and extension.
- Add post-write verification and explicit error handling for ambiguous, pinned, grouped, and cross-window tabs.
- Add an extension options page for the bridge port, token generation, reconnection, and status inspection.
