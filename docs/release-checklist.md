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

- [ ] Confirm the final owner and repository name: `Johnnyzlee/agent-bridge-for-tab-management-in-firefox`.
- [ ] Create the public repository and push the reviewed initial commit.
- [ ] Confirm that GitHub Actions passes on Node.js 20 and 22.
- [ ] Enable private vulnerability reporting and review the published contact links.
- [ ] Add repository description, topics, and an initial release containing the extension ZIP, MCP package, Agent Skill ZIP, and AMO source archive.

## Before AMO submission

- [ ] Approve a permanent public Gecko add-on ID such as `tab-management-agent-bridge@johnnyzlee.github.io`; the current `@local.invalid` development ID must not become the long-term public identity accidentally.
- [ ] Approve a final icon and add the required icon sizes to the manifest.
- [ ] Capture clean options-page and tab-group screenshots.
- [ ] Publish the repository so the privacy policy, support page, source, and build instructions have stable URLs.
- [ ] Recheck the manifest permissions and `browsingActivity` declaration against the current AMO form.
- [ ] Upload the extension package and matching source archive as a listed add-on, including the reviewer guide.
- [ ] Test the signed build in a fresh Firefox profile before announcing it.

## Future distribution improvements

- [ ] Decide whether to publish the server as an npm CLI package for one-command MCP installation.
- [ ] Replace the single-client fixed-port design with an optional shared local daemon.
- [ ] Add an automated tagged-release workflow after the first manual release is verified.
