export const BRIDGE_PROTOCOL_VERSION = 1 as const;

export type BridgeMethod =
  | "list_tabs"
  | "list_tab_groups"
  | "open_tab"
  | "create_tab_group"
  | "move_tab_to_group"
  | "ungroup_tab";

export interface AuthMessage {
  type: "auth";
  protocolVersion: typeof BRIDGE_PROTOCOL_VERSION;
  token: string;
}

export interface AuthOkMessage {
  type: "auth_ok";
  protocolVersion: typeof BRIDGE_PROTOCOL_VERSION;
}

export interface BridgeRequest {
  type: "request";
  id: string;
  method: BridgeMethod;
  params: unknown;
}

export interface BridgeSuccessResponse {
  type: "response";
  id: string;
  ok: true;
  result: unknown;
}

export interface BridgeErrorResponse {
  type: "response";
  id: string;
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type BridgeResponse = BridgeSuccessResponse | BridgeErrorResponse;

export interface TabSelector {
  tabId?: number;
  url?: string;
  title?: string;
  ignoreUrlFragment?: boolean;
}

export interface MoveTabParams {
  selector: TabSelector;
  groupTitle: string;
  allowUnpin?: boolean;
}

export interface OpenTabParams {
  url: string;
  active?: boolean;
  windowId?: number;
}

export interface CreateTabGroupParams {
  tabIds: number[];
  title: string;
  collapsed?: boolean;
  allowUnpin?: boolean;
}

export interface UngroupTabParams {
  selector: TabSelector;
}

export interface ListTabsParams {
  scope?: "all" | "last_focused_window";
}

export interface ListGroupsParams {
  windowId?: number;
}
