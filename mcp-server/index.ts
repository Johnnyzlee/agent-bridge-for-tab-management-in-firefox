#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { runDoctor, runSetup, runUninstall, doctorReport, setupReport, uninstallReport, usageReport } from "../cli/commands.js";
import { resolveBridgeOptions, platformForCLI } from "../shared/config.js";
import { FirefoxTabsError } from "../shared/errors.js";
import { Broker, type BridgeLike } from "./broker.js";
import { BrokerClient } from "./client.js";
import { createMcpServer } from "./mcp.js";

const subcommand = process.argv[2];

async function connectBridge(options: {
  token: string;
  port: number;
  brokerPort: number;
}): Promise<BridgeLike> {
  const broker = new Broker({ token: options.token, extensionPort: options.port, agentPort: options.brokerPort });
  try {
    await broker.start();
    return broker;
  } catch (error) {
    await broker.stop().catch(() => undefined);
  }

  const client = new BrokerClient({ token: options.token, agentPort: options.brokerPort });
  try {
    await client.connect();
    return client;
  } catch (error) {
    await client.stop().catch(() => undefined);
    if (error instanceof FirefoxTabsError && error.code === "BROKER_AUTH_FAILED") {
      throw error;
    }
    throw new FirefoxTabsError(
      "BROKER_UNAVAILABLE",
      "No shared broker is running and the local bridge ports are busy. Stop older bridge processes, then run `npm run setup` and start the server again.",
    );
  }
}

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

  const bridge = await connectBridge(options);

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

  const status = bridge.getStatus();
  const role = status.listening ? "shared broker" : "broker client";
  console.error(
    `firefox-tab-management-agent-mcp connected (${role}) — extension port ${options.port}, agent port ${options.brokerPort} (configuration from ${options.source})`,
  );
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
