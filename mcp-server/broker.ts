import { randomUUID, timingSafeEqual } from "node:crypto";
import { EventEmitter } from "node:events";
import { WebSocket, WebSocketServer } from "ws";
import { FirefoxTabsError } from "../shared/errors.js";
import { TabEventTracker } from "./tab-events.js";
import {
  BRIDGE_PROTOCOL_VERSION,
  type AuthMessage,
  type BridgeMethod,
  type BridgeRequest,
  type BridgeResponse,
} from "../shared/protocol.js";

export interface BrokerOptions {
  token: string;
  extensionPort: number;
  agentPort: number;
  host?: string;
  requestTimeoutMs?: number;
  connectionWaitMs?: number;
  authTimeoutMs?: number;
}

export interface BridgeLike {
  call(method: BridgeMethod, params: unknown): Promise<unknown>;
  getStatus(): Record<string, unknown>;
  stop(): Promise<void>;
}

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
  agent?: WebSocket;
}

function tokensEqual(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

export class Broker implements BridgeLike {
  private readonly host: string;
  private readonly extensionPort: number;
  private readonly agentPort: number;
  private readonly requestTimeoutMs: number;
  private readonly connectionWaitMs: number;
  private readonly authTimeoutMs: number;
  private readonly events = new EventEmitter();
  private readonly pending = new Map<string, PendingRequest>();
  private readonly tabEvents: TabEventTracker;
  private extensionServer: WebSocketServer | undefined;
  private agentServer: WebSocketServer | undefined;
  private actualExtensionPort: number | undefined;
  private actualAgentPort: number | undefined;
  private extensionClient: WebSocket | undefined;
  private readonly agents = new Set<WebSocket>();

  constructor(private readonly options: BrokerOptions) {
    this.host = options.host ?? "127.0.0.1";
    if (this.host !== "127.0.0.1" && this.host !== "::1" && this.host !== "localhost") {
      throw new FirefoxTabsError("INVALID_HOST", "The broker may only bind to a loopback address.");
    }
    this.extensionPort = options.extensionPort;
    this.agentPort = options.agentPort;
    this.tabEvents = new TabEventTracker();
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
    this.connectionWaitMs = options.connectionWaitMs ?? 5_000;
    this.authTimeoutMs = options.authTimeoutMs ?? 5_000;
  }

  async start(): Promise<void> {
    if (this.extensionServer || this.agentServer) return;

    const extensionServer = new WebSocketServer({ host: this.host, port: this.extensionPort });
    const agentServer = new WebSocketServer({ host: this.host, port: this.agentPort });
    try {
      await Promise.all([
        waitForListening(extensionServer),
        waitForListening(agentServer),
      ]);
    } catch (error) {
      extensionServer.close();
      agentServer.close();
      throw error;
    }
    this.extensionServer = extensionServer;
    this.agentServer = agentServer;
    const extensionAddress = extensionServer.address();
    const agentAddress = agentServer.address();
    if (typeof extensionAddress === "object" && extensionAddress) {
      this.actualExtensionPort = extensionAddress.port;
    }
    if (typeof agentAddress === "object" && agentAddress) {
      this.actualAgentPort = agentAddress.port;
    }
    extensionServer.on("connection", (socket, request) => {
      this.handleExtensionConnection(socket, request.headers.origin);
    });
    agentServer.on("connection", (socket) => this.handleAgentConnection(socket));
  }

  private handleExtensionConnection(socket: WebSocket, origin: string | undefined): void {
    if (!origin?.startsWith("moz-extension://")) {
      socket.close(1008, "Firefox extension origin required");
      return;
    }

    let authenticated = false;
    const authTimer = setTimeout(() => socket.close(1008, "Authentication timed out"), this.authTimeoutMs);

    socket.on("message", (data) => {
      let message: unknown;
      try {
        message = JSON.parse(data.toString());
      } catch {
        socket.close(1003, "Invalid JSON");
        return;
      }

      if (!authenticated) {
        const auth = message as Partial<AuthMessage>;
        const tokenMatches = typeof auth.token === "string" && tokensEqual(auth.token, this.options.token);
        if (auth.type !== "auth" || auth.protocolVersion !== BRIDGE_PROTOCOL_VERSION || !tokenMatches) {
          socket.close(1008, "Authentication failed");
          return;
        }
        authenticated = true;
        clearTimeout(authTimer);
        this.extensionClient?.close(1000, "Replaced by a newly authenticated Firefox extension");
        this.extensionClient = socket;
        this.tabEvents.clear();
        socket.send(JSON.stringify({ type: "auth_ok", protocolVersion: BRIDGE_PROTOCOL_VERSION }));
        this.events.emit("connected");
        return;
      }

      const typed = message as Record<string, unknown>;
      if (typed.type === "event") {
        this.tabEvents.handleEvent(typed);
        return;
      }

      this.handleResponse(typed as unknown as BridgeResponse);
    });

    socket.on("close", () => {
      clearTimeout(authTimer);
      if (this.extensionClient === socket) {
        this.extensionClient = undefined;
        this.rejectAllPending(new FirefoxTabsError("EXTENSION_DISCONNECTED", "The Firefox extension disconnected."));
        this.tabEvents.rejectAllWaiters(new FirefoxTabsError("EXTENSION_DISCONNECTED", "The Firefox extension disconnected."));
      }
    });
  }

  private handleAgentConnection(socket: WebSocket): void {
    let authenticated = false;
    const authTimer = setTimeout(() => socket.close(1008, "Authentication timed out"), this.authTimeoutMs);

    socket.on("message", (data) => {
      let message: unknown;
      try {
        message = JSON.parse(data.toString());
      } catch {
        socket.close(1003, "Invalid JSON");
        return;
      }

      if (!authenticated) {
        const auth = message as Partial<AuthMessage>;
        const tokenMatches = typeof auth.token === "string" && tokensEqual(auth.token, this.options.token);
        if (auth.type !== "auth" || auth.protocolVersion !== BRIDGE_PROTOCOL_VERSION || !tokenMatches) {
          socket.close(1008, "Authentication failed");
          return;
        }
        authenticated = true;
        clearTimeout(authTimer);
        this.agents.add(socket);
        socket.send(JSON.stringify({ type: "auth_ok", protocolVersion: BRIDGE_PROTOCOL_VERSION }));
        return;
      }

      this.handleAgentRequest(socket, message as BridgeRequest);
    });

    socket.on("close", () => {
      clearTimeout(authTimer);
      this.agents.delete(socket);
      this.rejectPendingForAgent(socket, new FirefoxTabsError("AGENT_DISCONNECTED", "The agent disconnected."));
      this.tabEvents.rejectWaitersForAgent(socket);
    });
  }

  private handleAgentRequest(agent: WebSocket, request: BridgeRequest): void {
    if (
      request.type !== "request" ||
      typeof request.id !== "string" ||
      typeof request.method !== "string" ||
      typeof request.params !== "object"
    ) {
      agent.send(
        JSON.stringify({
          type: "response",
          id: typeof request.id === "string" ? request.id : "",
          ok: false,
          error: { code: "INVALID_REQUEST", message: "Malformed bridge request." },
        }),
      );
      return;
    }

    if (request.method === "wait_tab") {
      this.tabEvents.handleAgentWait(agent, request.id, request.params);
      return;
    }

    if (!this.extensionClient || this.extensionClient.readyState !== WebSocket.OPEN) {
      agent.send(
        JSON.stringify({
          type: "response",
          id: request.id,
          ok: false,
          error: {
            code: "EXTENSION_NOT_CONNECTED",
            message: "The Firefox extension is not connected. Open its options page and verify the bridge status.",
          },
        }),
      );
      return;
    }

    const timer = setTimeout(() => {
      const pending = this.pending.get(request.id);
      if (!pending) return;
      this.pending.delete(request.id);
      agent.send(
        JSON.stringify({
          type: "response",
          id: request.id,
          ok: false,
          error: {
            code: "REQUEST_TIMEOUT",
            message: `Firefox did not answer ${request.method} within the timeout.`,
          },
        }),
      );
    }, this.requestTimeoutMs);
    this.pending.set(request.id, {
      resolve: () => undefined,
      reject: () => undefined,
      timer,
      agent,
    });

    this.extensionClient.send(JSON.stringify(request), (error) => {
      if (error) {
        clearTimeout(timer);
        this.pending.delete(request.id);
        agent.send(
          JSON.stringify({
            type: "response",
            id: request.id,
            ok: false,
            error: { code: "EXTENSION_DISCONNECTED", message: "The Firefox extension disconnected." },
          }),
        );
        return;
      }
    });
  }

  private handleResponse(response: BridgeResponse): void {
    if (response.type !== "response" || typeof response.id !== "string") return;
    const pending = this.pending.get(response.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(response.id);
    if (pending.agent) {
      pending.agent.send(JSON.stringify(response));
      return;
    }
    if (response.ok) {
      pending.resolve(response.result);
    } else {
      pending.reject(new FirefoxTabsError(response.error.code, response.error.message, response.error.details));
    }
  }

  async call(method: BridgeMethod, params: unknown): Promise<unknown> {
    if (method === "wait_tab") {
      return this.tabEvents.waitForTab(params);
    }
    const client = await this.waitForExtension();
    const id = randomUUID();
    const request: BridgeRequest = { type: "request", id, method, params };

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new FirefoxTabsError("REQUEST_TIMEOUT", `Firefox did not answer ${method} within the timeout.`));
      }, this.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      client.send(JSON.stringify(request), (error) => {
        if (!error) return;
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      });
    });
  }

  private async waitForExtension(): Promise<WebSocket> {
    if (this.extensionClient?.readyState === WebSocket.OPEN) return this.extensionClient;

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(
          new FirefoxTabsError(
            "EXTENSION_NOT_CONNECTED",
            "The Firefox extension is not connected. Open its options page and verify the bridge status.",
          ),
        );
      }, this.connectionWaitMs);
      const onConnected = (): void => {
        cleanup();
        resolve();
      };
      const cleanup = (): void => {
        clearTimeout(timer);
        this.events.off("connected", onConnected);
      };
      this.events.on("connected", onConnected);
    });

    if (!this.extensionClient) {
      throw new FirefoxTabsError("EXTENSION_NOT_CONNECTED", "The Firefox extension did not remain connected.");
    }
    return this.extensionClient;
  }

  getStatus(): Record<string, unknown> {
    return {
      listening: this.extensionServer !== undefined && this.agentServer !== undefined,
      connected: this.extensionClient?.readyState === WebSocket.OPEN,
      agentConnections: this.agents.size,
      host: this.host,
      extensionPort: this.actualExtensionPort ?? this.extensionPort,
      agentPort: this.actualAgentPort ?? this.agentPort,
    };
  }

  private rejectPendingForAgent(agent: WebSocket, error: Error): void {
    for (const [id, pending] of this.pending) {
      if (pending.agent !== agent) continue;
      clearTimeout(pending.timer);
      this.pending.delete(id);
      pending.reject(error);
    }
  }

  private rejectAllPending(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      this.pending.delete(id);
      if (pending.agent) {
        pending.agent.send(
          JSON.stringify({
            type: "response",
            id,
            ok: false,
            error: {
              code: error instanceof FirefoxTabsError ? error.code : "BRIDGE_ERROR",
              message: error.message,
            },
          }),
        );
        continue;
      }
      pending.reject(error);
    }
  }

  async stop(): Promise<void> {
    this.rejectAllPending(new FirefoxTabsError("BRIDGE_STOPPED", "The Firefox bridge stopped."));
    this.tabEvents.stop();
    this.extensionClient?.close(1001, "Bridge stopping");
    this.extensionClient = undefined;
    for (const agent of this.agents) agent.close(1001, "Bridge stopping");
    this.agents.clear();
    const servers = [this.extensionServer, this.agentServer];
    this.extensionServer = undefined;
    this.agentServer = undefined;
    for (const server of servers) {
      if (!server) continue;
      for (const socket of server.clients) socket.terminate();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  }
}

async function waitForListening(server: WebSocketServer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onListening = (): void => {
      cleanup();
      resolve();
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const cleanup = (): void => {
      server.off("listening", onListening);
      server.off("error", onError);
    };
    server.on("listening", onListening);
    server.on("error", onError);
  });
}
