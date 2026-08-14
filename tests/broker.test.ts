import { once } from "node:events";
import { WebSocket } from "ws";
import { afterEach, describe, expect, it } from "vitest";
import { Broker, type BrokerOptions } from "../mcp-server/broker.js";
import { BrokerClient } from "../mcp-server/client.js";
import { BRIDGE_PROTOCOL_VERSION, type BridgeRequest } from "../shared/protocol.js";
import { TabEventTracker } from "../mcp-server/tab-events.js";

const token = "test-token-with-at-least-32-characters";
const brokers: Broker[] = [];
const clients: BrokerClient[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.stop()));
  await Promise.all(brokers.splice(0).map((broker) => broker.stop()));
});

async function startBroker(options: Partial<BrokerOptions> = {}): Promise<Broker> {
  const broker = new Broker({
    token,
    extensionPort: 0,
    agentPort: 0,
    connectionWaitMs: 100,
    requestTimeoutMs: options.requestTimeoutMs ?? 500,
    authTimeoutMs: options.authTimeoutMs ?? 5000,
  });
  brokers.push(broker);
  await broker.start();
  return broker;
}

function brokerPorts(broker: Broker): { extensionPort: number; agentPort: number } {
  const status = broker.getStatus() as unknown as { extensionPort: number; agentPort: number };
  return { extensionPort: status.extensionPort, agentPort: status.agentPort };
}

async function connectExtension(broker: Broker, suppliedToken = token): Promise<WebSocket> {
  const { extensionPort } = brokerPorts(broker);
  const socket = new WebSocket(`ws://127.0.0.1:${extensionPort}`, { origin: "moz-extension://test-extension" });
  await once(socket, "open");
  socket.send(JSON.stringify({ type: "auth", protocolVersion: BRIDGE_PROTOCOL_VERSION, token: suppliedToken }));
  await once(socket, "message");
  return socket;
}

async function connectAgent(broker: Broker, suppliedToken = token): Promise<WebSocket> {
  const { agentPort } = brokerPorts(broker);
  const socket = new WebSocket(`ws://127.0.0.1:${agentPort}`);
  await once(socket, "open");
  socket.send(JSON.stringify({ type: "auth", protocolVersion: BRIDGE_PROTOCOL_VERSION, token: suppliedToken }));
  await once(socket, "message");
  return socket;
}

function stubExtension(broker: Broker, socket: WebSocket): void {
  socket.on("message", (data) => {
    const message = JSON.parse(data.toString()) as BridgeRequest;
    if (message.type !== "request") return;
    socket.send(JSON.stringify({ type: "response", id: message.id, ok: true, result: { method: message.method } }));
  });
}

describe("Broker", () => {
  it("routes requests from multiple agents to the extension and back to the right agent", async () => {
    const broker = await startBroker();
    const extension = await connectExtension(broker);
    stubExtension(broker, extension);

    const agentA = await connectAgent(broker);
    const agentB = await connectAgent(broker);

    const callA = (): Promise<unknown> =>
      new Promise((resolve) => {
        agentA.send(JSON.stringify({ type: "request", id: "a-1", method: "list_tabs", params: {} }));
        agentA.on("message", (data) => resolve(JSON.parse(data.toString())));
      });
    const callB = (): Promise<unknown> =>
      new Promise((resolve) => {
        agentB.send(JSON.stringify({ type: "request", id: "b-1", method: "list_tab_groups", params: {} }));
        agentB.on("message", (data) => resolve(JSON.parse(data.toString())));
      });

    const [responseA, responseB] = await Promise.all([callA(), callB()]);
    expect(responseA).toMatchObject({ id: "a-1", ok: true, result: { method: "list_tabs" } });
    expect(responseB).toMatchObject({ id: "b-1", ok: true, result: { method: "list_tab_groups" } });
  });

  it("rejects a non-extension origin on the extension port", async () => {
    const broker = await startBroker();
    const { extensionPort } = brokerPorts(broker);
    const socket = new WebSocket(`ws://127.0.0.1:${extensionPort}`, { origin: "https://example.com" });
    await once(socket, "open");
    const [code] = (await once(socket, "close")) as [number, Buffer];
    expect(code).toBe(1008);
  });

  it("rejects an incorrect token on both ports", async () => {
    const broker = await startBroker();
    const { extensionPort, agentPort } = brokerPorts(broker);

    const extension = new WebSocket(`ws://127.0.0.1:${extensionPort}`, {
      origin: "moz-extension://test-extension",
    });
    await once(extension, "open");
    extension.send(
      JSON.stringify({ type: "auth", protocolVersion: BRIDGE_PROTOCOL_VERSION, token: "incorrect-token-with-enough-length" }),
    );
    const [extCode] = (await once(extension, "close")) as [number, Buffer];
    expect(extCode).toBe(1008);

    const agent = new WebSocket(`ws://127.0.0.1:${agentPort}`);
    await once(agent, "open");
    agent.send(
      JSON.stringify({ type: "auth", protocolVersion: BRIDGE_PROTOCOL_VERSION, token: "incorrect-token-with-enough-length" }),
    );
    const [agentCode] = (await once(agent, "close")) as [number, Buffer];
    expect(agentCode).toBe(1008);
  });

  it("closes unauthenticated connections on both ports", async () => {
    const broker = await startBroker({ authTimeoutMs: 50 });
    const { extensionPort, agentPort } = brokerPorts(broker);
    const extension = new WebSocket(`ws://127.0.0.1:${extensionPort}`, { origin: "moz-extension://test-extension" });
    const agent = new WebSocket(`ws://127.0.0.1:${agentPort}`);
    await Promise.all([once(extension, "open"), once(agent, "open")]);
    const extensionClose = once(extension, "close");
    const agentClose = once(agent, "close");
    extension.send(JSON.stringify({ type: "list_tabs" }));
    agent.send(JSON.stringify({ type: "list_tabs" }));
    const [extCode] = (await extensionClose) as [number, Buffer];
    const [agentCode] = (await agentClose) as [number, Buffer];
    expect(extCode).toBe(1008);
    expect(agentCode).toBe(1008);
  });

  it("answers agent requests with EXTENSION_NOT_CONNECTED when no extension is attached", async () => {
    const broker = await startBroker();
    const agent = await connectAgent(broker);
    agent.send(JSON.stringify({ type: "request", id: "x-1", method: "list_tabs", params: {} }));
    const [message] = (await once(agent, "message")) as [Buffer];
    const response = JSON.parse(message.toString());
    expect(response).toMatchObject({ id: "x-1", ok: false, error: { code: "EXTENSION_NOT_CONNECTED" } });
  });

  it("fails all pending agent requests when the extension disconnects", async () => {
    const broker = await startBroker();
    const extension = await connectExtension(broker);
    const agent = await connectAgent(broker);
    agent.send(JSON.stringify({ type: "request", id: "p-1", method: "list_tabs", params: {} }));
    extension.close(1000, "gone");
    const [message] = (await once(agent, "message")) as [Buffer];
    const response = JSON.parse(message.toString());
    expect(response).toMatchObject({ id: "p-1", ok: false, error: { code: "EXTENSION_DISCONNECTED" } });
  });

  it("keeps serving a surviving agent after another agent disconnects", async () => {
    const broker = await startBroker();
    const extension = await connectExtension(broker);
    stubExtension(broker, extension);
    const agentA = await connectAgent(broker);
    const agentB = await connectAgent(broker);
    agentA.close(1000, "bye");

    agentB.send(JSON.stringify({ type: "request", id: "b-2", method: "list_tabs", params: {} }));
    const [message] = (await once(agentB, "message")) as [Buffer];
    expect(JSON.parse(message.toString())).toMatchObject({ id: "b-2", ok: true });
  });

  it("times out agent requests the extension never answers", async () => {
    const broker = await startBroker({ requestTimeoutMs: 30 });
    await connectExtension(broker);
    const agent = await connectAgent(broker);
    agent.send(JSON.stringify({ type: "request", id: "t-1", method: "list_tabs", params: {} }));
    const [message] = (await once(agent, "message")) as [Buffer];
    expect(JSON.parse(message.toString())).toMatchObject({ id: "t-1", ok: false, error: { code: "REQUEST_TIMEOUT" } });
  });

  it("supports in-process calls from the MCP server itself", async () => {
    const broker = await startBroker();
    const extension = await connectExtension(broker);
    stubExtension(broker, extension);
    await expect(broker.call("list_tabs", { scope: "all" })).resolves.toEqual({ method: "list_tabs" });
  });

  it("fails to start when either port is already taken", async () => {
    const first = await startBroker();
    const { extensionPort } = brokerPorts(first);
    const second = new Broker({
      token,
      extensionPort,
      agentPort: 0,
      connectionWaitMs: 100,
      requestTimeoutMs: 500,
    });
    brokers.push(second);
    await expect(second.start()).rejects.toThrow();
  });
});

describe("BrokerClient", () => {
  it("authenticates, calls the broker, and receives the routed response", async () => {
    const broker = await startBroker();
    const extension = await connectExtension(broker);
    stubExtension(broker, extension);
    const { agentPort } = brokerPorts(broker);

    const client = new BrokerClient({ token, agentPort, connectionWaitMs: 500, requestTimeoutMs: 500 });
    clients.push(client);
    await client.connect();
    await expect(client.call("list_tabs", { scope: "all" })).resolves.toEqual({ method: "list_tabs" });
    expect(client.getStatus().connected).toBe(true);
  });

  it("rejects a wrong broker token", async () => {
    const broker = await startBroker();
    const { agentPort } = brokerPorts(broker);
    const client = new BrokerClient({ token: "wrong-token-0123456789", agentPort, connectionWaitMs: 200 });
    clients.push(client);
    await expect(client.connect()).rejects.toMatchObject({ code: "BROKER_AUTH_FAILED" });
  });

  it("fails cleanly when no broker is running", async () => {
    const client = new BrokerClient({ token, agentPort: 0, connectionWaitMs: 300 });
    clients.push(client);
    await expect(client.connect()).rejects.toMatchObject({ code: "BROKER_UNAVAILABLE" });
  });

  it("rejects in-flight calls after the broker disconnects", async () => {
    const broker = await startBroker({ requestTimeoutMs: 2000 });
    const { agentPort } = brokerPorts(broker);
    const client = new BrokerClient({ token, agentPort, connectionWaitMs: 500, requestTimeoutMs: 2000 });
    clients.push(client);
    await client.connect();

    const call = client.call("list_tabs", {});
    await broker.stop();
    await expect(call).rejects.toMatchObject({ code: "BROKER_DISCONNECTED" });
  });
});

describe("Broker tab-complete events", () => {
  it("answers wait_tab immediately from the event cache", async () => {
    const broker = await startBroker();
    const extension = await connectExtension(broker);
    extension.send(
      JSON.stringify({
        type: "event",
        event: "tab_complete",
        data: { tabId: 77, url: "https://example.com/", title: "Example" },
      }),
    );
    const { agentPort } = brokerPorts(broker);
    const client = new BrokerClient({ token, agentPort, connectionWaitMs: 500, requestTimeoutMs: 2000 });
    clients.push(client);
    await client.connect();
    await expect(client.call("wait_tab", { tabId: 77, timeoutMs: 1000 })).resolves.toMatchObject({
      tabId: 77,
      url: "https://example.com/",
      title: "Example",
      waitedMs: 0,
    });
  });

  it("includes the completedAt timestamp in cached answers", async () => {
    const broker = await startBroker();
    const extension = await connectExtension(broker);
    extension.send(
      JSON.stringify({ type: "event", event: "tab_complete", data: { tabId: 88, url: "https://t.example/", title: "T" } }),
    );
    const { agentPort } = brokerPorts(broker);
    const client = new BrokerClient({ token, agentPort, connectionWaitMs: 500, requestTimeoutMs: 1000 });
    clients.push(client);
    await client.connect();
    const result = await client.call("wait_tab", { tabId: 88, timeoutMs: 1000 });
    const value = result as { completedAt?: number };
    expect(typeof value.completedAt).toBe("number");
    expect(value.completedAt).toBeGreaterThan(0);
  });

  it("waits for a tab_complete event and answers as soon as it arrives", async () => {
    const broker = await startBroker();
    const extension = await connectExtension(broker);
    const { agentPort } = brokerPorts(broker);
    const client = new BrokerClient({ token, agentPort, connectionWaitMs: 500, requestTimeoutMs: 5000 });
    clients.push(client);
    await client.connect();

    const pending = client.call("wait_tab", { tabId: 99, timeoutMs: 3000 });
    await new Promise((resolve) => setTimeout(resolve, 100));
    extension.send(
      JSON.stringify({
        type: "event",
        event: "tab_complete",
        data: { tabId: 99, url: "https://later.example/", title: "Later" },
      }),
    );
    await expect(pending).resolves.toMatchObject({ tabId: 99, url: "https://later.example/", title: "Later" });
  });

  it("fails with TAB_LOAD_TIMEOUT when the event never arrives", async () => {
    const broker = await startBroker();
    const { agentPort } = brokerPorts(broker);
    const client = new BrokerClient({ token, agentPort, connectionWaitMs: 500, requestTimeoutMs: 5000 });
    clients.push(client);
    await client.connect();
    await expect(client.call("wait_tab", { tabId: 123, timeoutMs: 150 })).rejects.toMatchObject({
      code: "TAB_LOAD_TIMEOUT",
    });
  });

  it("supports in-process wait_tab calls on the broker", async () => {
    const broker = await startBroker();
    const extension = await connectExtension(broker);
    const pending = broker.call("wait_tab", { tabId: 55, timeoutMs: 2000 });
    await new Promise((resolve) => setTimeout(resolve, 50));
    extension.send(
      JSON.stringify({
        type: "event",
        event: "tab_complete",
        data: { tabId: 55, url: "https://ip.example/", title: "" },
      }),
    );
    await expect(pending).resolves.toMatchObject({ tabId: 55 });
  });

  it("answers every waiter for the same tabId when the event arrives", async () => {
    const broker = await startBroker();
    const extension = await connectExtension(broker);
    const { agentPort } = brokerPorts(broker);
    const clientA = new BrokerClient({ token, agentPort, connectionWaitMs: 500, requestTimeoutMs: 3000 });
    const clientB = new BrokerClient({ token, agentPort, connectionWaitMs: 500, requestTimeoutMs: 3000 });
    clients.push(clientA, clientB);
    await clientA.connect();
    await clientB.connect();

    const waitA = clientA.call("wait_tab", { tabId: 42, timeoutMs: 2500 });
    const waitB = clientB.call("wait_tab", { tabId: 42, timeoutMs: 2500 });
    await new Promise((resolve) => setTimeout(resolve, 100));
    extension.send(
      JSON.stringify({
        type: "event",
        event: "tab_complete",
        data: { tabId: 42, url: "https://shared.example/", title: "Shared" },
      }),
    );
    await expect(waitA).resolves.toMatchObject({ tabId: 42, url: "https://shared.example/" });
    await expect(waitB).resolves.toMatchObject({ tabId: 42, url: "https://shared.example/" });
  });

  it("evicts the oldest completion record beyond the cache cap", async () => {
    const tracker = new TabEventTracker({ maxCompletedTabs: 2 });
    tracker.handleEvent({ event: "tab_complete", data: { tabId: 1, url: "https://a.example/", title: "A" } });
    tracker.handleEvent({ event: "tab_complete", data: { tabId: 2, url: "https://b.example/", title: "B" } });
    tracker.handleEvent({ event: "tab_complete", data: { tabId: 3, url: "https://c.example/", title: "C" } });
    await expect(tracker.waitForTab({ tabId: 1, timeoutMs: 100 })).rejects.toMatchObject({
      code: "TAB_LOAD_TIMEOUT",
    });
    await expect(tracker.waitForTab({ tabId: 3, timeoutMs: 100 })).resolves.toMatchObject({ tabId: 3, url: "https://c.example/" });
  });

  it("cleans up waiters when the waiting agent disconnects", async () => {
    const broker = await startBroker();
    const { agentPort } = brokerPorts(broker);
    const agent = await connectAgent(broker);
    agent.send(JSON.stringify({ type: "request", id: "w-1", method: "wait_tab", params: { tabId: 321, timeoutMs: 5000 } }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    agent.close(1000, "bye");
    await new Promise((resolve) => setTimeout(resolve, 50));

    const { extensionPort } = brokerPorts(broker);
    const extension = new WebSocket(`ws://127.0.0.1:${extensionPort}`, { origin: "moz-extension://test-extension" });
    await once(extension, "open");
    extension.send(JSON.stringify({ type: "auth", protocolVersion: BRIDGE_PROTOCOL_VERSION, token }));
    await once(extension, "message");
    extension.send(
      JSON.stringify({
        type: "event",
        event: "tab_complete",
        data: { tabId: 321, url: "https://x.example/", title: "" },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    const client = new BrokerClient({ token, agentPort, connectionWaitMs: 500, requestTimeoutMs: 2000 });
    clients.push(client);
    await client.connect();
    await expect(client.call("wait_tab", { tabId: 321, timeoutMs: 1000 })).resolves.toMatchObject({ tabId: 321 });
  });
});
