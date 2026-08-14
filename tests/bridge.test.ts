import { once } from "node:events";
import { WebSocket } from "ws";
import { afterEach, describe, expect, it } from "vitest";
import { FirefoxBridge } from "../mcp-server/bridge.js";
import { BRIDGE_PROTOCOL_VERSION, type BridgeRequest } from "../shared/protocol.js";

const token = "test-token-with-at-least-32-characters";
const bridges: FirefoxBridge[] = [];

afterEach(async () => {
  await Promise.all(bridges.splice(0).map((bridge) => bridge.stop()));
});

async function startBridge(options: { requestTimeoutMs?: number } = {}): Promise<FirefoxBridge> {
  const bridge = new FirefoxBridge({
    token,
    port: 0,
    connectionWaitMs: 100,
    requestTimeoutMs: options.requestTimeoutMs ?? 500,
  });
  bridges.push(bridge);
  await bridge.start();
  return bridge;
}

async function connectExtension(bridge: FirefoxBridge, suppliedToken = token): Promise<WebSocket> {
  const port = bridge.getStatus().port!;
  const socket = new WebSocket(`ws://127.0.0.1:${port}`, { origin: "moz-extension://test-extension" });
  await once(socket, "open");
  socket.send(JSON.stringify({ type: "auth", protocolVersion: BRIDGE_PROTOCOL_VERSION, token: suppliedToken }));
  return socket;
}

describe("FirefoxBridge", () => {
  it("authenticates the extension and correlates request responses", async () => {
    const bridge = await startBridge();
    const socket = await connectExtension(bridge);
    await once(socket, "message");

    socket.on("message", (data) => {
      const message = JSON.parse(data.toString()) as BridgeRequest;
      if (message.type !== "request") return;
      socket.send(JSON.stringify({ type: "response", id: message.id, ok: true, result: { tabs: [] } }));
    });

    await expect(bridge.call("list_tabs", { scope: "all" })).resolves.toEqual({ tabs: [] });
  });

  it("rejects a non-extension WebSocket origin", async () => {
    const bridge = await startBridge();
    const port = bridge.getStatus().port!;
    const socket = new WebSocket(`ws://127.0.0.1:${port}`, { origin: "https://example.com" });
    await once(socket, "open");
    const [code] = (await once(socket, "close")) as [number, Buffer];
    expect(code).toBe(1008);
    expect(bridge.getStatus().connected).toBe(false);
  });

  it("rejects an incorrect token", async () => {
    const bridge = await startBridge();
    const socket = await connectExtension(bridge, "incorrect-token-with-enough-length");
    const [code] = (await once(socket, "close")) as [number, Buffer];
    expect(code).toBe(1008);
    expect(bridge.getStatus().connected).toBe(false);
  });

  it("times out a request that Firefox never answers", async () => {
    const bridge = await startBridge({ requestTimeoutMs: 30 });
    const socket = await connectExtension(bridge);
    await once(socket, "message");
    await expect(bridge.call("list_tabs", {})).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });
  });
});
