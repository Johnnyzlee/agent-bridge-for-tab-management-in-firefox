import { serializeError } from "../shared/errors.js";
import { FirefoxTabController, type BrowserApi } from "./controller.js";
import {
  BRIDGE_PROTOCOL_VERSION,
  type AuthMessage,
  type BridgeRequest,
  type BridgeResponse,
  type CreateTabGroupParams,
  type ListGroupsParams,
  type ListTabsParams,
  type MoveTabParams,
  type OpenTabParams,
  type UngroupTabParams,
} from "../shared/protocol.js";

declare const browser: BrowserApi & {
  storage: {
    local: {
      get(defaults: Record<string, unknown>): Promise<Record<string, unknown>>;
    };
    onChanged: {
      addListener(listener: () => void): void;
    };
  };
  runtime: {
    onMessage: {
      addListener(listener: (message: unknown) => unknown): void;
    };
  };
};

const controller = new FirefoxTabController(browser);
let socket: WebSocket | undefined;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let reconnectDelayMs = 500;
let connectionState = "not_configured";
let lastError = "";

async function readConfig(): Promise<{ port: number; token: string }> {
  const values = await browser.storage.local.get({ bridgePort: 8765, bridgeToken: "" });
  const port = Number(values.bridgePort);
  return {
    port: Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 8765,
    token: typeof values.bridgeToken === "string" ? values.bridgeToken.trim() : "",
  };
}

function clearReconnectTimer(): void {
  if (reconnectTimer !== undefined) {
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
}

function scheduleReconnect(): void {
  clearReconnectTimer();
  reconnectTimer = setTimeout(() => {
    void connect();
  }, reconnectDelayMs);
  reconnectDelayMs = Math.min(reconnectDelayMs * 2, 10_000);
}

async function dispatch(request: BridgeRequest): Promise<unknown> {
  switch (request.method) {
    case "list_tabs":
      return controller.listTabs(request.params as ListTabsParams);
    case "list_tab_groups":
      return controller.listTabGroups(request.params as ListGroupsParams);
    case "open_tab":
      return controller.openTab(request.params as OpenTabParams);
    case "create_tab_group":
      return controller.createTabGroup(request.params as CreateTabGroupParams);
    case "move_tab_to_group":
      return controller.moveTabToGroup(request.params as MoveTabParams);
    case "ungroup_tab":
      return controller.ungroupTab(request.params as UngroupTabParams);
  }
}

async function handleRequest(request: BridgeRequest): Promise<void> {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  let response: BridgeResponse;
  try {
    response = { type: "response", id: request.id, ok: true, result: await dispatch(request) };
  } catch (error) {
    response = { type: "response", id: request.id, ok: false, error: serializeError(error) };
  }
  socket.send(JSON.stringify(response));
}

async function connect(): Promise<void> {
  clearReconnectTimer();
  socket?.close(1000, "reconfiguring");
  const { port, token } = await readConfig();
  if (token.length < 16) {
    connectionState = "not_configured";
    lastError = "Set a bridge token of at least 16 characters in the extension options.";
    return;
  }

  connectionState = "connecting";
  const nextSocket = new WebSocket(`ws://127.0.0.1:${port}`);
  socket = nextSocket;

  nextSocket.addEventListener("open", () => {
    const auth: AuthMessage = { type: "auth", protocolVersion: BRIDGE_PROTOCOL_VERSION, token };
    nextSocket.send(JSON.stringify(auth));
  });
  nextSocket.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(String(event.data)) as Record<string, unknown>;
      if (message.type === "auth_ok" && message.protocolVersion === BRIDGE_PROTOCOL_VERSION) {
        connectionState = "connected";
        lastError = "";
        reconnectDelayMs = 500;
        return;
      }
      if (message.type === "request") {
        void handleRequest(message as unknown as BridgeRequest);
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  });
  nextSocket.addEventListener("error", () => {
    connectionState = "disconnected";
    lastError = `Cannot reach the local bridge on port ${port}.`;
  });
  nextSocket.addEventListener("close", (event) => {
    if (socket !== nextSocket) return;
    connectionState = "disconnected";
    if (event.reason) lastError = event.reason;
    scheduleReconnect();
  });
}

browser.storage.onChanged.addListener(() => {
  reconnectDelayMs = 500;
  void connect();
});

browser.runtime.onMessage.addListener((message) => {
  if (typeof message === "object" && message !== null && "type" in message) {
    if ((message as { type: string }).type === "bridge_status") {
      return Promise.resolve({ state: connectionState, lastError });
    }
    if ((message as { type: string }).type === "bridge_reconnect") {
      reconnectDelayMs = 500;
      void connect();
      return Promise.resolve({ ok: true });
    }
  }
  return undefined;
});

void connect();
