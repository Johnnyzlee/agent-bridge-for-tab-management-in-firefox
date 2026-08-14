---
name: firefox-tab-manager
description: Precisely inspect, open, find, create groups, move, and ungroup tabs in the user's live Firefox session through the firefox-tabs MCP tools. Use when the user mentions Firefox tabs or tab groups, asks to open or put a page into a named group, needs exact tab lookup, or wants a grouped tab verified without coordinate-based Computer Use.
---

# Firefox Tab Manager

Use the `firefox-tabs` MCP tools from Agent Bridge for Tab Management in Firefox for semantic operations on the user's live Firefox tabs. Prefer these tools over screen coordinates whenever the bridge is connected.

## Open a page and create or reuse a group

1. Call `get_firefox_bridge_status` when connection state is unknown.
2. Call `list_firefox_tabs` and `list_firefox_tab_groups` before choosing a window. Use the uniquely relevant window from current context; if multiple windows are equally plausible, ask the user instead of guessing.
3. Call `open_firefox_tab` only with the explicit `http://` or `https://` URL. Keep `active: false` unless the user asks to focus the new tab.
4. If an exact, case-sensitive group title already exists in the new tab's window, call `move_firefox_tab_to_group` with the returned `tabId`.
5. If no exact group exists and the user explicitly requested creating it, call `create_firefox_tab_group` with the returned `tabId` and exact title.
6. Report the returned tab ID, window ID, group ID, and exact group title. Treat only the post-operation verified result as success.

Do not open a guessed URL, a privileged Firefox page, a local file, or a non-HTTP scheme. Do not create a duplicate group as a substitute for moving into an existing group.

## Move a tab into a group

1. Call `get_firefox_bridge_status` when connection state is unknown. If disconnected, report the status and ask the user to run `npm run setup` and press “Repair / re-detect local install” in the extension options; do not ask for a token.
2. Identify the tab with exactly one selector:
   - Use the complete URL when the user supplies a URL.
   - Use the complete title only when the user supplies a title and it is exact.
   - Use `tabId` after `list_firefox_tabs` when a URL or title is ambiguous.
3. Call `move_firefox_tab_to_group` with the exact, case-sensitive group title.
4. Treat `changed: false` as a successful no-op: the tab was already in the requested group.
5. Report the verified `after.groupId` and group title from the tool result.

Keep `ignoreUrlFragment` false unless the user explicitly wants URL fragments ignored or the only known difference is a `#fragment`. Do not perform fuzzy URL, substring, or case-insensitive group matching.

## Resolve guarded failures

- On `AMBIGUOUS_TAB`, show the returned candidates or call `list_firefox_tabs`, then ask the user to choose unless context identifies one unique `tabId`.
- On `GROUP_NOT_FOUND`, call `list_firefox_tab_groups` for the tab's `windowId` and report the exact available titles. Create the requested group only if the user explicitly asked to create it; otherwise do not silently substitute or create one.
- On `GROUP_ALREADY_EXISTS`, use the returned existing group with `move_firefox_tab_to_group` instead of creating a duplicate.
- On `TAB_ALREADY_GROUPED`, do not pull the tab out of its current group implicitly. Ask whether to move it unless the user's request already specifies the destination.
- On `TABS_SPAN_WINDOWS`, do not move tabs between windows implicitly; create separate groups or ask the user which window to use.
- On `AMBIGUOUS_GROUP`, report the candidate groups and request a disambiguating change in Firefox.
- On `PINNED_TAB_REQUIRES_CONFIRMATION`, explain that Firefox will unpin the tab. Set `allowUnpin: true` only after explicit user confirmation.
- On `EXTENSION_NOT_CONNECTED`, do not claim that Firefox was changed.
- On `VERIFICATION_FAILED`, report failure even if the move request itself returned from Firefox.

## List or ungroup tabs

- Use `list_firefox_tabs` to return tab IDs, exact URLs, titles, windows, and group IDs. Restrict to `last_focused_window` only when the user asks about the focused window.
- Use `list_firefox_tab_groups` to inspect exact group names; pass `windowId` when known.
- Use `ungroup_firefox_tab` with the same exact selector rules. Report `changed: false` when the tab was already ungrouped.

## Safety rules

- Never read page bodies or execute arbitrary page JavaScript for tab organization.
- Open only an explicit or clearly user-approved `http/https` URL.
- Never guess between multiple tab or group matches.
- Never create a group unless the user requested a new group, and never create an exact duplicate in the same window.
- Never cache group IDs across Firefox restarts; resolve groups by current window and title for each move.
- Never say an operation succeeded without the tool's post-operation verification result.
