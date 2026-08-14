import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PlatformInfo } from "../shared/config.js";
import { EXTENSION_ID, NATIVE_HOST_NAME, nativeHostManifest, nativeHostManifestPath, saveBridgeConfig, generateBridgeToken } from "../shared/config.js";
import { BRIDGE_PROTOCOL_VERSION } from "../shared/protocol.js";
import { decodeFrame, encodeFrame, readFramedMessage, writeFramedMessage } from "../native-host/framing.js";
import { handleHostMessage, loadHostState, type HostState } from "../native-host/host.js";

const tempDirs: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "native-host-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function platformInfo(home: string, env: Record<string, string | undefined> = {}): PlatformInfo {
  return { platform: "darwin", home, env };
}

function validState(token = "test-token-".padEnd(32, "0")): HostState {
  return {
    config: { protocolVersion: BRIDGE_PROTOCOL_VERSION, port: 8765, token },
    configError: null,
    registrationOk: true,
    registrationReason: "ok",
  };
}

function errorResponseOf(response: Record<string, unknown>): { code: string; message: string } {
  return response as unknown as { code: string; message: string };
}

describe("native messaging framing", () => {
  it("round-trips a message with a correct little-endian length prefix", () => {
    const frame = encodeFrame({ type: "ping", protocolVersion: BRIDGE_PROTOCOL_VERSION });
    const body = Buffer.from(JSON.stringify({ type: "ping", protocolVersion: BRIDGE_PROTOCOL_VERSION }), "utf8");
    expect(frame.readUInt32LE(0)).toBe(body.length);
    expect(decodeFrame(frame)).toEqual({ type: "ping", protocolVersion: BRIDGE_PROTOCOL_VERSION });
  });

  it("rejects truncated headers and bodies", () => {
    const frame = encodeFrame({ type: "ping" });
    expect(() => decodeFrame(frame.subarray(0, 2))).toThrow(/header/);
    expect(() => decodeFrame(frame.subarray(0, frame.length - 1))).toThrow(/body/);
  });

  it("rejects oversized frames", () => {
    const buffer = Buffer.alloc(4);
    buffer.writeUInt32LE(2 * 1024 * 1024, 0);
    expect(() => decodeFrame(buffer)).toThrow(/size limit/);
  });

  it("reads a framed message from a stream and returns null at EOF", async () => {
    const frame = encodeFrame({ type: "ping" });
    const stream = new Readable();
    stream.push(frame);
    stream.push(null);
    expect(await readFramedMessage(stream, 1024 * 1024)).toEqual({ type: "ping" });
    expect(await readFramedMessage(stream, 1024 * 1024)).toBeNull();
  });

  it("writes framed output", () => {
    const chunks: Buffer[] = [];
    const sink = new (class {
      write(chunk: Buffer): void {
        chunks.push(Buffer.from(chunk));
      }
    })();
    const stream = sink as unknown as import("node:stream").Writable;
    writeFramedMessage(stream, { ok: true });
    const frame = Buffer.concat(chunks);
    expect(frame.readUInt32LE(0)).toBe(Buffer.from(JSON.stringify({ ok: true }), "utf8").length);
    expect(decodeFrame(frame)).toEqual({ ok: true });
  });
});

describe("native host message handling", () => {
  it("serves the bridge config with the shared secret to the authorized extension", () => {
    const token = generateBridgeToken();
    const response = handleHostMessage(
      { type: "get_bridge_config", protocolVersion: BRIDGE_PROTOCOL_VERSION },
      validState(token),
    );
    expect(response).toEqual({
      type: "bridge_config",
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      port: 8765,
      token,
    });
  });

  it("answers ping and get_status", () => {
    for (const type of ["ping", "get_status"]) {
      const response = handleHostMessage({ type, protocolVersion: BRIDGE_PROTOCOL_VERSION }, validState());
      expect(response).toMatchObject({ type: "status", ok: true, host: NATIVE_HOST_NAME });
    }
  });

  it("rejects unknown message types", () => {
    const response = handleHostMessage({ type: "steal_secrets", protocolVersion: BRIDGE_PROTOCOL_VERSION }, validState());
    expect(errorResponseOf(response).code).toBe("UNKNOWN_MESSAGE_TYPE");
    expect(JSON.stringify(response)).not.toContain("test-token");
  });

  it("rejects wrong protocol versions", () => {
    const response = handleHostMessage({ type: "get_bridge_config", protocolVersion: 999 }, validState());
    expect(errorResponseOf(response).code).toBe("PROTOCOL_VERSION_MISMATCH");
    expect(JSON.stringify(response)).not.toContain("test-token");
  });

  it("rejects non-object messages and missing types", () => {
    expect(errorResponseOf(handleHostMessage("ping", validState())).code).toBe("INVALID_MESSAGE");
    expect(errorResponseOf(handleHostMessage(null, validState())).code).toBe("INVALID_MESSAGE");
    expect(errorResponseOf(handleHostMessage({ protocolVersion: BRIDGE_PROTOCOL_VERSION }, validState())).code).toBe(
      "INVALID_MESSAGE",
    );
  });

  it("returns CONFIG_NOT_FOUND without any secret when setup was not run", () => {
    const state: HostState = {
      config: null,
      configError: "CONFIG_NOT_FOUND",
      registrationOk: true,
      registrationReason: "ok",
    };
    const response = handleHostMessage({ type: "get_bridge_config", protocolVersion: BRIDGE_PROTOCOL_VERSION }, state);
    expect(errorResponseOf(response).code).toBe("CONFIG_NOT_FOUND");
    expect(JSON.stringify(response)).not.toContain("token");
  });

  it("refuses to serve the config when the registration does not authorize the expected extension", () => {
    const state: HostState = {
      config: { protocolVersion: BRIDGE_PROTOCOL_VERSION, port: 8765, token: "x".repeat(32) },
      configError: null,
      registrationOk: false,
      registrationReason: "bad registration",
    };
    const response = handleHostMessage({ type: "get_bridge_config", protocolVersion: BRIDGE_PROTOCOL_VERSION }, state);
    expect(errorResponseOf(response).code).toBe("HOST_REGISTRATION_INVALID");
    expect(JSON.stringify(response)).not.toContain(state.config!.token);
  });

  it("reports registration state without serving the secret through status", () => {
    const response = handleHostMessage({ type: "get_status", protocolVersion: BRIDGE_PROTOCOL_VERSION }, validState());
    expect(response).toMatchObject({ registrationOk: true, configPresent: true });
  });
});

describe("native host registration check", () => {
  it("loads state from a configured root and accepts a valid registration", async () => {
    const home = await tempDir();
    const root = path.join(home, "Library", "Application Support", "Agent Bridge for Tab Management in Firefox");
    const config = { protocolVersion: BRIDGE_PROTOCOL_VERSION, port: 8765, token: generateBridgeToken() };
    await saveBridgeConfig(root, config, platformInfo(home));
    const manifestDir = path.join(home, "Library", "Application Support", "Mozilla", "NativeMessagingHosts");
    await mkdir(manifestDir, { recursive: true });
    await writeFile(
      path.join(manifestDir, `${NATIVE_HOST_NAME}.json`),
      `${JSON.stringify(nativeHostManifest("/usr/local/bin/bridge-host"))}\n`,
      "utf8",
    );
    const state = await loadHostState(platformInfo(home));
    expect(state.config).toEqual(config);
    expect(state.registrationOk).toBe(true);
  });

  it("flags a manifest that allows additional extensions", async () => {
    const home = await tempDir();
    const manifestDir = path.join(home, "Library", "Application Support", "Mozilla", "NativeMessagingHosts");
    await mkdir(manifestDir, { recursive: true });
    await writeFile(
      path.join(manifestDir, `${NATIVE_HOST_NAME}.json`),
      JSON.stringify({
        name: NATIVE_HOST_NAME,
        path: "/bin/true",
        type: "stdio",
        allowed_extensions: [EXTENSION_ID, "other-addon@example.com"],
      }),
      "utf8",
    );
    const state = await loadHostState(platformInfo(home));
    expect(state.registrationOk).toBe(false);
  });

  it("reports a missing manifest as unregistered", async () => {
    const home = await tempDir();
    const state = await loadHostState(platformInfo(home));
    expect(state.registrationOk).toBe(false);
    expect(state.configError).toBe("CONFIG_NOT_FOUND");
    expect(nativeHostManifestPath(platformInfo(home))).toContain("NativeMessagingHosts");
  });
});
