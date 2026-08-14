#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { FirefoxBridge } from "./bridge.js";
import { createMcpServer } from "./mcp.js";

const token = process.env.FIREFOX_TABS_BRIDGE_TOKEN ?? "";
const rawPort = process.env.FIREFOX_TABS_BRIDGE_PORT ?? "8765";
const port = Number(rawPort);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("FIREFOX_TABS_BRIDGE_PORT must be an integer between 1 and 65535.");
  process.exit(1);
}

const bridge = new FirefoxBridge({ token, port });
await bridge.start();

const stdioHandle = serveStdio(() => createMcpServer(bridge));
let shuttingDown = false;

const shutdown = async (): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  await stdioHandle.close();
  await bridge.stop();
};
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
process.stdin.once("end", () => void shutdown());
process.stdin.once("close", () => void shutdown());

console.error(`firefox-tab-management-agent-mcp listening on ws://127.0.0.1:${port}`);
