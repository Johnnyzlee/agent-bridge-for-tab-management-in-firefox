import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FirefoxTabsError } from "./errors.js";
import { BRIDGE_PROTOCOL_VERSION } from "./protocol.js";

export const EXTENSION_ID = "firefox-tabs-mcp@local.invalid";
export const NATIVE_HOST_NAME = "firefox_tabs_agent_bridge";
export const DEFAULT_BRIDGE_PORT = 8765;
export const MIN_TOKEN_LENGTH = 16;
export const BRIDGE_CONFIG_FILE = "bridge.json";
export const CONFIG_DIR_ENV = "FIREFOX_TABS_BRIDGE_CONFIG_DIR";
export const TOKEN_ENV = "FIREFOX_TABS_BRIDGE_TOKEN";
export const PORT_ENV = "FIREFOX_TABS_BRIDGE_PORT";

export interface PlatformInfo {
  platform: string;
  home: string;
  env: Record<string, string | undefined>;
}

export interface BridgeConfig {
  protocolVersion: typeof BRIDGE_PROTOCOL_VERSION;
  port: number;
  token: string;
}

export type CommandRunner = (command: string, args: string[]) => Promise<void>;

export function platformForCLI(): PlatformInfo {
  return {
    platform: process.platform,
    home: os.homedir(),
    env: process.env as Record<string, string | undefined>,
  };
}

export function configRoot(platform: PlatformInfo): string {
  const override = platform.env[CONFIG_DIR_ENV];
  if (typeof override === "string" && override.trim().length > 0) {
    return path.resolve(override);
  }
  switch (platform.platform) {
    case "darwin":
      return path.join(
        platform.home,
        "Library",
        "Application Support",
        "Agent Bridge for Tab Management in Firefox",
      );
    case "linux": {
      const xdg = platform.env.XDG_CONFIG_HOME;
      const base = typeof xdg === "string" && xdg.trim().length > 0 ? xdg : path.join(platform.home, ".config");
      return path.join(base, "agent-bridge-for-firefox");
    }
    case "win32": {
      const appData = platform.env.APPDATA;
      const base =
        typeof appData === "string" && appData.trim().length > 0 ? appData : path.join(platform.home, "AppData", "Roaming");
      return path.join(base, "Agent Bridge for Tab Management in Firefox");
    }
    default:
      throw new FirefoxTabsError("UNSUPPORTED_PLATFORM", `Platform ${JSON.stringify(platform.platform)} is not supported.`);
  }
}

export function configFilePath(root: string): string {
  return path.join(root, BRIDGE_CONFIG_FILE);
}

export function generateBridgeToken(): string {
  return randomBytes(32).toString("hex");
}

export function parseBridgeConfig(raw: unknown): BridgeConfig {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new FirefoxTabsError("CONFIG_INVALID", "bridge.json must contain a JSON object.");
  }
  const value = raw as Record<string, unknown>;
  if (value.protocolVersion !== BRIDGE_PROTOCOL_VERSION) {
    throw new FirefoxTabsError(
      "CONFIG_VERSION_MISMATCH",
      `bridge.json declares protocol version ${JSON.stringify(value.protocolVersion)}, expected ${BRIDGE_PROTOCOL_VERSION}. Re-run setup.`,
    );
  }
  if (!Number.isInteger(value.port) || (value.port as number) < 1 || (value.port as number) > 65535) {
    throw new FirefoxTabsError("CONFIG_INVALID", "bridge.json port must be an integer between 1 and 65535.");
  }
  if (typeof value.token !== "string" || value.token.length < MIN_TOKEN_LENGTH) {
    throw new FirefoxTabsError("CONFIG_INVALID", "bridge.json token is missing or shorter than 16 characters.");
  }
  return { protocolVersion: BRIDGE_PROTOCOL_VERSION, port: value.port as number, token: value.token };
}

export async function saveBridgeConfig(root: string, config: BridgeConfig, platform: PlatformInfo): Promise<void> {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const content = `${JSON.stringify(config, null, 2)}\n`;
  if (platform.platform === "win32") {
    await writeFile(configFilePath(root), content, { encoding: "utf8" });
    return;
  }
  await atomicWrite(configFilePath(root), content, 0o600);
}

async function atomicWrite(filePath: string, content: string, mode: number): Promise<void> {
  const tmpPath = `${filePath}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(tmpPath, content, { encoding: "utf8", mode });
    await rename(tmpPath, filePath);
    await chmod(filePath, mode);
  } catch (error) {
    await unlink(tmpPath).catch(() => undefined);
    throw error;
  }
}

export async function loadBridgeConfig(root: string): Promise<BridgeConfig> {
  let raw: string;
  try {
    raw = await readFile(configFilePath(root), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new FirefoxTabsError(
        "CONFIG_NOT_FOUND",
        "No local bridge configuration found. Run `npm run setup` (or `firefox-tab-management-agent-mcp setup`) to create it.",
      );
    }
    throw new FirefoxTabsError("CONFIG_INVALID", "The bridge configuration file could not be read.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new FirefoxTabsError("CONFIG_INVALID", "bridge.json is not valid JSON. Re-run setup.");
  }
  return parseBridgeConfig(parsed);
}

export async function resolveBridgeOptions(
  env: Record<string, string | undefined>,
  platform: PlatformInfo,
): Promise<{ port: number; token: string; source: "env" | "config" }> {
  const envToken = env[TOKEN_ENV];
  if (typeof envToken === "string" && envToken.length >= MIN_TOKEN_LENGTH) {
    const envPort = env[PORT_ENV];
    const port =
      typeof envPort === "string" && envPort.trim().length > 0 ? validatePort(envPort, "FIREFOX_TABS_BRIDGE_PORT") : DEFAULT_BRIDGE_PORT;
    return { port, token: envToken, source: "env" };
  }
  if (typeof envToken === "string") {
    throw new FirefoxTabsError("INVALID_TOKEN", `${TOKEN_ENV} must contain at least 16 characters.`);
  }
  const config = await loadBridgeConfig(configRoot(platform));
  const envPort = env[PORT_ENV];
  const port =
    typeof envPort === "string" && envPort.trim().length > 0 ? validatePort(envPort, "FIREFOX_TABS_BRIDGE_PORT") : config.port;
  return { port, token: config.token, source: "config" };
}

function validatePort(raw: string, name: string): number {
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new FirefoxTabsError("INVALID_PORT", `${name} must be an integer between 1 and 65535.`);
  }
  return port;
}

export async function migrateLegacyToken(root: string, legacyTokenPath: string, platform: PlatformInfo): Promise<boolean> {
  try {
    await loadBridgeConfig(root);
    return false;
  } catch (error) {
    if (error instanceof FirefoxTabsError && error.code !== "CONFIG_NOT_FOUND") {
      throw error;
    }
  }
  let legacy = "";
  try {
    legacy = (await readFile(legacyTokenPath, "utf8")).trim();
  } catch {
    return false;
  }
  if (legacy.length < MIN_TOKEN_LENGTH) {
    return false;
  }
  await saveBridgeConfig(
    root,
    { protocolVersion: BRIDGE_PROTOCOL_VERSION, port: DEFAULT_BRIDGE_PORT, token: legacy },
    platform,
  );
  return true;
}

export function nativeHostManifestPath(platform: PlatformInfo): string {
  const fileName = `${NATIVE_HOST_NAME}.json`;
  switch (platform.platform) {
    case "darwin":
      return path.join(platform.home, "Library", "Application Support", "Mozilla", "NativeMessagingHosts", fileName);
    case "linux":
      return path.join(platform.home, ".mozilla", "native-messaging-hosts", fileName);
    case "win32":
      return path.join(configRoot(platform), "native-manifests", fileName);
    default:
      throw new FirefoxTabsError("UNSUPPORTED_PLATFORM", `Platform ${JSON.stringify(platform.platform)} is not supported.`);
  }
}

export function nativeHostManifest(executablePath: string): Record<string, unknown> {
  return {
    name: NATIVE_HOST_NAME,
    description: "Supplies the local bridge configuration to the Tab Management Agent Bridge for Firefox extension.",
    path: executablePath,
    type: "stdio",
    allowed_extensions: [EXTENSION_ID],
  };
}

export async function verifyHostRegistration(platform: PlatformInfo): Promise<{ ok: boolean; reason: string }> {
  let raw: string;
  try {
    raw = await readFile(nativeHostManifestPath(platform), "utf8");
  } catch {
    return { ok: false, reason: "Native host manifest is not registered." };
  }
  let manifest: unknown;
  try {
    manifest = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "Native host manifest is not valid JSON." };
  }
  if (typeof manifest !== "object" || manifest === null) {
    return { ok: false, reason: "Native host manifest must be a JSON object." };
  }
  const allowed = (manifest as Record<string, unknown>).allowed_extensions;
  if (!Array.isArray(allowed) || allowed.length !== 1 || allowed[0] !== EXTENSION_ID) {
    return {
      ok: false,
      reason: `Native host manifest must authorize exactly ${EXTENSION_ID}.`,
    };
  }
  return { ok: true, reason: "Native host manifest authorizes the expected extension." };
}

export function runCommand(command: string, args: string[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with ${signal ?? `code ${code}`}.`));
    });
  });
}

export async function atomicWriteFile(
  filePath: string,
  content: string,
  mode: number,
  platform: PlatformInfo,
): Promise<void> {
  if (platform.platform === "win32") {
    await writeFile(filePath, content, { encoding: "utf8" });
    return;
  }
  await atomicWrite(filePath, content, mode);
}
