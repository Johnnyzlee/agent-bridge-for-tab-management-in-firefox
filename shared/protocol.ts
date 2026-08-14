export const BRIDGE_PROTOCOL_VERSION = 1 as const;

export type BridgeMethod =
  | "list_tabs"
  | "list_tab_groups"
  | "list_windows"
  | "new_window"
  | "open_tab"
  | "create_tab_group"
  | "move_tab_to_group"
  | "move_tabs_to_group"
  | "move_tab"
  | "move_tab_to_window"
  | "ungroup_tab"
  | "pin_tab"
  | "unpin_tab"
  | "duplicate_tab"
  | "set_tab_group_color"
  | "open_tabs_into_group"
  | "wait_tab"
  | "get_active_tab"
  | "restore_tab"
  | "close_tabs"
  | "close_tab_group"
  | "merge_tab_groups"
  | "rename_tab_group"
  | "set_tab_group_collapsed";

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

export interface MoveTabToGroupParams {
  selector: TabSelector;
  groupTitle: string;
  allowUnpin?: boolean;
  windowId?: number;
}

export interface RepositionTabParams {
  selector: TabSelector;
  index: number;
}

export interface MoveTabsToGroupParams {
  tabIds: number[];
  groupTitle: string;
  windowId?: number;
  allowUnpin?: boolean;
}

export interface MoveTabToWindowParams {
  selector: TabSelector;
  windowId: number;
  index?: number;
}

export interface OpenTabsIntoGroupParams {
  urls: string[];
  groupTitle: string;
  windowId?: number;
  collapsed?: boolean;
  allowUnpin?: boolean;
}

export interface RestoreTabParams {
  sessionId?: string;
}

export interface WaitTabParams {
  tabId: number;
  timeoutMs?: number;
}

export interface SetTabGroupColorParams {
  groupTitle: string;
  color: string;
  windowId?: number;
}

export interface CloseTabsParams {
  tabIds: number[];
}

export interface CloseTabGroupParams {
  groupTitle: string;
  windowId?: number;
}

export interface MergeTabGroupsParams {
  from: string;
  to: string;
  windowId?: number;
}

export interface RenameTabGroupParams {
  groupTitle: string;
  newTitle: string;
  windowId?: number;
}

export interface SetTabGroupCollapsedParams {
  groupTitle: string;
  collapsed: boolean;
  windowId?: number;
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

export interface NewWindowParams {
  url?: string;
  active?: boolean;
}
