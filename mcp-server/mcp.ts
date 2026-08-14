import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { serializeError } from "../shared/errors.js";
import type { BridgeLike } from "./broker.js";

const selectorSchema = z
  .union([
    z
      .object({
        tabId: z.number().int().positive().describe("A Firefox tab ID returned by list_firefox_tabs."),
      })
      .strict(),
    z
      .object({
        url: z.string().describe("The complete tab URL to match exactly."),
        ignoreUrlFragment: z
          .boolean()
          .optional()
          .default(false)
          .describe("Ignore only the #fragment. All other URL parts remain exact."),
      })
      .strict(),
    z
      .object({
        title: z.string().describe("The complete tab title to match exactly."),
      })
      .strict(),
  ])
  .describe("Exactly one selector form: tabId, URL, or title.");

function success(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

function failure(error: unknown) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify(serializeError(error), null, 2) }],
  };
}

async function invoke(bridge: BridgeLike, method: Parameters<BridgeLike["call"]>[0], params: unknown) {
  try {
    return success(await bridge.call(method, params));
  } catch (error) {
    return failure(error);
  }
}

export function createMcpServer(bridge: BridgeLike): McpServer {
  const server = new McpServer(
    { name: "firefox-tab-management-agent-mcp", version: "0.5.5" },
    {
      instructions:
        "Open only explicit http/https URLs. Use exact URL or title matching and retry ambiguous matches with tabId. Create groups only when the user requested a new group; use the move tool if an exact group already exists. Never set allowUnpin=true without explicit user confirmation. Every write tool verifies the resulting Firefox state.",
    },
  );

  server.registerTool(
    "get_firefox_bridge_status",
    {
      description: "Check whether the local Firefox extension is connected to this MCP server.",
      inputSchema: z.object({}),
    },
    async () => success(bridge.getStatus()),
  );

  server.registerTool(
    "list_firefox_tabs",
    {
      description: "List Firefox tabs with stable IDs, exact URLs, titles, window IDs, and current group IDs.",
      inputSchema: z.object({
        scope: z.enum(["all", "last_focused_window"]).optional().default("all"),
      }),
    },
    async (params) => invoke(bridge, "list_tabs", params),
  );

  server.registerTool(
    "list_firefox_tab_groups",
    {
      description: "List Firefox tab groups, optionally restricted to one window ID.",
      inputSchema: z.object({ windowId: z.number().int().positive().optional() }),
    },
    async (params) => invoke(bridge, "list_tab_groups", params),
  );

  server.registerTool(
    "list_firefox_windows",
    {
      description:
        "List Firefox windows with per-window tab and group counts, and each group's title and size. Use it to pick a target window for cross-window moves.",
      inputSchema: z.object({}),
    },
    async () => invoke(bridge, "list_windows", {}),
  );

  server.registerTool(
    "new_firefox_window",
    {
      description:
        "Open a new Firefox window, optionally with an explicit http(s) URL, without stealing focus by default; returns the verified window ID and first tab.",
      inputSchema: z.object({
        url: z
          .url()
          .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), {
            message: "Only http:// and https:// URLs are allowed.",
          })
          .optional()
          .describe("URL for the first tab of the new window."),
        active: z.boolean().optional().default(false).describe("Whether the new window should become active."),
      }),
    },
    async (params) => invoke(bridge, "new_window", params),
  );

  server.registerTool(
    "open_firefox_tab",
    {
      description:
        "Open an explicit http:// or https:// URL in Firefox, inactive by default, and return the verified tab ID and window ID.",
      inputSchema: z.object({
        url: z
          .url()
          .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), {
            message: "Only http:// and https:// URLs are allowed.",
          }),
        active: z.boolean().optional().default(false).describe("Whether the new tab should become active."),
        windowId: z.number().int().positive().optional().describe("Firefox window in which to open the tab."),
      }),
    },
    async (params) => invoke(bridge, "open_tab", params),
  );

  server.registerTool(
    "create_firefox_tab_group",
    {
      description:
        "Create a new, exactly titled Firefox group from one or more ungrouped tabs in the same window, then verify every tab. Fails if an exact group already exists.",
      inputSchema: z.object({
        tabIds: z.array(z.number().int().positive()).min(1).describe("Unique IDs of ungrouped tabs in one window."),
        title: z.string().trim().min(1).describe("New group title; matching is exact and case-sensitive."),
        collapsed: z.boolean().optional().default(false).describe("Whether the new group should start collapsed."),
        allowUnpin: z
          .boolean()
          .optional()
          .default(false)
          .describe("Set true only after the user confirms that grouping may unpin pinned tabs."),
      }),
    },
    async (params) => invoke(bridge, "create_tab_group", params),
  );

  server.registerTool(
    "move_firefox_tab_to_group",
    {
      description:
        "Move one exactly identified Firefox tab into an existing, exactly named group in the same window and verify the result. Ambiguous matches fail safely.",
      inputSchema: z.object({
        selector: selectorSchema,
        groupTitle: z.string().min(1).describe("Existing group title; matching is exact and case-sensitive."),
        windowId: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Target window for the group; omit to use the tab's own window."),
        allowUnpin: z
          .boolean()
          .optional()
          .default(false)
          .describe("Set true only after the user confirms that grouping may unpin a pinned tab."),
      }),
    },
    async (params) => invoke(bridge, "move_tab_to_group", params),
  );

  server.registerTool(
    "move_firefox_tab",
    {
      description:
        "Move one exactly identified Firefox tab to a target position within its own window and verify the result. Ambiguous matches fail safely.",
      inputSchema: z.object({
        selector: selectorSchema,
        index: z
          .number()
          .int()
          .min(-1)
          .describe("0-based target position in the tab's window; -1 moves it to the end."),
      }),
    },
    async (params) => invoke(bridge, "move_tab", params),
  );

  server.registerTool(
    "ungroup_firefox_tab",
    {
      description: "Remove one exactly identified Firefox tab from its current group and verify the result.",
      inputSchema: z.object({ selector: selectorSchema }),
    },
    async (params) => invoke(bridge, "ungroup_tab", params),
  );

  server.registerTool(
    "pin_firefox_tab",
    {
      description: "Pin one exactly identified Firefox tab and verify it.",
      inputSchema: z.object({ selector: selectorSchema }),
    },
    async (params) => invoke(bridge, "pin_tab", params),
  );

  server.registerTool(
    "unpin_firefox_tab",
    {
      description: "Unpin one exactly identified Firefox tab and verify it.",
      inputSchema: z.object({ selector: selectorSchema }),
    },
    async (params) => invoke(bridge, "unpin_tab", params),
  );

  server.registerTool(
    "duplicate_firefox_tab",
    {
      description: "Duplicate one exactly identified Firefox tab and verify the new tab's URL and window.",
      inputSchema: z.object({ selector: selectorSchema }),
    },
    async (params) => invoke(bridge, "duplicate_tab", params),
  );

  server.registerTool(
    "set_firefox_tab_group_color",
    {
      description: "Set the color of one exactly named Firefox group and verify the resulting color.",
      inputSchema: z.object({
        groupTitle: z.string().min(1).describe("Existing group title; matching is exact and case-sensitive."),
        color: z
          .enum(["blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange", "grey"])
          .describe("Firefox tab group color."),
        windowId: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Window to look in; required when the title exists in more than one window."),
      }),
    },
    async (params) => invoke(bridge, "set_tab_group_color", params),
  );

  server.registerTool(
    "move_firefox_tab_to_window",
    {
      description:
        "Move one exactly identified Firefox tab to another window (without grouping it) and verify the resulting window.",
      inputSchema: z.object({
        selector: selectorSchema,
        windowId: z.number().int().positive().describe("Target Firefox window."),
        index: z
          .number()
          .int()
          .min(-1)
          .optional()
          .describe("0-based target position in the target window; -1 = end."),
      }),
    },
    async (params) => invoke(bridge, "move_tab_to_window", params),
  );

  server.registerTool(
    "open_firefox_tabs_into_group",
    {
      description:
        "Open a batch of explicit http(s) URLs in the background and put every new tab into one exactly named group in one atomic operation (creating the group only if missing); on failure, already opened tabs are closed again.",
      inputSchema: z.object({
        urls: z
          .array(
            z
              .url()
              .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), {
                message: "Only http:// and https:// URLs are allowed.",
              }),
          )
          .min(1),
        groupTitle: z.string().min(1).describe("Group title; existing groups are reused, otherwise created."),
        windowId: z.number().int().positive().optional().describe("Window in which to open the tabs."),
        collapsed: z.boolean().optional().describe("Initial collapsed state only when the group is created."),
        allowUnpin: z
          .boolean()
          .optional()
          .default(false)
          .describe("Set true only after the user confirms that grouping may unpin pinned tabs."),
      }),
    },
    async (params) => invoke(bridge, "open_tabs_into_group", params),
  );

  server.registerTool(
    "wait_for_firefox_tab",
    {
      description:
        "Wait until the Firefox extension reports a tab as fully loaded (event-driven; returns immediately if the event already arrived). Use it after open/duplicate to know when the page finished loading.",
      inputSchema: z.object({
        tabId: z.number().int().positive().describe("Tab ID returned by open_firefox_tab or duplicate_firefox_tab."),
        timeoutMs: z.number().int().min(100).max(30000).optional().default(10000),
      }),
    },
    async (params) => invoke(bridge, "wait_tab", params),
  );

  server.registerTool(
    "get_active_firefox_tab",
    {
      description: "Return the currently active tab of the focused Firefox window (or null if none).",
      inputSchema: z.object({}),
    },
    async () => invoke(bridge, "get_active_tab", {}),
  );

  server.registerTool(
    "move_firefox_tabs_to_group",
    {
      description:
        "Move a batch of exactly identified Firefox tabs into one existing, exactly named group in one verified operation (cross-window supported with an explicit windowId).",
      inputSchema: z.object({
        tabIds: z
          .array(z.number().int().positive())
          .min(1)
          .describe("Unique tab IDs returned by list_firefox_tabs."),
        groupTitle: z.string().min(1).describe("Existing group title; matching is exact and case-sensitive."),
        windowId: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Target window for the group; omit to use the first tab's window."),
        allowUnpin: z
          .boolean()
          .optional()
          .default(false)
          .describe("Set true only after the user confirms that grouping may unpin pinned tabs."),
      }),
    },
    async (params) => invoke(bridge, "move_tabs_to_group", params),
  );

  server.registerTool(
    "close_firefox_tabs",
    {
      description:
        "Close a batch of exactly identified Firefox tabs by their tabId and verify that Firefox no longer reports them.",
      inputSchema: z.object({
        tabIds: z
          .array(z.number().int().positive())
          .min(1)
          .describe("Unique tab IDs returned by list_firefox_tabs or search_firefox_tabs."),
      }),
    },
    async (params) => invoke(bridge, "close_tabs", params),
  );

  server.registerTool(
    "close_firefox_tab_group",
    {
      description:
        "Close every tab in one exactly named Firefox group (and remove the now-empty group) after verification.",
      inputSchema: z.object({
        groupTitle: z.string().min(1).describe("Existing group title; matching is exact and case-sensitive."),
        windowId: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Window to look in; required when the title exists in more than one window."),
      }),
    },
    async (params) => invoke(bridge, "close_tab_group", params),
  );

  server.registerTool(
    "merge_firefox_tab_groups",
    {
      description:
        "Move every tab of the source group into the target group in one verified operation, then remove the now-empty source group.",
      inputSchema: z.object({
        from: z.string().min(1).describe("Source group title; matching is exact and case-sensitive."),
        to: z.string().min(1).describe("Target group title; matching is exact and case-sensitive."),
        windowId: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Window for both groups; required when the titles exist in more than one window."),
      }),
    },
    async (params) => invoke(bridge, "merge_tab_groups", params),
  );

  server.registerTool(
    "rename_firefox_tab_group",
    {
      description:
        "Rename one exactly named Firefox group to a new exact title and verify the result; fails if the new title already exists in the window.",
      inputSchema: z.object({
        groupTitle: z.string().min(1).describe("Existing group title; matching is exact and case-sensitive."),
        newTitle: z.string().trim().min(1).describe("New exact group title."),
        windowId: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Window to look in; required when the title exists in more than one window."),
      }),
    },
    async (params) => invoke(bridge, "rename_tab_group", params),
  );

  server.registerTool(
    "set_firefox_tab_group_collapsed",
    {
      description:
        "Collapse or expand one exactly named Firefox group and verify the resulting collapsed state.",
      inputSchema: z.object({
        groupTitle: z.string().min(1).describe("Existing group title; matching is exact and case-sensitive."),
        collapsed: z.boolean().describe("Whether the group should be collapsed."),
        windowId: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Window to look in; required when the title exists in more than one window."),
      }),
    },
    async (params) => invoke(bridge, "set_tab_group_collapsed", params),
  );

  return server;
}
