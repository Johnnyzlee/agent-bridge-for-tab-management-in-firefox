import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { WebSocket, type RawData } from "ws";
import { FirefoxTabsError } from "../shared/errors.js";
import {
  BRIDGE_PROTOCOL_VERSION,
  type AuthMessage,
  type BridgeMethod,
  type BridgeRequest,
  type BridgeResponse,
} from "../shared/protocol.js";
import type { BridgeLike } from "./broker.js";

function frameText(data: RawData): string {
  if (typeof data === "string") return data;
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  return data.toString("utf8");
}

export interface BrokerClientOptions {
  token: string;
  agentPort: number;
  host?: string;
  requestTimeoutMs?: number;
  connectionWaitMs?: number;
}

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}

export class BrokerClient implements BridgeLike {
  private readonly host: string;
  private readonly agentPort: number;
  private readonly token: string;
  private readonly requestTimeoutMs: number;
  private readonly connectionWaitMs: number;
  private readonly events = new EventEmitter();
  private readonly pending = new Map<string, PendingRequest>();
  private socket: WebSocket | undefined;
  private authenticated = false;

  constructor(options: BrokerClientOptions) {
    this.host = options.host ?? "127.0.0.1";
    this.agentPort = options.agentPort;
    this.token = options.token;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
    this.connectionWaitMs = options.connectionWaitMs ?? 5_000;
  }

  async connect(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) return;

    const socket = new WebSocket(`ws://${this.host}:${this.agentPort}`);
    this.socket = socket;
    this.authenticated = false;

    const opened = await new Promise<boolean>((resolve) => {
      const onOpen = (): void => {
        cleanup();
        resolve(true);
      };
      const onError = (): void => {
        cleanup();
        resolve(false);
      };
      const cleanup = (): void => {
        socket.off("open", onOpen);
        socket.off("error", onError);
      };
      socket.once("open", onOpen);
      socket.once("error", onError);
    });
    if (!opened) {
      this.socket = undefined;
      throw new FirefoxTabsError("BROKER_UNAVAILABLE", "The shared broker is not reachable.");
    }

    const auth: AuthMessage = { type: "auth", protocolVersion: BRIDGE_PROTOCOL_VERSION, token: this.token };
    socket.send(JSON.stringify(auth));
    const authenticated = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        cleanup();
        resolve(false);
      }, this.connectionWaitMs);
      const onMessage = (data: RawData): void => {
        try {
          const message = JSON.parse(frameText(data)) as Record<string, unknown>;
          if (message.type === "auth_ok" && message.protocolVersion === BRIDGE_PROTOCOL_VERSION) {
            cleanup();
            resolve(true);
          }
        } catch {
          // Ignore malformed frames while authenticating.
        }
      };
      const onClose = (): void => {
        cleanup();
        resolve(false);
      };
      const cleanup = (): void => {
        clearTimeout(timer);
        socket.off("message", onMessage);
        socket.off("close", onClose);
      };
      socket.on("message", onMessage);
      socket.once("close", onClose);
    });
    if (!authenticated) {
      socket.close(1008, "Authentication failed");
      this.socket = undefined;
      throw new FirefoxTabsError("BROKER_AUTH_FAILED", "The shared broker rejected the agent credentials.");
    }

    this.authenticated = true;
    socket.on("message", (data) => {
      try {
        const message = JSON.parse(frameText(data)) as BridgeResponse;
        this.handleResponse(message);
      } catch {
        // Ignore malformed frames from the broker.
      }
    });
    socket.on("close", () => {
      if (this.socket === socket) {
        this.socket = undefined;
        this.authenticated = false;
        this.rejectAllPending(new FirefoxTabsError("BROKER_DISCONNECTED", "The shared broker disconnected."));
      }
    });
  }

  async call(method: BridgeMethod, params: unknown): Promise<unknown> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new FirefoxTabsError("BROKER_UNAVAILABLE", "The shared broker is not connected.");
    }
    const id = randomUUID();
    const request: BridgeRequest = { type: "request", id, method, params };

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new FirefoxTabsError("REQUEST_TIMEOUT", `The broker did not answer ${method} within the timeout.`));
      }, this.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.socket!.send(JSON.stringify(request), (error) => {
        if (!error) return;
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      });
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

  getStatus(): Record<string, unknown> {
    return {
      listening: false,
      connected: this.socket?.readyState === WebSocket.OPEN && this.authenticated,
      broker: `${this.host}:${this.agentPort}`,
      host: this.host,
      agentPort: this.agentPort,
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
    this.rejectAllPending(new FirefoxTabsError("BROKER_STOPPED", "The broker client stopped."));
    this.socket?.close(1000, "Client stopping");
    this.socket = undefined;
    this.authenticated = false;
  }
}
