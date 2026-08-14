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

## Before making GitHub public

- [x] Confirm the final owner and repository name: `Johnnyzlee/agent-bridge-for-tab-management-in-firefox`.
- [x] Create the public repository and push the reviewed initial commit.
- [x] Confirm that GitHub Actions passes on Node.js 20 and 22.
- [x] Enable private vulnerability reporting and review the published contact links.
- [x] Add the repository description and topics.
- [x] Create an initial release containing the Mozilla-signed XPI, MCP package, Agent Skill ZIP, and matching source archives.

## AMO status and next update

- [x] Preserve the AMO-signed Gecko add-on ID `firefox-tabs-mcp@local.invalid` for all future updates.
- [x] Pass Mozilla review and obtain the production-signed v0.3.0 XPI.
- [ ] Approve a final icon and add the required icon sizes to the manifest.
- [ ] Capture clean options-page and tab-group screenshots.
- [x] Publish the repository so the privacy policy, support page, source, and build instructions have stable URLs.
- [ ] Recheck the manifest permissions and `browsingActivity` declaration against the current AMO form.
- [ ] Submit a future branded update under the same Gecko ID.
- [ ] Test the signed build in a fresh Firefox profile before each announcement.

## Future distribution improvements

- [ ] Decide whether to publish the server as an npm CLI package for one-command MCP installation.
- [ ] Replace the single-client fixed-port design with an optional shared local daemon.
- [ ] Add an automated tagged-release workflow after the first manual release is verified.
