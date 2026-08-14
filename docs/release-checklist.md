# Release Checklist

## Current: v0.5.7 (audible reporting)

- [x] Add `audible` to tab data (`list_firefox_tabs`, `get_active_firefox_tab`) so agents can find what is playing.
- [ ] Submit v0.5.7 as an AMO unlisted version and verify the signed XPI.
- [ ] Live-verify `audible` reporting in Firefox.

## Released versions

- [x] v0.5.6 — fix pin/unpin/duplicate dispatch (live-tested).
- [x] v0.5.5 — 26-tool set: pin, duplicate, color, batch open/move, active tab, event-driven wait.
- [x] v0.5.4 — `list_firefox_windows`, `new_firefox_window`, `scripts/upgrade.sh`.
- [x] v0.5.3 — skipped on AMO (version locked); features shipped in v0.5.4.
- [x] v0.5.2 — close tabs/group, atomic merge, cross-window moves, rename, collapse.
- [x] v0.5.1 — `move_firefox_tab` (reposition).
- [x] v0.5.0 — shared broker for multiple agents.
- [x] v0.4.1 — English options page.
- [x] v0.4.0 — automatic pairing via Native Messaging.
- [x] v0.3.1 — Mozilla-reviewed public release (archived).

## Future distribution improvements

- [ ] Decide whether to publish the server as an npm CLI package for one-command MCP installation.
- [ ] Add an automated tagged-release workflow after a manual release cycle is proven.
- [ ] Confirm the Windows registration flow on a real Windows machine (implemented and unit-tested, not hardware-verified).
