# Release Checklist

## Current: v0.5.9 (waiter race fix) — released, server-only

- [x] Same-tabId multi-waiter race fixed (all waiters answered; no timer leak).
- [x] Server-only; extension not re-signed.

## Released: v0.5.8 (close confirmation, broker hardening)

- [x] `confirmClose: true` required for `close_firefox_tabs` / `close_firefox_tab_group` (schema + controller).
- [x] Broker tab-completion cache capped at 500 with eviction; dead code removed; `tab-events.ts` extracted.
- [x] Tests (129).
- [ ] Submit v0.5.8 as an AMO unlisted version and verify the signed XPI.

## Released: v0.5.7 (audible reporting)

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

## Automated release workflow

Push a tag matching `package.json` (`git tag v0.5.8 && git push origin v0.5.8`) and `.github/workflows/release.yml` runs: version-mismatch guard → `npm run check` → packaging → AMO unlisted signing (secrets `AMO_JWT_ISSUER` / `AMO_JWT_SECRET`) → GitHub Release with the signed XPI, MCP tgz, skill zip, and source zip. Release notes are generic; edit the Release afterwards for highlights.

## Future distribution improvements

- [ ] Decide whether to publish the server as an npm CLI package for one-command MCP installation.
- [ ] Confirm the Windows registration flow on a real Windows machine (implemented and unit-tested, not hardware-verified).
