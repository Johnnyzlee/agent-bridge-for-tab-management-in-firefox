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
    { name: "firefox-tab-management-agent-mcp", version: "0.5.1" },
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

  return server;
}
