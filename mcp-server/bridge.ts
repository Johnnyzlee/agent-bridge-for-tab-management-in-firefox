import { randomUUID, timingSafeEqual } from "node:crypto";
import { EventEmitter } from "node:events";
import { WebSocket, WebSocketServer } from "ws";
import { FirefoxTabsError } from "../shared/errors.js";
import {
  BRIDGE_PROTOCOL_VERSION,
  type AuthMessage,
  type BridgeMethod,
  type BridgeRequest,
  type BridgeResponse,
} from "../shared/protocol.js";

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}

export interface FirefoxBridgeOptions {
  token: string;
  port?: number;
  host?: string;
  requestTimeoutMs?: number;
  connectionWaitMs?: number;
}

function tokensEqual(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

export class FirefoxBridge {
  private readonly host: string;
  private readonly requestedPort: number;
  private readonly requestTimeoutMs: number;
  private readonly connectionWaitMs: number;
  private readonly events = new EventEmitter();
  private readonly pending = new Map<string, PendingRequest>();
  private server: WebSocketServer | undefined;
  private client: WebSocket | undefined;
  private actualPort: number | undefined;

  constructor(private readonly options: FirefoxBridgeOptions) {
    if (options.token.trim().length < 16) {
      throw new FirefoxTabsError("INVALID_TOKEN", "FIREFOX_TABS_BRIDGE_TOKEN must contain at least 16 characters.");
    }
    this.host = options.host ?? "127.0.0.1";
    if (this.host !== "127.0.0.1" && this.host !== "::1" && this.host !== "localhost") {
      throw new FirefoxTabsError("INVALID_HOST", "The bridge may only bind to a loopback address.");
    }
    this.requestedPort = options.port ?? 8765;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
    this.connectionWaitMs = options.connectionWaitMs ?? 5_000;
  }

  async start(): Promise<void> {
    if (this.server) return;
    const server = new WebSocketServer({ host: this.host, port: this.requestedPort });
    this.server = server;

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

    const address = server.address();
    if (typeof address === "object" && address) this.actualPort = address.port;
    server.on("connection", (socket, request) => this.handleConnection(socket, request.headers.origin));
  }

  private handleConnection(socket: WebSocket, origin: string | undefined): void {
    if (!origin?.startsWith("moz-extension://")) {
      socket.close(1008, "Firefox extension origin required");
      return;
    }

    let authenticated = false;
    const authTimer = setTimeout(() => socket.close(1008, "Authentication timed out"), 5_000);

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
          console.error(
            `firefox-tabs-agent bridge authentication failed (messageType=${String(auth.type)}, ` +
              `protocolVersion=${String(auth.protocolVersion)}, ` +
              `tokenLength=${typeof auth.token === "string" ? auth.token.length : "non-string"}, ` +
              `tokenMatches=${tokenMatches})`,
          );
          socket.close(1008, "Authentication failed");
          return;
        }
        authenticated = true;
        clearTimeout(authTimer);
        this.client?.close(1000, "Replaced by a newly authenticated Firefox extension");
        this.client = socket;
        socket.send(JSON.stringify({ type: "auth_ok", protocolVersion: BRIDGE_PROTOCOL_VERSION }));
        this.events.emit("connected");
        return;
      }

      this.handleResponse(message as BridgeResponse);
    });

    socket.on("close", () => {
      clearTimeout(authTimer);
      if (this.client === socket) {
        this.client = undefined;
        this.rejectAllPending(new FirefoxTabsError("EXTENSION_DISCONNECTED", "The Firefox extension disconnected."));
      }
    });
  }

  private handleResponse(response: BridgeResponse): void {
    if (response.type !== "response" || typeof response.id !== "string") return;
    const pending = this.pending.get(response.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(response.id);
    if (response.ok) {
      pending.resolve(response.result);
    } else {
      pending.reject(new FirefoxTabsError(response.error.code, response.error.message, response.error.details));
    }
  }

  private async waitForClient(): Promise<WebSocket> {
    if (this.client?.readyState === WebSocket.OPEN) return this.client;

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(
          new FirefoxTabsError(
            "EXTENSION_NOT_CONNECTED",
            "The Firefox extension is not connected. Open its options page and verify the port and token.",
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

    if (!this.client) {
      throw new FirefoxTabsError("EXTENSION_NOT_CONNECTED", "The Firefox extension did not remain connected.");
    }
    return this.client;
  }

  async call(method: BridgeMethod, params: unknown): Promise<unknown> {
    const client = await this.waitForClient();
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

  getStatus(): { listening: boolean; connected: boolean; host: string; port?: number } {
    return {
      listening: this.server !== undefined,
      connected: this.client?.readyState === WebSocket.OPEN,
      host: this.host,
      ...(this.actualPort === undefined ? {} : { port: this.actualPort }),
    };
  }

  private rejectAllPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  async stop(): Promise<void> {
    this.rejectAllPending(new FirefoxTabsError("BRIDGE_STOPPED", "The Firefox bridge stopped."));
    this.client?.close(1001, "Bridge stopping");
    this.client = undefined;
    const server = this.server;
    this.server = undefined;
    if (!server) return;
    for (const socket of server.clients) socket.terminate();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}
