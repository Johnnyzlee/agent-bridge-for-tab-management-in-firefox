import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FirefoxTabsError } from "../shared/errors.js";
import {
  BRIDGE_CONFIG_FILE,
  CONFIG_DIR_ENV,
  DEFAULT_BRIDGE_PORT,
  MIN_TOKEN_LENGTH,
  TOKEN_ENV,
  type BridgeConfig,
  type PlatformInfo,
  configFilePath,
  configRoot,
  generateBridgeToken,
  loadBridgeConfig,
  migrateLegacyToken,
  parseBridgeConfig,
  resolveBridgeOptions,
  saveBridgeConfig,
} from "../shared/config.js";
import { BRIDGE_PROTOCOL_VERSION } from "../shared/protocol.js";

const tempDirs: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "bridge-config-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function platform(overrides: Partial<PlatformInfo> = {}): PlatformInfo {
  return {
    platform: "darwin",
    home: path.join(os.tmpdir(), "fake-home"),
    env: {},
    ...overrides,
  };
}

function sampleConfig(token = generateBridgeToken()): BridgeConfig {
  return { protocolVersion: BRIDGE_PROTOCOL_VERSION, port: DEFAULT_BRIDGE_PORT, token };
}

describe("config paths", () => {
  it("resolves the macOS config root under Application Support", () => {
    const home = "/Users/tester";
    const root = configRoot(platform({ platform: "darwin", home }));
    expect(root).toBe(path.join(home, "Library", "Application Support", "Agent Bridge for Tab Management in Firefox"));
  });

  it("resolves the Linux config root from XDG_CONFIG_HOME", () => {
    const root = configRoot(
      platform({ platform: "linux", home: "/home/tester", env: { XDG_CONFIG_HOME: "/xdg" } }),
    );
    expect(root).toBe(path.join("/xdg", "agent-bridge-for-firefox"));
  });

  it("falls back to ~/.config on Linux without XDG_CONFIG_HOME", () => {
    const root = configRoot(platform({ platform: "linux", home: "/home/tester" }));
    expect(root).toBe(path.join("/home/tester", ".config", "agent-bridge-for-firefox"));
  });

  it("resolves the Windows config root from APPDATA", () => {
    const root = configRoot(platform({ platform: "win32", home: "C:\\Users\\tester", env: { APPDATA: "C:\\Users\\tester\\AppData\\Roaming" } }));
    expect(root).toBe(path.join("C:\\Users\\tester\\AppData\\Roaming", "Agent Bridge for Tab Management in Firefox"));
  });

  it("honors the FIREFOX_TABS_BRIDGE_CONFIG_DIR override on every platform", () => {
    const override = "/tmp/custom-bridge-root";
    for (const platformName of ["darwin", "linux", "win32"]) {
      expect(configRoot(platform({ platform: platformName, env: { [CONFIG_DIR_ENV]: override } }))).toBe(
        path.resolve(override),
      );
    }
  });

  it("rejects unsupported platforms", () => {
    expect(() => configRoot(platform({ platform: "freebsd" }))).toThrowError(FirefoxTabsError);
  });
});

describe("config persistence", () => {
  it("round-trips a config file with 0600 permissions on POSIX", async () => {
    const root = await tempDir();
    const config = sampleConfig();
    await saveBridgeConfig(root, config, platform({ platform: "darwin" }));
    expect(await loadBridgeConfig(root)).toEqual(config);
    const mode = (await stat(configFilePath(root))).mode & 0o777;
    expect(mode).toBe(0o600);
    const files = await readFile(configFilePath(root), "utf8");
    expect(files).toContain(`"port": ${DEFAULT_BRIDGE_PORT}`);
  });

  it("leaves no temporary file behind after an atomic write", async () => {
    const root = await tempDir();
    await saveBridgeConfig(root, sampleConfig(), platform());
    const entries = await import("node:fs/promises").then((fs) => fs.readdir(root));
    expect(entries).toEqual([BRIDGE_CONFIG_FILE]);
  });

  it("rejects missing, invalid, and version-incompatible configs", async () => {
    const root = await tempDir();
    await expect(loadBridgeConfig(root)).rejects.toMatchObject({ code: "CONFIG_NOT_FOUND" });

    await writeFile(configFilePath(root), "{ not json", "utf8");
    await expect(loadBridgeConfig(root)).rejects.toMatchObject({ code: "CONFIG_INVALID" });

    await writeFile(configFilePath(root), JSON.stringify({ protocolVersion: 999, port: 8765, token: "x".repeat(32) }), "utf8");
    await expect(loadBridgeConfig(root)).rejects.toMatchObject({ code: "CONFIG_VERSION_MISMATCH" });
  });

  it("rejects invalid config shapes at parse time", () => {
    expect(() => parseBridgeConfig(null)).toThrowError(FirefoxTabsError);
    expect(() => parseBridgeConfig([])).toThrowError(FirefoxTabsError);
    expect(() => parseBridgeConfig({ protocolVersion: BRIDGE_PROTOCOL_VERSION, port: 0, token: "x".repeat(32) })).toThrowError(
      FirefoxTabsError,
    );
    expect(() => parseBridgeConfig({ protocolVersion: BRIDGE_PROTOCOL_VERSION, port: 8765, token: "short" })).toThrowError(
      FirefoxTabsError,
    );
  });

  it("generates 32 random bytes as a hex token, never repeating", () => {
    const first = generateBridgeToken();
    const second = generateBridgeToken();
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toBe(second);
  });
});

describe("legacy token migration", () => {
  it("migrates a v0.3.1 .local token when no config exists", async () => {
    const root = await tempDir();
    const legacy = path.join(root, ".local", "bridge-token.txt");
    await mkdir(path.dirname(legacy), { recursive: true });
    const legacyToken = "legacy".padEnd(32, "0");
    await writeFile(legacy, `${legacyToken}\n`, "utf8");

    const migrated = await migrateLegacyToken(root, legacy, platform());
    expect(migrated).toBe(true);
    const config = await loadBridgeConfig(root);
    expect(config.token).toBe(legacyToken);
    expect(config.port).toBe(DEFAULT_BRIDGE_PORT);
  });

  it("keeps an existing config untouched by migration", async () => {
    const root = await tempDir();
    const existing = sampleConfig();
    await saveBridgeConfig(root, existing, platform());
    const legacy = path.join(root, ".local", "bridge-token.txt");
    await mkdir(path.dirname(legacy), { recursive: true });
    await writeFile(legacy, `${"x".repeat(32)}\n`, "utf8");

    expect(await migrateLegacyToken(root, legacy, platform())).toBe(false);
    expect((await loadBridgeConfig(root)).token).toBe(existing.token);
  });

  it("returns false when the legacy token file is missing or too short", async () => {
    const root = await tempDir();
    expect(await migrateLegacyToken(root, path.join(root, "missing.txt"), platform())).toBe(false);
    const short = path.join(root, "short.txt");
    await writeFile(short, "short", "utf8");
    expect(await migrateLegacyToken(root, short, platform())).toBe(false);
  });
});

describe("bridge option resolution", () => {
  it("prefers explicit environment variables over the config file", async () => {
    const root = await tempDir();
    const config = sampleConfig("config-token".padEnd(32, "c"));
    await saveBridgeConfig(root, config, platform());
    const envToken = "env-token".padEnd(32, "e");
    const resolved = await resolveBridgeOptions(
      { [TOKEN_ENV]: envToken, FIREFOX_TABS_BRIDGE_PORT: "9000" },
      platform({ env: { [CONFIG_DIR_ENV]: root } }),
    );
    expect(resolved).toEqual({ port: 9000, token: envToken, source: "env" });
  });

  it("reads the port and token from the config file by default", async () => {
    const root = await tempDir();
    const config = sampleConfig();
    await saveBridgeConfig(root, config, platform());
    const resolved = await resolveBridgeOptions({}, platform({ env: { [CONFIG_DIR_ENV]: root } }));
    expect(resolved).toEqual({ port: config.port, token: config.token, source: "config" });
  });

  it("overrides only the port when only FIREFOX_TABS_BRIDGE_PORT is set", async () => {
    const root = await tempDir();
    const config = sampleConfig();
    await saveBridgeConfig(root, config, platform());
    const info = platform({ env: { [CONFIG_DIR_ENV]: root } });
    await expect(resolveBridgeOptions({ FIREFOX_TABS_BRIDGE_PORT: "9100" }, info)).resolves.toEqual({
      port: 9100,
      token: config.token,
      source: "config",
    });
  });

  it("errors with a setup hint when nothing is configured", async () => {
    const root = await tempDir();
    await expect(resolveBridgeOptions({}, platform({ env: { [CONFIG_DIR_ENV]: root } }))).rejects.toMatchObject({
      code: "CONFIG_NOT_FOUND",
    });
  });

  it("rejects a too-short environment token", async () => {
    await expect(resolveBridgeOptions({ [TOKEN_ENV]: "short" }, platform())).rejects.toMatchObject({
      code: "INVALID_TOKEN",
    });
  });

  it("rejects an invalid environment port regardless of the token source", async () => {
    const root = await tempDir();
    const config = sampleConfig();
    await saveBridgeConfig(root, config, platform());
    const info = platform({ env: { [CONFIG_DIR_ENV]: root } });
    await expect(
      resolveBridgeOptions({ [TOKEN_ENV]: "x".repeat(32), FIREFOX_TABS_BRIDGE_PORT: "nope" }, info),
    ).rejects.toMatchObject({ code: "INVALID_PORT" });
    await expect(resolveBridgeOptions({ FIREFOX_TABS_BRIDGE_PORT: "nope" }, info)).rejects.toMatchObject({
      code: "INVALID_PORT",
    });
    await expect(resolveBridgeOptions({}, info)).resolves.toEqual({
      port: config.port,
      token: config.token,
      source: "config",
    });
  });

  it("never exposes the token in error objects", async () => {
    const token = "secret-token-value-1234567890";
    const root = await tempDir();
    await writeFile(
      configFilePath(root),
      JSON.stringify({ protocolVersion: 999, port: 8765, token }),
      "utf8",
    );
    try {
      await loadBridgeConfig(root);
      expect.unreachable("should not parse");
    } catch (error) {
      const serialized = JSON.stringify(error);
      expect(serialized).not.toContain(token);
      expect(error).toMatchObject({ code: "CONFIG_VERSION_MISMATCH" });
    }
  });
});

describe("token length guard", () => {
  it("treats the legacy 16-character minimum as the acceptance threshold", () => {
    expect(MIN_TOKEN_LENGTH).toBe(16);
  });
});
