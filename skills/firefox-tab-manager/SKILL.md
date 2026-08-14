---
name: firefox-tab-manager
description: >-
  Manages the user's live Firefox session through the firefox-tabs MCP tools:
  opens pages, finds tabs, and organizes native tab groups with exact matching
  and post-operation verification. Use when the user mentions Firefox tabs or
  tab groups, asks to open or collect URLs into a named group, wants a tab
  moved/pinned/duplicated/muted/restored, or wants current tab state reported —
  instead of guessing via screenshots or coordinates.
---

# Firefox Tab Manager

Operate the user's live Firefox tabs and native tab groups through the `firefox-tabs` MCP tools. The bridge is authenticated and local; treat only post-operation verified results as success.

## When to use this skill

Use these tools whenever the request involves Firefox tabs or tab groups: opening pages, grouping links for later reading, reorganizing groups, finding a specific tab, or reporting what is open. Prefer them over coordinate-based or screenshot-driven browser automation.

## Ground rules

- **Exact identity first.** Select tabs by `tabId` when you have it (from `list_firefox_tabs`, `open_firefox_tab`, or `get_active_firefox_tab`). Otherwise use the complete URL or complete title. Never guess between multiple matches — the tools reject ambiguity; so should you.
- **Verify before reporting.** Every write tool reads Firefox state back. Report only the verified `tabId`, `windowId`, `groupId`, and titles from the tool result. Never claim success without it.
- **Never fabricate.** Do not invent tab IDs, group titles, or window IDs. Discover them first.
- **Confirm destructive actions.** Closing tabs/groups, unpinning, and muting are user-visible changes. Confirm before acting when the user's intent is not explicit.

## Opening pages and waiting for load

1. Check `get_firefox_bridge_status` when connection state is unknown.
2. Open a single page: `open_firefox_tab` with the explicit `http://`/`https://` URL. Keep `active: false` unless the user asks to focus it.
3. Open a new window: `new_firefox_window` (optionally with a URL); it returns the verified `windowId` and first tab.
4. Open a batch into one group: `open_firefox_tabs_into_group` with `urls` + `groupTitle`. It creates the group only if missing and rolls back opened tabs on failure.
5. When the user needs to interact with the page right away, call `wait_for_firefox_tab` with the returned `tabId`; it returns instantly once the extension's load-completion event arrives (or times out with `TAB_LOAD_TIMEOUT`).

## Finding the right tab or window

- `get_active_firefox_tab` — the tab the user is looking at now (e.g. "add the current page to Reading Queue").
- `list_firefox_windows` — window overview with per-window tab/group counts; the target picker for cross-window work.
- `list_firefox_tabs` — full inventory; `scope: "last_focused_window"` narrows to the focused window.
- `list_firefox_tab_groups` — exact group titles; pass `windowId` when the title may exist in several windows.

## Organizing groups

- **Create** only when the user asked for a new group: `create_firefox_tab_group` from ungrouped tabs in one window, exact title.
- **Reuse** an existing exact group with `move_firefox_tab_to_group` (one tab) or `move_firefox_tabs_to_group` (batch, one verification).
- **Merge**: `merge_firefox_tab_groups` moves every tab of the source group into the target atomically and removes the empty source — prefer it over per-tab loops.
- **Rename / color / collapse**: `rename_firefox_tab_group`, `set_firefox_tab_group_color`, `set_firefox_tab_group_collapsed`.
- **Remove**: `ungroup_firefox_tab` (one tab out), `close_firefox_tab_group` (close all tabs in the group and the empty group itself).

## Cross-window workflows

Window identity matters: groups and titles are per-window.

1. `list_firefox_windows` to pick the target `windowId`.
2. Move a tab into a group in another window: `move_firefox_tab_to_group` with the group's `windowId` (explicit; without it, cross-window moves are rejected).
3. Move a tab bare (no group): `move_firefox_tab_to_window` with `windowId` and optional `index`.
4. Batch moves across windows: `move_firefox_tabs_to_group` with `windowId`; `merge_firefox_tab_groups` handles whole groups.

## Tab state operations

- `pin_firefox_tab` / `unpin_firefox_tab` — note pinning moves the tab to the pinned area.
- `duplicate_firefox_tab` — copy of the exact tab.
- `set_firefox_tab_muted` — mute/unmute ("who is playing sound" → `list_firefox_tabs` shows audible state, then mute).
- `move_firefox_tab` — reposition within its window (`index`, `-1` = end).
- `close_firefox_tabs` — batch close by `tabId` (confirm first).
- `restore_firefox_tab` — undo a close ("I closed the wrong tab").

## Resolving guarded failures

| Error | Response |
|---|---|
| `AMBIGUOUS_TAB` / `AMBIGUOUS_GROUP` | Report candidates; ask the user to choose, or pass a `windowId`/`tabId` to disambiguate. |
| `GROUP_NOT_FOUND` | `list_firefox_tab_groups` for that window and report exact titles. Create only if the user asked to create. |
| `GROUP_ALREADY_EXISTS` | Use the existing group with a move tool instead of duplicating. |
| `TAB_ALREADY_GROUPED` | Ask before pulling the tab out of its current group. |
| `TABS_SPAN_WINDOWS` | Use per-window operations or an explicit `windowId`. |
| `PINNED_TAB_REQUIRES_CONFIRMATION` | Explain that Firefox will unpin; set `allowUnpin: true` only after explicit confirmation. |
| `TAB_NOT_FOUND` | Re-list tabs; the tab may have been closed. |
| `TAB_LOAD_TIMEOUT` | Report that the page did not finish loading in time; offer to wait longer or check the tab. |
| `EXTENSION_NOT_CONNECTED` | Do not claim anything changed; ask the user to check the extension options and run `npm run setup`. |
| `VERIFICATION_FAILED` | Report failure even if the operation itself returned. |

## Upgrading the bridge

When the user asks to upgrade ("升级 firefox-tabs", "update the bridge"):

1. Run `bash scripts/upgrade.sh` from the repository root. It pulls the latest code, rebuilds, restarts Hermes when present, opens the newest signed XPI in Firefox, and syncs this skill to every host where it is already installed (`~/.hermes/skills`, Codex, `~/.claude/skills`, opencode, OpenClaw).
2. Ask the user to confirm the Firefox install prompt — this step cannot be automated.
3. Tell the user how to refresh the other connected MCP clients so they load the new server build: OpenClaw via `openclaw mcp reload` (or restart its gateway); Claude Code, Codex, opencode, and WorkBuddy by restarting the client or its session. Their configs do not change. Skills load at session start, so a new session also picks up this skill's update.
4. Run `npm run doctor` and confirm the extension options page shows "Auto-detected (Native Messaging)" and "Connected".

Do not claim the upgrade finished while any client or the extension still runs the old build.

## Safety rules

- Open only explicit or clearly user-approved `http://`/`https://` URLs.
- Never read page bodies or execute arbitrary page JavaScript.
- Never guess between matches; never create a duplicate group; never cache group IDs across sessions — resolve by current window and title.
- Confirm before closing, unpinning, or muting unless the user's request is explicit.
