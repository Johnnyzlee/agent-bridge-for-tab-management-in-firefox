# Agent Bridge for Tab Management in Firefox

[简体中文](README.zh-CN.md)

Let any AI agent you trust manage your live Firefox tabs and tab groups — open pages, group them, ungroup them — without copy-pasting tokens or touching the browser UI.

Everything runs locally. No accounts, no cloud, no telemetry.

## What it does

- Lists your live tabs and tab groups.
- Opens `http`/`https` pages in the background (no focus stealing).
- Creates, moves, and removes tab groups with exact names.
- Moves tabs to a target position in their window.
- Refuses ambiguous matches, duplicate group names, cross-window grouping, and unpinning without your OK.
- Verifies every change against Firefox before reporting success.

## What you can do with it

### Collect now, read later

You find articles, docs, and research links while browsing a feed, chatting, or working on another device. Instead of opening and organizing every page yourself, send the URLs to your agent:

> Open these URLs in Firefox in the background and put every new tab in a group named "Reading Queue" (create it only if missing).

Pages open without stealing focus and stay together in one group. Later, sit down and work through the group as a focused reading queue. Firefox tab groups become your inbox for the web — less clutter, fewer context switches, and zero manual organizing.

### Organize research as you go

While reading a feed or working across topics, send links in small batches:

> Open these three articles in the background and group them as "Research".

Each topic gets its own tidy group without interrupting what you are doing.

### Regroup with one sentence

Changed your mind about the structure? Just say so:

> Move every tab from the "Trading" group into "Investing".

One atomic `merge_firefox_tab_groups` call moves the whole group, removes the now-empty source group, and verifies every tab in the target — no per-tab loops.

### Put the important tab first

Working across many open pages? Keep order meaningful:

> Move the tab for "quarterly report" to the front of the window.

Exact matching finds the right tab and `move_firefox_tab` places it where you want, verified against Firefox.

### Reset when a task is done

> Close the "Finished" group and ungroup everything else in this window.

`close_firefox_tab_group` closes a whole group (and its empty shell) with verification; ungrouping returns the rest to a clean state — all checked against Firefox before being reported.

### Start fresh in a new window

> Open a new window in the background and put these links into a group named "Research" there.

`new_firefox_window` creates the verified window, then the group tools file the links into it — a dedicated research window without leaving your current context.

### Keep groups tidy

> Rename the "Temp" group to "Later" and collapse it until I come back.

Exact rename with duplicate-title rejection, plus verified collapse/expand, keep your tab-bar readable with one sentence.

### Recurring routines

Make it a habit: throughout the day, send article links, docs, and reference pages to your agent. It files them into the right group automatically, so your tabs stay organized with no manual effort at all.

## Install in three steps

### 1. Install the extension

Download `tab_management_agent_bridge_for_firefox-0.5.4.xpi` from the [latest release](https://github.com/Johnnyzlee/agent-bridge-for-tab-management-in-firefox/releases) and open it with Firefox.

### 2. Run setup once

```bash
npm run quickstart
```

This builds everything and registers the local bridge:

- creates the local configuration (port + secret token, mode `0600`),
- registers the Native Messaging Host so Firefox can reach it,
- generates a token-free client configuration in `.local/mcp-config.json`.

That's it. The token is created and managed automatically — you never see it, and no client config contains it. Re-run `npm run setup` any time to repair a broken registration.

### 3. Connect your agent

#### Claude Code

```bash
claude mcp add firefox-tabs -- node /absolute/path/to/agent-bridge-for-tab-management-in-firefox/dist/server/index.js
```

Then restart Claude Code. Or add the equivalent `mcpServers` entry to `~/.claude.json`.

#### Codex

```bash
.local/add-to-codex.sh        # macOS / Linux
.local/add-to-codex.ps1       # Windows PowerShell
```

Then restart Codex.

#### Hermes

Add to `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  firefox-tabs:
    command: node
    args:
      - /absolute/path/to/agent-bridge-for-tab-management-in-firefox/dist/server/index.js
    enabled: true
```

Then restart Hermes (`hermes gateway restart`).

#### OpenClaw

Add to `~/.openclaw/openclaw.json`:

```json5
{
  mcp: {
    servers: {
      "firefox-tabs": {
        command: "node",
        args: ["/absolute/path/to/agent-bridge-for-tab-management-in-firefox/dist/server/index.js"],
        enabled: true
      }
    }
  }
}
```

Or via CLI: `openclaw mcp add firefox-tabs --command node --arg /absolute/path/to/dist/server/index.js`

#### OpenCode

Add to `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "firefox-tabs": {
      "type": "local",
      "command": ["node", "/absolute/path/to/agent-bridge-for-tab-management-in-firefox/dist/server/index.js"],
      "enabled": true
    }
  }
}
```

#### WorkBuddy

Add to `~/.workbuddy/mcp.json`:

```json
{
  "mcpServers": {
    "firefox-tabs": {
      "command": "node",
      "args": ["/absolute/path/to/agent-bridge-for-tab-management-in-firefox/dist/server/index.js"]
    }
  }
}
```

#### Any other MCP client

Merge `.local/mcp-config.json` (or the equivalent below) into your client config:

```json
{
  "mcpServers": {
    "firefox-tabs": {
      "command": "node",
      "args": ["/absolute/path/to/agent-bridge-for-tab-management-in-firefox/dist/server/index.js"]
    }
  }
}
```

The server reads the port and token from the shared local configuration automatically. No env vars, no secrets in your client config.

## Verify

Ask your agent:

> Check the Firefox bridge status, list my tab groups, open https://example.com, and put it in an exact group named Research (create it only if missing). Verify the group ID.

Or open the extension's options page: it shows the auto-configuration status, connection state, and local port — nothing else to configure.

## Multiple agents at once

A shared broker on `127.0.0.1:8767` multiplexes any number of agents over the single Firefox connection. The first MCP server you start becomes the broker; every other server instance automatically connects to it as a client — so Claude Code, Hermes, OpenClaw, Codex, and OpenCode can all manage the same Firefox session simultaneously. Each client still authenticates with the same shared secret from the local configuration; nothing else changes in your client configs.

## Useful commands

```bash
npm start                 # start the MCP server
npm run doctor            # check config, permissions, and Native Host registration
npm run uninstall         # remove the Native Host registration (keeps config)
npm run uninstall --purge # also delete the local configuration
```

## Privacy & security

- Runs entirely on your machine; the Native Messaging Host connects to nothing remote.
- The WebSocket bridge binds to `127.0.0.1` only and requires the automatically managed token (timing-safe comparison, no token-less fallback).
- The extension can only talk to the signed extension ID via Native Messaging.
- The extension never reads page contents. See [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md).

## Development

Firefox 142+, Node.js 20+:

```bash
npm ci
npm run check
```

Licensed under [MPL-2.0](LICENSE). Independent project, not endorsed by Mozilla.
