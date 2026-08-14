import { chmod, mkdir, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FirefoxTabsError } from "../shared/errors.js";
import {
  BRIDGE_CONFIG_FILE,
  CONFIG_DIR_ENV,
  DEFAULT_BRIDGE_PORT,
  DEFAULT_BROKER_PORT,
  EXTENSION_ID,
  MIN_TOKEN_LENGTH,
  NATIVE_HOST_NAME,
  PORT_ENV,
  TOKEN_ENV,
  type BridgeConfig,
  type CommandRunner,
  type PlatformInfo,
  atomicWriteFile,
  configFilePath,
  configRoot,
  generateBridgeToken,
  loadBridgeConfig,
  migrateLegacyToken,
  nativeHostManifest,
  nativeHostManifestPath,
  platformForCLI,
  resolveBrokerPort,
  runCommand,
  saveBridgeConfig,
  verifyHostRegistration,
} from "../shared/config.js";
import { BRIDGE_PROTOCOL_VERSION } from "../shared/protocol.js";

export const APP_VERSION = "0.5.7";

export interface SetupOptions {
  platform?: PlatformInfo;
  configRoot?: string;
  packageRoot?: string;
  outDir?: string;
  legacyTokenPath?: string;
  run?: CommandRunner;
}

export interface SetupResult {
  version: string;
  configRoot: string;
  configCreated: boolean;
  tokenPreserved: boolean;
  migratedLegacyToken: boolean;
  manifestPath: string;
  mcpConfigPath: string;
  serverPath: string;
  codexShellPath: string;
  codexPowerShellPath: string;
}

export interface DoctorCheck {
  name: string;
  ok: boolean;
  warning?: boolean;
  detail: string;
}

export interface DoctorResult {
  checks: DoctorCheck[];
}

export interface UninstallOptions {
  platform?: PlatformInfo;
  configRoot?: string;
  packageRoot?: string;
  purge: boolean;
  run?: CommandRunner;
}

export interface UninstallResult {
  manifestRemoved: boolean;
  manifestPath: string | undefined;
  configDirRemoved: boolean;
}

function derivePackageRoot(): string {
  const file = fileURLToPath(import.meta.url);
  const dir = path.dirname(file);
  if (path.basename(dir) === "server" && path.basename(path.dirname(dir)) === "dist") {
    return path.resolve(dir, "..", "..");
  }
  return path.resolve(dir, "..");
}

export async function runSetup(options: SetupOptions = {}): Promise<SetupResult> {
  const platform = options.platform ?? platformForCLI();
  const packageRoot = options.packageRoot ?? derivePackageRoot();
  const root = options.configRoot ?? configRoot(platform);
  const outDir = options.outDir ?? path.join(packageRoot, ".local");
  const legacyTokenPath = options.legacyTokenPath ?? path.join(packageRoot, ".local", "bridge-token.txt");
  const serverPath = path.join(packageRoot, "dist", "server", "index.js");
  const hostPath = path.join(packageRoot, "dist", "native-host", "index.js");
  const run = options.run ?? runCommand;

  let config: BridgeConfig | null = null;
  let configCreated = false;
  let tokenPreserved = false;
  try {
    config = await loadBridgeConfig(root);
    tokenPreserved = true;
  } catch (error) {
    if (!(error instanceof FirefoxTabsError && error.code === "CONFIG_NOT_FOUND")) {
      throw error;
    }
  }

  let migratedLegacyToken = false;
  if (config === null) {
    migratedLegacyToken = await migrateLegacyToken(root, legacyTokenPath, platform);
    if (migratedLegacyToken) {
      config = await loadBridgeConfig(root);
    }
  }
  if (config === null) {
    config = {
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      port: DEFAULT_BRIDGE_PORT,
      token: generateBridgeToken(),
    };
    await saveBridgeConfig(root, config, platform);
    configCreated = true;
  }

  const manifestPath = await registerNativeHost(platform, hostPath, root, run);

  await mkdir(outDir, { recursive: true });
  const mcpConfigPath = path.join(outDir, "mcp-config.json");
  const mcpConfig = {
    mcpServers: {
      "firefox-tabs": {
        command: "node",
        args: [serverPath],
      },
    },
  };
  await atomicWriteFile(mcpConfigPath, `${JSON.stringify(mcpConfig, null, 2)}\n`, 0o600, platform);

  const codexShellPath = path.join(outDir, "add-to-codex.sh");
  const codexPowerShellPath = path.join(outDir, "add-to-codex.ps1");
  const shellQuote = (value: string): string => `'${value.replaceAll("'", `'"'"'`)}'`;
  const shellCommand = `codex mcp add firefox-tabs -- node ${shellQuote(serverPath)}`;
  const powerShellCommand = `codex mcp add firefox-tabs -- node '${serverPath.replaceAll("'", "''")}'`;
  await atomicWriteFile(codexShellPath, `#!/bin/sh\nexec ${shellCommand}\n`, 0o700, platform);
  await atomicWriteFile(codexPowerShellPath, `${powerShellCommand}\n`, 0o600, platform);
  await chmod(codexShellPath, 0o700);

  return {
    version: APP_VERSION,
    configRoot: root,
    configCreated,
    tokenPreserved,
    migratedLegacyToken,
    manifestPath,
    mcpConfigPath,
    serverPath,
    codexShellPath,
    codexPowerShellPath,
  };
}

async function registerNativeHost(
  platform: PlatformInfo,
  hostPath: string,
  root: string,
  run: CommandRunner,
): Promise<string> {
  const wrapperDir = path.join(root, "native-host");
  await mkdir(wrapperDir, { recursive: true });
  if (platform.platform === "win32") {
    const wrapperPath = path.join(wrapperDir, `${NATIVE_HOST_NAME}.cmd`);
    const nodeBinary = process.execPath.replaceAll('"', '""');
    await writeFile(wrapperPath, `@echo off\r\n"${nodeBinary}" "${hostPath}" %*\r\n`, { encoding: "utf8" });
    const manifestPath = path.join(root, "native-manifests");
    await mkdir(manifestPath, { recursive: true });
    const manifestFile = path.join(manifestPath, `${NATIVE_HOST_NAME}.json`);
    await writeFile(manifestFile, `${JSON.stringify(nativeHostManifest(wrapperPath), null, 2)}\n`, {
      encoding: "utf8",
    });
    await run("reg", [
      "add",
      `HKCU\\Software\\Mozilla\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`,
      "/ve",
      "/t",
      "REG_SZ",
      "/d",
      manifestFile,
      "/f",
    ]);
    return manifestFile;
  }

  const wrapperPath = path.join(wrapperDir, `${NATIVE_HOST_NAME}.sh`);
  const nodeBinary = process.execPath.replaceAll("'", `'"'"'`);
  await atomicWriteFile(
    wrapperPath,
    `#!/bin/sh\nexec '${nodeBinary}' '${hostPath}' "$@"\n`,
    0o700,
    platform,
  );
  await chmod(wrapperPath, 0o700);

  const manifestPath = nativeHostManifestPath(platform);
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await atomicWriteFile(
    manifestPath,
    `${JSON.stringify(nativeHostManifest(wrapperPath), null, 2)}\n`,
    0o600,
    platform,
  );
  return manifestPath;
}

export function setupReport(result: SetupResult): string {
  const tokenState = result.configCreated
    ? "created a new local secret"
    : result.migratedLegacyToken
      ? "migrated the existing token from .local/bridge-token.txt"
      : "preserved the existing local secret";
  return [
    `Agent Bridge for Tab Management in Firefox ${result.version} setup`,
    `Local bridge configuration: ${result.configRoot} (${tokenState})`,
    `Native Messaging host registered: ${result.manifestPath}`,
    `Generic MCP configuration: ${result.mcpConfigPath}`,
    ``,
    `Next steps:`,
    `1. Install the Firefox extension (Gecko ID ${EXTENSION_ID}); it auto-detects this configuration.`,
    `2. Start the MCP server: node ${result.serverPath}`,
    `3. Point your MCP client at the server; no token is needed in the client configuration.`,
  ].join("\n");
}

export async function runDoctor(options: SetupOptions = {}): Promise<DoctorResult> {
  const platform = options.platform ?? platformForCLI();
  const root = options.configRoot ?? configRoot(platform);
  const checks: DoctorCheck[] = [];
  const push = (name: string, ok: boolean, detail: string, warning = false): void => {
    checks.push({ name, ok, detail, ...(warning ? { warning: true } : {}) });
  };

  let dirOk = false;
  try {
    dirOk = (await stat(root)).isDirectory();
  } catch {
    dirOk = false;
  }
  push("config directory", dirOk, dirOk ? root : `${root} (missing)`);

  let config: BridgeConfig | undefined;
  try {
    config = await loadBridgeConfig(root);
    push("config file", true, configFilePath(root));
  } catch (error) {
    const code = error instanceof FirefoxTabsError ? error.code : "CONFIG_INVALID";
    push("config file", false, `bridge.json (${code})`);
  }
  if (config !== undefined) {
    push(
      "protocol version",
      config.protocolVersion === BRIDGE_PROTOCOL_VERSION,
      `protocol version ${config.protocolVersion}`,
    );
    const portOk = config.port >= 1 && config.port <= 65535;
    push("bridge port", portOk, `port ${config.port}`, portOk && config.port !== DEFAULT_BRIDGE_PORT);
    push("token", config.token.length >= MIN_TOKEN_LENGTH, `present (${config.token.length} characters)`);
    if (platform.platform !== "win32") {
      let mode = 0;
      try {
        mode = (await stat(configFilePath(root))).mode & 0o777;
      } catch {
        mode = 0;
      }
      push("config file permissions", mode === 0o600, `mode ${mode.toString(8).padStart(3, "0")}`);
    }
  }

  const registration = await verifyHostRegistration(platform);
  const manifestPath = nativeHostManifestPath(platform);
  push("native host manifest", registration.ok, registration.ok ? manifestPath : registration.reason);

  let hostPath = "";
  let hostOk = false;
  if (platform.platform === "win32") {
    try {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { path?: unknown };
      hostPath = typeof manifest.path === "string" ? manifest.path : "";
      hostOk = hostPath.length > 0 && (await stat(hostPath).then((info) => info.isFile()).catch(() => false));
    } catch {
      hostOk = false;
    }
  } else {
    try {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { path?: unknown };
      hostPath = typeof manifest.path === "string" ? manifest.path : "";
      if (hostPath.length > 0) {
        const info = await stat(hostPath).catch(() => undefined);
        hostOk = info !== undefined && info.isFile() && (info.mode & 0o111) !== 0;
      }
    } catch {
      hostOk = false;
    }
  }
  push("host executable", hostOk, hostOk ? hostPath : hostPath.length > 0 ? `${hostPath} (missing or not executable)` : "no path in manifest");

  const env = platform.env;
  const tokenOverride = typeof env[TOKEN_ENV] === "string" ? "set (overrides the config file)" : "not set";
  const portOverride = typeof env[PORT_ENV] === "string" ? "set" : "not set";
  push("environment overrides", true, `${TOKEN_ENV}: ${tokenOverride}; ${PORT_ENV}: ${portOverride}`);

  let brokerPort = DEFAULT_BROKER_PORT;
  try {
    brokerPort = resolveBrokerPort(env);
    push("broker port", brokerPort >= 1 && brokerPort <= 65535, `port ${brokerPort}`);
  } catch (error) {
    push("broker port", false, error instanceof Error ? error.message : "invalid");
  }

  return { checks };
}

export function doctorReport(result: DoctorResult): string {
  const lines = [`Agent Bridge for Tab Management in Firefox doctor`, `Config root override: ${CONFIG_DIR_ENV}`];
  for (const check of result.checks) {
    const mark = check.ok ? "[ok]  " : check.warning ? "[warn]" : "[fail]";
    lines.push(`${mark} ${check.name}: ${check.detail}`);
  }
  const failed = result.checks.some((check) => !check.ok && !check.warning);
  lines.push(failed ? "Result: problems found." : "Result: all checks passed.");
  return lines.join("\n");
}

export async function runUninstall(options: UninstallOptions): Promise<UninstallResult> {
  const platform = options.platform ?? platformForCLI();
  const root = options.configRoot ?? configRoot(platform);
  const run = options.run ?? runCommand;
  const manifestPath = nativeHostManifestPath(platform);

  let manifestRemoved = false;
  if (platform.platform === "win32") {
    try {
      await run("reg", [
        "delete",
        `HKCU\\Software\\Mozilla\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`,
        "/f",
      ]);
    } catch {
      // The registry key may not exist; uninstallation still proceeds.
    }
  }
  try {
    const info = await stat(manifestPath);
    if (info.isFile()) {
      if (path.basename(manifestPath) !== `${NATIVE_HOST_NAME}.json`) {
        throw new FirefoxTabsError(
          "UNINSTALL_ABORTED",
          `Refusing to remove ${manifestPath}: unexpected file name.`,
        );
      }
      await unlink(manifestPath);
      manifestRemoved = true;
    }
  } catch (error) {
    if (error instanceof FirefoxTabsError) throw error;
  }

  let configDirRemoved = false;
  if (options.purge) {
    const expected = path.resolve(root);
    const home = path.resolve(platform.home);
    const packageRoot = options.packageRoot ?? undefined;
    if (expected === home || expected === path.parse(expected).root || (packageRoot !== undefined && expected === path.resolve(packageRoot))) {
      throw new FirefoxTabsError(
        "UNINSTALL_ABORTED",
        `Refusing to remove ${expected}: the resolved config path is a protected directory.`,
      );
    }
    let markerOk = false;
    try {
      markerOk = (await stat(path.join(expected, BRIDGE_CONFIG_FILE))).isFile();
    } catch {
      markerOk = false;
    }
    if (!markerOk) {
      throw new FirefoxTabsError(
        "UNINSTALL_ABORTED",
        `Refusing to remove ${expected}: ${BRIDGE_CONFIG_FILE} was not found at the exact expected path.`,
      );
    }
    await rm(expected, { recursive: true, force: true });
    configDirRemoved = true;
  }

  return { manifestRemoved, manifestPath, configDirRemoved };
}

export function uninstallReport(result: UninstallResult, purge: boolean): string {
  const lines = ["Agent Bridge for Tab Management in Firefox uninstall"];
  if (result.manifestRemoved) {
    lines.push(`Native Messaging host registration removed: ${result.manifestPath}`);
  } else {
    lines.push(`Native Messaging host registration not present: ${result.manifestPath}`);
  }
  if (purge) {
    lines.push(
      result.configDirRemoved
        ? "Local bridge configuration removed (--purge)."
        : "Local bridge configuration not found or not removed.",
    );
  } else {
    lines.push("Local bridge configuration and token kept. Re-run with --purge to remove them.");
  }
  return lines.join("\n");
}

export function usageReport(): string {
  return [
    `Agent Bridge for Tab Management in Firefox ${APP_VERSION}`,
    ``,
    `Usage:`,
    `  firefox-tab-management-agent-mcp            Start the MCP stdio server (default)`,
    `  firefox-tab-management-agent-mcp setup      Create or repair the local configuration and native host`,
    `  firefox-tab-management-agent-mcp doctor     Check the local configuration and native host`,
    `  firefox-tab-management-agent-mcp uninstall  Remove the native host registration (keeps the token)`,
    `  firefox-tab-management-agent-mcp uninstall --purge  Also delete the local configuration`,
    ``,
    `The token is created and managed automatically; it never appears in commands, logs, or client config.`,
  ].join("\n");
}
