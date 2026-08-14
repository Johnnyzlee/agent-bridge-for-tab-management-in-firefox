#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { runDoctor, runSetup, runUninstall, doctorReport, setupReport, uninstallReport, usageReport } from "../cli/commands.js";
import { resolveBridgeOptions, platformForCLI } from "../shared/config.js";
import { FirefoxTabsError } from "../shared/errors.js";
import { FirefoxBridge } from "./bridge.js";
import { createMcpServer } from "./mcp.js";

const subcommand = process.argv[2];

async function startServer(): Promise<void> {
  let options;
  try {
    options = await resolveBridgeOptions(process.env, platformForCLI());
  } catch (error) {
    if (error instanceof FirefoxTabsError && error.code === "CONFIG_NOT_FOUND") {
      console.error(
        "No local bridge configuration found. Run `npm run setup` (or `firefox-tab-management-agent-mcp setup`) to create it.",
      );
    } else {
      console.error(error instanceof Error ? error.message : String(error));
    }
    process.exit(1);
  }

  const bridge = new FirefoxBridge({ token: options.token, port: options.port });
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

  console.error(`firefox-tab-management-agent-mcp listening on ws://127.0.0.1:${options.port} (configuration from ${options.source})`);
}

async function main(): Promise<void> {
  switch (subcommand) {
    case undefined:
      await startServer();
      return;
    case "setup":
      console.log(setupReport(await runSetup()));
      return;
    case "doctor": {
      const result = await runDoctor();
      console.log(doctorReport(result));
      process.exitCode = result.checks.some((check) => !check.ok && !check.warning) ? 1 : 0;
      return;
    }
    case "uninstall":
    case "unregister-host":
      console.log(uninstallReport(await runUninstall({ purge: process.argv.includes("--purge") }), process.argv.includes("--purge")));
      return;
    case "help":
    case "--help":
    case "-h":
      console.log(usageReport());
      return;
    default:
      console.log(usageReport());
      process.exitCode = 1;
      return;
  }
}

void main();
