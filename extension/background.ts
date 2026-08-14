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

const NATIVE_HOST_NAME = "firefox_tabs_agent_bridge";
const MIN_TOKEN_LENGTH = 16;

interface BridgeConfig {
  port: number;
  token: string;
}

declare const browser: BrowserApi & {
  storage: {
    local: {
      get(key: string | string[]): Promise<Record<string, unknown>>;
      set(values: Record<string, unknown>): Promise<void>;
    };
    onChanged: {
      addListener(listener: (changes: Record<string, unknown>, area: string) => void): void;
    };
  };
  runtime: {
    onMessage: {
      addListener(listener: (message: unknown) => unknown): void;
    };
    sendNativeMessage(application: string, message: unknown): Promise<unknown>;
  };
};

const controller = new FirefoxTabController(browser);
let socket: WebSocket | undefined;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let reconnectDelayMs = 500;
let connectionState = "not_configured";
let lastError = "";
let currentConfig: BridgeConfig | undefined;
let nativeHostAvailable = false;

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

function isValidPort(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 65535;
}

function parseConfig(values: Record<string, unknown>): BridgeConfig | undefined {
  const { bridgePort, bridgeToken } = values;
  if (isValidPort(bridgePort) && typeof bridgeToken === "string" && bridgeToken.length >= MIN_TOKEN_LENGTH) {
    return { port: bridgePort, token: bridgeToken };
  }
  return undefined;
}

function parseNativeConfig(message: unknown): BridgeConfig | undefined {
  if (typeof message !== "object" || message === null) return undefined;
  const value = message as Record<string, unknown>;
  if (value.type !== "bridge_config") return undefined;
  if (value.protocolVersion !== BRIDGE_PROTOCOL_VERSION) return undefined;
  if (!isValidPort(value.port)) return undefined;
  if (typeof value.token !== "string" || value.token.length < MIN_TOKEN_LENGTH) return undefined;
  return { port: value.port, token: value.token };
}

async function readCachedConfig(): Promise<BridgeConfig | undefined> {
  try {
    const values = await browser.storage.local.get(["bridgePort", "bridgeToken"]);
    return parseConfig(values);
  } catch {
    return undefined;
  }
}

async function fetchNativeConfig(): Promise<BridgeConfig | undefined> {
  try {
    const message = await browser.runtime.sendNativeMessage(NATIVE_HOST_NAME, {
      type: "get_bridge_config",
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
    });
    return parseNativeConfig(message);
  } catch {
    return undefined;
  }
}

async function refreshConfig(): Promise<void> {
  const native = await fetchNativeConfig();
  nativeHostAvailable = native !== undefined;
  const config = native ?? (await readCachedConfig());
  if (config === undefined) {
    currentConfig = undefined;
    connectionState = "not_configured";
    lastError = "No local bridge component detected. Run `npm run setup` in the project directory.";
    return;
  }
  const changed =
    currentConfig === undefined ||
    currentConfig.port !== config.port ||
    currentConfig.token !== config.token;
  currentConfig = config;
  if (native !== undefined) {
    try {
      await browser.storage.local.set({ bridgePort: native.port, bridgeToken: native.token });
    } catch {
      // The cache is optional; the in-memory config above is enough to connect.
    }
  }
  if (changed) {
    reconnectDelayMs = 500;
    lastError = "";
  }
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
  if (currentConfig === undefined) {
    connectionState = "not_configured";
    return;
  }
  clearReconnectTimer();
  socket?.close(1000, "reconfiguring");
  const { port, token } = currentConfig;

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

async function start(): Promise<void> {
  await refreshConfig();
  void connect();
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (!("bridgePort" in changes) && !("bridgeToken" in changes)) return;
  void (async () => {
    const values = await browser.storage.local.get(["bridgePort", "bridgeToken"]);
    const config = parseConfig(values);
    const same =
      config !== undefined &&
      currentConfig !== undefined &&
      config.port === currentConfig.port &&
      config.token === currentConfig.token;
    if (same) return;
    reconnectDelayMs = 500;
    currentConfig = config;
    if (config === undefined) {
      connectionState = "not_configured";
      lastError = "No local bridge component detected. Run `npm run setup` in the project directory.";
      return;
    }
    lastError = "";
    void connect();
  })();
});

browser.runtime.onMessage.addListener((message) => {
  if (typeof message === "object" && message !== null && "type" in message) {
    const type = (message as { type: string }).type;
    if (type === "bridge_status") {
      return Promise.resolve({
        state: connectionState,
        autoConfig: nativeHostAvailable ? "native" : currentConfig !== undefined ? "cached" : "missing",
        port: currentConfig?.port ?? null,
        lastError,
      });
    }
    if (type === "bridge_reconnect") {
      reconnectDelayMs = 500;
      void connect();
      return Promise.resolve({ ok: true });
    }
    if (type === "bridge_redetect") {
      reconnectDelayMs = 500;
      void (async () => {
        await refreshConfig();
        void connect();
      })();
      return Promise.resolve({ ok: true });
    }
  }
  return undefined;
});

void start();
