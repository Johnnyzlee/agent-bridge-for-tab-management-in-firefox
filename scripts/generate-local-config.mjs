#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(repositoryRoot, ".local");
const serverPath = path.join(repositoryRoot, "dist", "server", "index.js");
const port = "8765";

await mkdir(outputDirectory, { recursive: true });

const tokenPath = path.join(outputDirectory, "bridge-token.txt");
const configPath = path.join(outputDirectory, "mcp-config.json");
const codexShellPath = path.join(outputDirectory, "add-to-codex.sh");
const codexPowerShellPath = path.join(outputDirectory, "add-to-codex.ps1");

let token = "";
try {
  token = (await readFile(tokenPath, "utf8")).trim();
} catch {
  // A token is generated below when no previous local setup exists.
}
if (token.length < 16) token = randomBytes(32).toString("hex");

const config = {
  mcpServers: {
    "firefox-tabs": {
      command: "node",
      args: [serverPath],
      env: {
        FIREFOX_TABS_BRIDGE_PORT: port,
        FIREFOX_TABS_BRIDGE_TOKEN: token,
      },
    },
  },
};

await writeFile(tokenPath, `${token}\n`, { encoding: "utf8", mode: 0o600 });
await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
await Promise.all([chmod(tokenPath, 0o600), chmod(configPath, 0o600)]);

const shellQuote = (value) => `'${value.replaceAll("'", `'"'"'`)}'`;
const codexCommand = [
  "codex mcp add firefox-tabs",
  `--env FIREFOX_TABS_BRIDGE_TOKEN=${shellQuote(token)}`,
  `--env FIREFOX_TABS_BRIDGE_PORT=${port}`,
  `-- node ${shellQuote(serverPath)}`,
].join(" ");
const powerShellPath = serverPath.replaceAll("'", "''");
const codexPowerShellCommand = [
  "codex mcp add firefox-tabs",
  `--env 'FIREFOX_TABS_BRIDGE_TOKEN=${token}'`,
  `--env 'FIREFOX_TABS_BRIDGE_PORT=${port}'`,
  `-- node '${powerShellPath}'`,
].join(" ");

await writeFile(codexShellPath, `#!/bin/sh\nexec ${codexCommand}\n`, { encoding: "utf8", mode: 0o700 });
await writeFile(codexPowerShellPath, `${codexPowerShellCommand}\n`, { encoding: "utf8", mode: 0o600 });
await Promise.all([chmod(codexShellPath, 0o700), chmod(codexPowerShellPath, 0o600)]);

console.log("\nAgent Bridge for Tab Management in Firefox is built.\n");
console.log("1. Signed extension: download the Mozilla-signed XPI from the GitHub v0.3.1 release.");
console.log(`   Development manifest: ${path.join(repositoryRoot, "dist", "firefox-extension", "manifest.json")}`);
console.log(`2. Paste the token from: ${tokenPath}`);
console.log(`3. Generic MCP configuration: ${configPath}`);
console.log(`4. Codex helper (macOS/Linux): ${codexShellPath}`);
console.log(`   Codex helper (PowerShell): ${codexPowerShellPath}`);
console.log("5. Optional Agent Skill source:");
console.log(path.join(repositoryRoot, "skills", "firefox-tab-manager"));
console.log("\nUse the development manifest only when testing source changes; Firefox removes temporary add-ons after restart.\n");
