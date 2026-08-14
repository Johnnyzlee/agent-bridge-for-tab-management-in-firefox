# AMO Listing Draft

This is working copy for a future public AMO listing. Screenshots, icons, final support contact, and signed-package identifiers still require maintainer approval.

## Name

Tab Management Agent Bridge for Firefox

## Summary

Connect trusted local AI agents to native Firefox tab and tab-group controls.

## Description

Tab Management Agent Bridge for Firefox is the browser extension in Agent Bridge for Tab Management in Firefox. Together with its local MCP server, it lets a trusted AI agent inspect open tabs, open explicit HTTP(S) pages, and precisely create, move, or remove native tab groups. An optional Agent Skill teaches compatible agents the guarded workflow.

The bridge uses Firefox's own WebExtension APIs. It uses exact identifiers and matching rules, protects pinned tabs, rejects cross-window grouping, and verifies browser state after every change. It does not inject scripts into pages or read page bodies.

A separately installed local MCP server is required. The extension and server authenticate over a loopback-only WebSocket connection. Setup instructions and source code are available from the project homepage.

## Proposed metadata

- Homepage: `https://github.com/Johnnyzlee/agent-bridge-for-tab-management-in-firefox`
- Support: `https://github.com/Johnnyzlee/agent-bridge-for-tab-management-in-firefox/issues`
- License: Mozilla Public License 2.0
- Privacy policy: `https://github.com/Johnnyzlee/agent-bridge-for-tab-management-in-firefox/blob/main/PRIVACY.md`
- Distribution: Listed on addons.mozilla.org

## Assets still required

- Final extension icon in the manifest and AMO-compatible sizes.
- At least one screenshot of the options page and one screenshot showing a grouped tab result.
- Final support contact and repository security-reporting configuration.
- A final check of the AMO name, summary, categories, and data-consent declaration immediately before submission.
