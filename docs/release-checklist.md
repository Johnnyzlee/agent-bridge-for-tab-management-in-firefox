# Release Checklist

## Completed locally

- [x] Neutral project and extension name.
- [x] MPL-2.0 license metadata and full license text.
- [x] English and Simplified Chinese setup documentation.
- [x] Privacy, security, contribution, architecture, and changelog documents.
- [x] GitHub CI plus issue and pull-request templates.
- [x] Clean dependency audit, automated tests, Firefox lint, MCP tool discovery, and Agent Skill validation.
- [x] Extension, MCP package, Agent Skill, and AMO source archives rebuilt and integrity-checked.
- [x] AMO source package rebuilt in a clean temporary directory and compared with the expected extension output.

## v0.5.1 development (move tab to position)

- [x] Add `move_firefox_tab` (same-window target index, `-1` = end, clamping, no-op, post-move verification).
- [x] Reposition tests (exact match, index validation, ambiguity rejection).
- [ ] Submit v0.5.1 as an AMO unlisted version and verify the signed XPI.

## v0.5.0 development (shared broker)

- [x] Add the shared broker: first server instance becomes the broker (extension port + agent port 8767), later instances connect as authenticated clients.
- [x] Multi-agent routing tests (response correlation, disconnect propagation, per-agent isolation, unauthenticated rejection).
- [x] `FIREFOX_TABS_BRIDGE_BROKER_PORT` override and doctor broker-port check.
- [ ] Live multi-agent verification with real Firefox (two MCP clients against one broker).
- [ ] Submit v0.5.0 as an AMO unlisted version and verify the signed XPI.

## v0.4.0 development (automatic pairing)

- [x] Remove the manual token entry from the extension options page and the generated token helpers.
- [x] Add a user-level bridge configuration directory shared by the MCP server, the CLI, and the Native Messaging Host.
- [x] Add `nativeMessaging` permission and automatic configuration retrieval in the extension.
- [x] Implement the Native Messaging Host (framing, message validation, registration authorization).
- [x] Implement `setup`, `doctor`, and `uninstall` (with `--purge`) CLI subcommands.
- [x] Migrate the v0.3.1 `.local/bridge-token.txt` token on first setup and preserve tokens on rerun.
- [x] Keep `FIREFOX_TABS_BRIDGE_TOKEN` / `FIREFOX_TABS_BRIDGE_PORT` as explicit overrides; generate token-free MCP client configuration.
- [x] Automated tests for config, migration, host framing/validation, CLI output hygiene, and cross-platform path logic.
- [ ] Review the signed Gecko ID and all new permissions (`nativeMessaging`) on the AMO submission form.
- [ ] Test the signed build in a fresh Firefox profile, including automatic pairing and upgrade from v0.3.1.
- [ ] Capture clean options-page screenshots (no token input).
- [ ] Submit v0.4.0 from the existing AMO add-on page under the same Gecko ID.
- [ ] Download and verify the production-signed v0.4.0 XPI, then update the README stable link and VALIDATION report.
- [ ] Confirm the Windows registration flow on a real Windows machine (implemented and unit-tested, not yet hardware-verified).

## Before making a v0.4.0 GitHub release

- [ ] Confirm that GitHub Actions passes on Node.js 20 and 22.
- [ ] Update `docs/amo-reviewer-guide.md` if AMO review revealed changes.
- [ ] Create the release with the Mozilla-signed XPI, MCP package, Agent Skill ZIP, and matching source archives.
- [ ] Verify the npm package contains the built Native Messaging Host and CLI (`npm pack --dry-run`).

## Future distribution improvements

- [ ] Decide whether to publish the server as an npm CLI package for one-command MCP installation.
- [ ] Replace the single-client fixed-port design with an optional shared local daemon/broker.
- [ ] Add an automated tagged-release workflow after a manual v0.4.0 release is verified.
