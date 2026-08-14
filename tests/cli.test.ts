import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EXTENSION_ID, NATIVE_HOST_NAME, configFilePath, loadBridgeConfig } from "../shared/config.js";
import {
  doctorReport,
  runDoctor,
  runSetup,
  runUninstall,
  setupReport,
  uninstallReport,
  usageReport,
} from "../cli/commands.js";

const tempDirs: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "bridge-cli-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

interface SetupFixture {
  platformName: string;
  home: string;
  configRoot: string;
  packageRoot: string;
  outDir: string;
  legacyTokenPath: string;
}

async function fixture(platformName: string): Promise<SetupFixture> {
  const base = await tempDir();
  const home = path.join(base, "home");
  const packageRoot = path.join(base, "package");
  await mkdir(path.join(packageRoot, "dist", "native-host"), { recursive: true });
  await mkdir(path.join(packageRoot, "dist", "server"), { recursive: true });
  const env: Record<string, string | undefined> = {};
  if (platformName === "win32") env.APPDATA = path.join(home, "AppData", "Roaming");
  const platform = { platform: platformName, home, env };
  const { configRoot: configRootOf } = await import("../shared/config.js");
  const configRoot = configRootOf(platform);
  const outDir = path.join(packageRoot, ".local");
  return {
    platformName,
    home,
    configRoot,
    packageRoot,
    outDir,
    legacyTokenPath: path.join(packageRoot, ".local", "bridge-token.txt"),
  };
}

async function defaultSetup(f: SetupFixture): Promise<ReturnType<typeof runSetup>> {
  const hostPath = path.join(f.packageRoot, "dist", "native-host", "index.js");
  await writeFile(hostPath, "#!/usr/bin/env node\n", { mode: 0o755 });
  const platform = {
    platform: f.platformName,
    home: f.home,
    env: f.platformName === "win32" ? { APPDATA: path.join(f.home, "AppData", "Roaming") } : {},
  };
  const regCalls: Array<{ command: string; args: string[] }> = [];
  const run = async (command: string, args: string[]): Promise<void> => {
    regCalls.push({ command, args });
  };
  const result = await runSetup({
    platform,
    configRoot: f.configRoot,
    packageRoot: f.packageRoot,
    outDir: f.outDir,
    legacyTokenPath: f.legacyTokenPath,
    run,
  });
  return result;
}

describe("setup", () => {
  it("creates a secure token and config on first run, and keeps it on rerun", async () => {
    const f = await fixture("darwin");
    const first = await defaultSetup(f);
    expect(first.configCreated).toBe(true);

    const config = await loadBridgeConfig(f.configRoot);
    expect(config.token).toMatch(/^[0-9a-f]{64}$/);
    expect(config.port).toBe(8765);
    const mode = (await stat(configFilePath(f.configRoot))).mode & 0o777;
    expect(mode).toBe(0o600);

    const second = await defaultSetup(f);
    expect(second.configCreated).toBe(false);
    expect(second.tokenPreserved).toBe(true);
    expect((await loadBridgeConfig(f.configRoot)).token).toBe(config.token);
  });

  it("migrates a v0.3.1 .local/bridge-token.txt into the new config", async () => {
    const f = await fixture("darwin");
    const legacyToken = "legacy-v031-token".padEnd(32, "0");
    await mkdir(path.dirname(f.legacyTokenPath), { recursive: true });
    await writeFile(f.legacyTokenPath, `${legacyToken}\n`, "utf8");

    const result = await defaultSetup(f);
    expect(result.migratedLegacyToken).toBe(true);
    expect((await loadBridgeConfig(f.configRoot)).token).toBe(legacyToken);
  });

  it("writes a token-free generic MCP configuration and codex helpers", async () => {
    const f = await fixture("linux");
    await defaultSetup(f);

    const mcpConfig = await readFile(path.join(f.outDir, "mcp-config.json"), "utf8");
    expect(mcpConfig).not.toContain("FIREFOX_TABS_BRIDGE_TOKEN");
    expect(mcpConfig).not.toContain("env");
    expect(mcpConfig).toContain("firefox-tabs");
    const config = await loadBridgeConfig(f.configRoot);
    expect(mcpConfig).not.toContain(config.token);

    const shellHelper = await readFile(path.join(f.outDir, "add-to-codex.sh"), "utf8");
    expect(shellHelper).toContain("codex mcp add firefox-tabs");
    expect(shellHelper).not.toContain(config.token);
    expect(shellHelper).not.toContain("--env");

    const powerShellHelper = await readFile(path.join(f.outDir, "add-to-codex.ps1"), "utf8");
    expect(powerShellHelper).not.toContain(config.token);
  });

  it("registers a native messaging manifest with only the signed extension ID", async () => {
    const f = await fixture("darwin");
    await defaultSetup(f);
    const manifestPath = path.join(
      f.home,
      "Library",
      "Application Support",
      "Mozilla",
      "NativeMessagingHosts",
      `${NATIVE_HOST_NAME}.json`,
    );
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
    expect(manifest.name).toBe(NATIVE_HOST_NAME);
    expect(manifest.type).toBe("stdio");
    expect(manifest.allowed_extensions).toEqual([EXTENSION_ID]);
    const launcherPath = manifest.path as string;
    expect(path.isAbsolute(launcherPath)).toBe(true);
    expect(launcherPath.endsWith(".sh")).toBe(true);
    const mode = (await stat(launcherPath)).mode & 0o777;
    expect(mode).toBe(0o700);
    const launcher = await readFile(launcherPath, "utf8");
    expect(launcher).toContain(path.join(f.packageRoot, "dist", "native-host", "index.js"));
    expect(launcher).toContain("exec");
    const manifestMode = (await stat(manifestPath)).mode & 0o777;
    expect(manifestMode).toBe(0o600);
  });

  it("registers on Linux under ~/.mozilla/native-messaging-hosts", async () => {
    const f = await fixture("linux");
    await defaultSetup(f);
    const manifestPath = path.join(f.home, ".mozilla", "native-messaging-hosts", `${NATIVE_HOST_NAME}.json`);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
    expect(manifest.allowed_extensions).toEqual([EXTENSION_ID]);
    expect((manifest.path as string).endsWith(".sh")).toBe(true);
  });

  it("registers on Windows through the user-level registry and a .cmd wrapper", async () => {
    const f = await fixture("win32");
    const platform = {
      platform: "win32",
      home: f.home,
      env: { APPDATA: path.join(f.home, "AppData", "Roaming") },
    };
    const regCalls: Array<{ command: string; args: string[] }> = [];
    const run = async (command: string, args: string[]): Promise<void> => {
      regCalls.push({ command, args });
    };
    await runSetup({
      platform,
      configRoot: f.configRoot,
      packageRoot: f.packageRoot,
      outDir: f.outDir,
      legacyTokenPath: f.legacyTokenPath,
      run,
    });

    expect(regCalls).toEqual([
      {
        command: "reg",
        args: [
          "add",
          `HKCU\\Software\\Mozilla\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`,
          "/ve",
          "/t",
          "REG_SZ",
          "/d",
          path.join(f.configRoot, "native-manifests", `${NATIVE_HOST_NAME}.json`),
          "/f",
        ],
      },
    ]);
    const manifest = JSON.parse(
      await readFile(path.join(f.configRoot, "native-manifests", `${NATIVE_HOST_NAME}.json`), "utf8"),
    ) as Record<string, unknown>;
    expect(manifest.allowed_extensions).toEqual([EXTENSION_ID]);
    expect((manifest.path as string).endsWith(".cmd")).toBe(true);
    const wrapper = await readFile(manifest.path as string, "utf8");
    expect(wrapper).toContain(path.join(f.packageRoot, "dist", "native-host", "index.js"));
  });

  it("reports never contain the token", async () => {
    const f = await fixture("darwin");
    const result = await defaultSetup(f);
    const config = await loadBridgeConfig(f.configRoot);
    expect(setupReport(result)).not.toContain(config.token);
  });
});

describe("doctor", () => {
  it("reports every check as passing after a healthy setup, without leaking the token", async () => {
    const f = await fixture("darwin");
    await defaultSetup(f);
    const result = await runDoctor({
      platform: { platform: "darwin", home: f.home, env: {} },
      configRoot: f.configRoot,
    });
    expect(result.checks.every((check) => check.ok)).toBe(true);
    const report = doctorReport(result);
    expect(report).not.toContain((await loadBridgeConfig(f.configRoot)).token);
    expect(report).toContain("all checks passed");
  });

  it("flags a corrupt config and a missing manifest", async () => {
    const f = await fixture("darwin");
    const platform = { platform: "darwin", home: f.home, env: {} };
    await mkdir(f.configRoot, { recursive: true });
    await writeFile(configFilePath(f.configRoot), "{ broken", "utf8");
    const result = await runDoctor({ platform, configRoot: f.configRoot });
    const names = Object.fromEntries(result.checks.map((check) => [check.name, check.ok]));
    expect(names["config file"]).toBe(false);
    expect(names["native host manifest"]).toBe(false);
    expect(result.checks.some((check) => !check.ok && !check.warning)).toBe(true);
  });

  it("reports env overrides without their values", async () => {
    const f = await fixture("darwin");
    await defaultSetup(f);
    const result = await runDoctor({
      platform: { platform: "darwin", home: f.home, env: { FIREFOX_TABS_BRIDGE_TOKEN: "a-secret-env-token-value" } },
      configRoot: f.configRoot,
    });
    const report = doctorReport(result);
    expect(report).toContain("FIREFOX_TABS_BRIDGE_TOKEN: set (overrides the config file)");
    expect(report).not.toContain("a-secret-env-token-value");
  });
});

describe("uninstall", () => {
  it("removes the native host registration but keeps the config and token by default", async () => {
    const f = await fixture("darwin");
    await defaultSetup(f);
    const result = await runUninstall({
      platform: { platform: "darwin", home: f.home, env: {} },
      configRoot: f.configRoot,
      purge: false,
    });
    expect(result.manifestRemoved).toBe(true);
    const manifestPath = path.join(
      f.home,
      "Library",
      "Application Support",
      "Mozilla",
      "NativeMessagingHosts",
      `${NATIVE_HOST_NAME}.json`,
    );
    await expect(stat(manifestPath)).rejects.toThrow();
    expect(await loadBridgeConfig(f.configRoot)).toBeTruthy();
    expect(uninstallReport(result, false)).toContain("kept");
  });

  it("removes the exact config directory only with --purge and a bridge.json marker", async () => {
    const f = await fixture("darwin");
    await defaultSetup(f);
    const result = await runUninstall({
      platform: { platform: "darwin", home: f.home, env: {} },
      configRoot: f.configRoot,
      purge: true,
    });
    expect(result.configDirRemoved).toBe(true);
    await expect(stat(f.configRoot)).rejects.toThrow();
  });

  it("refuses to purge a directory without the bridge.json marker", async () => {
    const f = await fixture("darwin");
    await mkdir(f.configRoot, { recursive: true });
    await writeFile(path.join(f.configRoot, "other.txt"), "unrelated", "utf8");
    await expect(
      runUninstall({
        platform: { platform: "darwin", home: f.home, env: {} },
        configRoot: f.configRoot,
        purge: true,
      }),
    ).rejects.toMatchObject({ code: "UNINSTALL_ABORTED" });
    await expect(stat(f.configRoot)).resolves.toBeTruthy();
  });

  it("removes the Windows registry key and manifest during uninstall", async () => {
    const f = await fixture("win32");
    const platform = { platform: "win32", home: f.home, env: { APPDATA: path.join(f.home, "AppData", "Roaming") } };
    const setupRegCalls: Array<{ command: string; args: string[] }> = [];
    const setupRun = async (command: string, args: string[]): Promise<void> => {
      setupRegCalls.push({ command, args });
    };
    await runSetup({
      platform,
      configRoot: f.configRoot,
      packageRoot: f.packageRoot,
      outDir: f.outDir,
      legacyTokenPath: f.legacyTokenPath,
      run: setupRun,
    });
    expect(setupRegCalls).toHaveLength(1);
    const regCalls: Array<{ command: string; args: string[] }> = [];
    const run = async (command: string, args: string[]): Promise<void> => {
      regCalls.push({ command, args });
    };
    const result = await runUninstall({ platform, configRoot: f.configRoot, purge: false, run });
    expect(regCalls).toEqual([
      {
        command: "reg",
        args: ["delete", `HKCU\\Software\\Mozilla\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`, "/f"],
      },
    ]);
    expect(result.manifestRemoved).toBe(true);
  });
});

describe("usage", () => {
  it("documents subcommands without any token value", () => {
    const report = usageReport();
    expect(report).toContain("setup");
    expect(report).toContain("doctor");
    expect(report).toContain("uninstall");
    expect(report).not.toContain("TOKEN=");
  });
});
