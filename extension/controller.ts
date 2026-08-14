import { FirefoxTabsError } from "../shared/errors.js";
import type {
  CloseTabGroupParams,
  CloseTabsParams,
  CreateTabGroupParams,
  ListGroupsParams,
  ListTabsParams,
  MergeTabGroupsParams,
  MoveTabToGroupParams,
  MoveTabToWindowParams,
  MoveTabsToGroupParams,
  NewWindowParams,
  OpenTabParams,
  OpenTabsIntoGroupParams,
  RenameTabGroupParams,
  RepositionTabParams,
  RestoreTabParams,
  SetTabGroupCollapsedParams,
  SetTabGroupColorParams,
  SetTabMutedParams,
  TabSelector,
  UngroupTabParams,
} from "../shared/protocol.js";

export const TAB_GROUP_ID_NONE = -1;

export interface BrowserTab {
  id?: number;
  windowId: number;
  index: number;
  groupId: number;
  active: boolean;
  pinned: boolean;
  muted?: boolean;
  audible?: boolean;
  title?: string;
  url?: string;
}

export interface BrowserTabGroup {
  id: number;
  windowId: number;
  title?: string;
  color: string;
  collapsed: boolean;
}

export interface BrowserApi {
  windows: {
    create(createData: { url?: string; focused?: boolean }): Promise<{ id?: number }>;
  };
  tabs: {
    query(queryInfo: Record<string, unknown>): Promise<BrowserTab[]>;
    get(tabId: number): Promise<BrowserTab>;
    create(createProperties: { url: string; active: boolean; windowId?: number }): Promise<BrowserTab>;
    group(
      options:
        | { tabIds: number[]; groupId: number }
        | { tabIds: number[]; createProperties: { windowId: number } },
    ): Promise<number>;
    ungroup(tabIds: number | number[]): Promise<void>;
    update(tabId: number, updateProperties: { pinned: boolean; muted?: boolean }): Promise<BrowserTab>;
    move(tabId: number, moveProperties: { index: number }): Promise<BrowserTab>;
    moveToWindow(tabId: number, windowId: number, moveProperties?: { index?: number }): Promise<BrowserTab>;
    remove(tabIds: number[]): Promise<void>;
    duplicate(tabId: number): Promise<BrowserTab>;
  };
  sessions: {
    restore(sessionId?: string): Promise<{ tab?: BrowserTab; window?: { id?: number } }>;
  };
  tabGroups: {
    query(queryInfo: Record<string, unknown>): Promise<BrowserTabGroup[]>;
    update(
      groupId: number,
      updateProperties: { title?: string; collapsed?: boolean; color?: string },
    ): Promise<BrowserTabGroup>;
    remove(groupId: number): Promise<void>;
  };
}

export interface PublicTab {
  id: number;
  windowId: number;
  index: number;
  groupId: number;
  active: boolean;
  pinned: boolean;
  muted: boolean;
  audible: boolean;
  title: string;
  url: string;
}

function publicTab(tab: BrowserTab): PublicTab {
  if (tab.id === undefined) {
    throw new FirefoxTabsError("INVALID_TAB", "Firefox returned a tab without an ID.");
  }
  return {
    id: tab.id,
    windowId: tab.windowId,
    index: tab.index,
    groupId: tab.groupId,
    active: tab.active,
    pinned: tab.pinned,
    muted: tab.muted ?? false,
    audible: tab.audible ?? false,
    title: tab.title ?? "",
    url: tab.url ?? "",
  };
}

function withoutFragment(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.hash = "";
    return url.href;
  } catch {
    return rawUrl.split("#", 1)[0] ?? rawUrl;
  }
}

function validateSelector(selector: TabSelector): void {
  const fields = [selector.tabId !== undefined, selector.url !== undefined, selector.title !== undefined];
  if (fields.filter(Boolean).length !== 1) {
    throw new FirefoxTabsError(
      "INVALID_SELECTOR",
      "Provide exactly one of selector.tabId, selector.url, or selector.title.",
    );
  }
  if (selector.ignoreUrlFragment && selector.url === undefined) {
    throw new FirefoxTabsError(
      "INVALID_SELECTOR",
      "ignoreUrlFragment can only be used with selector.url.",
    );
  }
}

export class FirefoxTabController {
  constructor(private readonly browserApi: BrowserApi) {}

  async newWindow(params: NewWindowParams = {}): Promise<{ windowId: number; tab: PublicTab | null }> {
    let url: URL | undefined;
    if (params.url !== undefined) {
      try {
        url = new URL(params.url);
      } catch {
        throw new FirefoxTabsError("INVALID_URL", "url must be a complete, valid URL.", { url: params.url });
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new FirefoxTabsError(
          "UNSUPPORTED_URL_SCHEME",
          "Only http:// and https:// URLs can be opened.",
          { protocol: url.protocol },
        );
      }
    }

    const created = await this.browserApi.windows.create({
      ...(url === undefined ? {} : { url: url.href }),
      focused: params.active ?? false,
    });
    if (created.id === undefined) {
      throw new FirefoxTabsError("VERIFICATION_FAILED", "Firefox did not report the new window ID.");
    }

    const windowTabs = await this.browserApi.tabs.query({ windowId: created.id });
    const tab = windowTabs.length > 0 ? publicTab(windowTabs[0]!) : null;
    if (url !== undefined && (tab === null || tab.url !== url.href)) {
      throw new FirefoxTabsError("VERIFICATION_FAILED", "Firefox did not report the expected first tab in the new window.", {
        expectedUrl: url.href,
        windowId: created.id,
        tab,
      });
    }
    return { windowId: created.id, tab };
  }

  async openTab(params: OpenTabParams): Promise<{ tab: PublicTab }> {
    let url: URL;
    try {
      url = new URL(params.url);
    } catch {
      throw new FirefoxTabsError("INVALID_URL", "url must be a complete, valid URL.", { url: params.url });
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new FirefoxTabsError(
        "UNSUPPORTED_URL_SCHEME",
        "Only http:// and https:// URLs can be opened.",
        { protocol: url.protocol },
      );
    }
    if (params.windowId !== undefined && (!Number.isInteger(params.windowId) || params.windowId <= 0)) {
      throw new FirefoxTabsError("INVALID_WINDOW_ID", "windowId must be a positive integer.");
    }

    const created = publicTab(
      await this.browserApi.tabs.create({
        url: url.href,
        active: params.active ?? false,
        ...(params.windowId === undefined ? {} : { windowId: params.windowId }),
      }),
    );
    const tab = publicTab(await this.browserApi.tabs.get(created.id));
    if (params.windowId !== undefined && tab.windowId !== params.windowId) {
      throw new FirefoxTabsError("VERIFICATION_FAILED", "Firefox opened the tab in an unexpected window.", {
        expectedWindowId: params.windowId,
        tab,
      });
    }
    return { tab };
  }

  async listTabs(params: ListTabsParams = {}): Promise<{ tabs: PublicTab[] }> {
    const query = params.scope === "last_focused_window" ? { lastFocusedWindow: true } : {};
    const tabs = await this.browserApi.tabs.query(query);
    return { tabs: tabs.map(publicTab) };
  }

  async listTabGroups(params: ListGroupsParams = {}): Promise<{ groups: BrowserTabGroup[] }> {
    const query = params.windowId === undefined ? {} : { windowId: params.windowId };
    const groups = await this.browserApi.tabGroups.query(query);
    return { groups };
  }

  async createTabGroup(params: CreateTabGroupParams): Promise<{
    changed: true;
    group: BrowserTabGroup;
    tabs: PublicTab[];
  }> {
    if (params.title.trim().length === 0) {
      throw new FirefoxTabsError("INVALID_GROUP_TITLE", "title must not be empty or whitespace only.");
    }
    if (params.tabIds.length === 0) {
      throw new FirefoxTabsError("INVALID_TAB_IDS", "tabIds must contain at least one tab ID.");
    }
    if (params.tabIds.some((tabId) => !Number.isInteger(tabId) || tabId <= 0)) {
      throw new FirefoxTabsError("INVALID_TAB_IDS", "Every tab ID must be a positive integer.");
    }
    if (new Set(params.tabIds).size !== params.tabIds.length) {
      throw new FirefoxTabsError("INVALID_TAB_IDS", "tabIds must not contain duplicates.");
    }

    const before = await Promise.all(params.tabIds.map((tabId) => this.browserApi.tabs.get(tabId)));
    const publicBefore = before.map(publicTab);
    const windowId = before[0]!.windowId;
    if (before.some((tab) => tab.windowId !== windowId)) {
      throw new FirefoxTabsError("TABS_SPAN_WINDOWS", "All tabs must be in the same Firefox window.", {
        tabs: publicBefore,
      });
    }
    const alreadyGrouped = publicBefore.filter((tab) => tab.groupId !== TAB_GROUP_ID_NONE);
    if (alreadyGrouped.length > 0) {
      throw new FirefoxTabsError(
        "TAB_ALREADY_GROUPED",
        "Create a group only from ungrouped tabs; use the move tool for tabs that are already grouped.",
        { tabs: alreadyGrouped },
      );
    }
    const pinned = publicBefore.filter((tab) => tab.pinned);
    if (pinned.length > 0 && !params.allowUnpin) {
      throw new FirefoxTabsError(
        "PINNED_TAB_REQUIRES_CONFIRMATION",
        "Grouping these tabs would unpin them. Retry with allowUnpin=true only after explicit confirmation.",
        { tabs: pinned },
      );
    }

    const existingGroups = await this.browserApi.tabGroups.query({ windowId });
    const sameTitle = existingGroups.filter((group) => (group.title ?? "") === params.title);
    if (sameTitle.length > 0) {
      throw new FirefoxTabsError(
        "GROUP_ALREADY_EXISTS",
        `A tab group named ${JSON.stringify(params.title)} already exists in this window; use the move tool instead.`,
        { windowId, candidates: sameTitle },
      );
    }

    let groupId: number | undefined;
    try {
      groupId = await this.browserApi.tabs.group({ tabIds: params.tabIds, createProperties: { windowId } });
      const group = await this.browserApi.tabGroups.update(groupId, {
        title: params.title,
        ...(params.collapsed === undefined ? {} : { collapsed: params.collapsed }),
      });
      const tabs = (await Promise.all(params.tabIds.map((tabId) => this.browserApi.tabs.get(tabId)))).map(publicTab);
      if (
        group.id !== groupId ||
        group.windowId !== windowId ||
        (group.title ?? "") !== params.title ||
        tabs.some((tab) => tab.groupId !== groupId)
      ) {
        throw new FirefoxTabsError("VERIFICATION_FAILED", "Firefox did not report the expected new tab group.", {
          expected: { groupId, windowId, title: params.title },
          group,
          tabs,
        });
      }
      return { changed: true, group, tabs };
    } catch (error) {
      if (groupId !== undefined) {
        try {
          await this.browserApi.tabs.ungroup(params.tabIds);
          await Promise.all(
            publicBefore.filter((tab) => tab.pinned).map((tab) => this.browserApi.tabs.update(tab.id, { pinned: true })),
          );
        } catch {
          // Preserve the original error; the caller must treat the operation as unverified.
        }
      }
      throw error;
    }
  }

  async resolveTab(selector: TabSelector): Promise<BrowserTab> {
    validateSelector(selector);

    if (selector.tabId !== undefined) {
      return this.browserApi.tabs.get(selector.tabId);
    }

    const tabs = await this.browserApi.tabs.query({});
    const matches = tabs.filter((tab) => {
      if (selector.url !== undefined) {
        const tabUrl = tab.url ?? "";
        return selector.ignoreUrlFragment
          ? withoutFragment(tabUrl) === withoutFragment(selector.url)
          : tabUrl === selector.url;
      }
      return (tab.title ?? "") === selector.title;
    });

    if (matches.length === 0) {
      throw new FirefoxTabsError("TAB_NOT_FOUND", "No Firefox tab exactly matched the selector.", {
        selector,
      });
    }
    if (matches.length > 1) {
      throw new FirefoxTabsError(
        "AMBIGUOUS_TAB",
        `The selector matched ${matches.length} tabs; use tabId to choose one.`,
        { selector, candidates: matches.map(publicTab) },
      );
    }
    return matches[0]!;
  }

  async findGroupByTitle(title: string, windowId?: number): Promise<BrowserTabGroup> {
    const query = windowId === undefined ? {} : { windowId };
    const groups = await this.browserApi.tabGroups.query(query);
    const matches = groups.filter((group) => (group.title ?? "") === title);
    if (matches.length === 0) {
      throw new FirefoxTabsError(
        "GROUP_NOT_FOUND",
        `No tab group named ${JSON.stringify(title)} exists${windowId === undefined ? "" : ` in window ${windowId}`}.`,
        { windowId, availableGroups: groups },
      );
    }
    if (matches.length > 1) {
      throw new FirefoxTabsError(
        "AMBIGUOUS_GROUP",
        `More than one group named ${JSON.stringify(title)} exists; pass windowId to disambiguate.`,
        { windowId, candidates: matches },
      );
    }
    return matches[0]!;
  }

  async moveTabToGroup(params: MoveTabToGroupParams): Promise<{
    changed: boolean;
    before: PublicTab;
    after: PublicTab;
    group: BrowserTabGroup;
  }> {
    if (params.groupTitle.length === 0) {
      throw new FirefoxTabsError("INVALID_GROUP_TITLE", "groupTitle must not be empty.");
    }
    if (params.windowId !== undefined && (!Number.isInteger(params.windowId) || params.windowId <= 0)) {
      throw new FirefoxTabsError("INVALID_WINDOW_ID", "windowId must be a positive integer.");
    }

    const tab = await this.resolveTab(params.selector);
    const before = publicTab(tab);
    const targetWindowId = params.windowId ?? tab.windowId;

    if (tab.pinned && !params.allowUnpin) {
      throw new FirefoxTabsError(
        "PINNED_TAB_REQUIRES_CONFIRMATION",
        "Grouping this tab would unpin it. Retry with allowUnpin=true only after explicit confirmation.",
        { tab: before },
      );
    }

    const group = await this.findGroupByTitle(params.groupTitle, targetWindowId);

    if (tab.groupId === group.id && tab.windowId === group.windowId) {
      return { changed: false, before, after: before, group };
    }

    if (tab.windowId !== group.windowId) {
      await this.browserApi.tabs.moveToWindow(before.id, group.windowId);
    }

    await this.browserApi.tabs.group({ tabIds: [before.id], groupId: group.id });
    const after = publicTab(await this.browserApi.tabs.get(before.id));
    if (after.groupId !== group.id || after.windowId !== group.windowId) {
      throw new FirefoxTabsError(
        "VERIFICATION_FAILED",
        "Firefox did not report the expected group and window after moving the tab.",
        { expectedGroupId: group.id, expectedWindowId: group.windowId, after },
      );
    }

    return { changed: true, before, after, group };
  }

  async closeTabs(params: CloseTabsParams): Promise<{
    changed: boolean;
    closedTabs: PublicTab[];
  }> {
    if (params.tabIds.length === 0) {
      throw new FirefoxTabsError("INVALID_TAB_IDS", "tabIds must contain at least one tab ID.");
    }
    if (params.tabIds.some((tabId) => !Number.isInteger(tabId) || tabId <= 0)) {
      throw new FirefoxTabsError("INVALID_TAB_IDS", "Every tab ID must be a positive integer.");
    }
    if (new Set(params.tabIds).size !== params.tabIds.length) {
      throw new FirefoxTabsError("INVALID_TAB_IDS", "tabIds must not contain duplicates.");
    }

    const before = await Promise.all(
      params.tabIds.map((tabId) => this.browserApi.tabs.get(tabId).catch(() => undefined)),
    );
    if (before.some((tab) => tab === undefined)) {
      throw new FirefoxTabsError("TAB_NOT_FOUND", "At least one requested tab does not exist.", {
        tabIds: params.tabIds,
      });
    }
    const closedTabs = before.map((tab) => publicTab(tab!));

    await this.browserApi.tabs.remove(params.tabIds);
    const remaining = await this.browserApi.tabs.query({});
    const stillThere = params.tabIds.filter((id) => remaining.some((tab) => tab.id === id));
    if (stillThere.length > 0) {
      throw new FirefoxTabsError("VERIFICATION_FAILED", "Firefox still reports closed tabs as open.", {
        tabIds: stillThere,
      });
    }
    return { changed: true, closedTabs };
  }

  async closeTabGroup(params: CloseTabGroupParams): Promise<{
    changed: boolean;
    closedTabs: PublicTab[];
    removedGroup: boolean;
  }> {
    const group = await this.findGroupByTitle(params.groupTitle, params.windowId);
    const windowTabs = await this.browserApi.tabs.query({ windowId: group.windowId });
    const groupTabs = windowTabs.filter((tab) => tab.groupId === group.id);
    const closedTabs = groupTabs.map(publicTab);
    const ids = groupTabs.map((tab) => publicTab(tab).id);

    if (ids.length > 0) {
      await this.browserApi.tabs.remove(ids);
    }
    await this.browserApi.tabGroups.remove(group.id);

    const remaining = await this.browserApi.tabs.query({ windowId: group.windowId });
    const stillThere = ids.filter((id) => remaining.some((tab) => tab.id === id));
    if (stillThere.length > 0) {
      throw new FirefoxTabsError("VERIFICATION_FAILED", "Firefox still reports closed group tabs as open.", {
        tabIds: stillThere,
      });
    }
    const groups = await this.browserApi.tabGroups.query({ windowId: group.windowId });
    if (groups.some((candidate) => candidate.id === group.id)) {
      throw new FirefoxTabsError("VERIFICATION_FAILED", "Firefox still reports the group after closing it.", {
        groupId: group.id,
      });
    }
    return { changed: true, closedTabs, removedGroup: true };
  }

  async mergeTabGroups(params: MergeTabGroupsParams): Promise<{
    changed: boolean;
    merged: number;
    removedGroup: boolean;
    group: BrowserTabGroup;
    tabs: PublicTab[];
  }> {
    if (params.from === params.to) {
      throw new FirefoxTabsError("INVALID_MERGE_TARGETS", "from and to must be different group titles.");
    }
    const fromGroup = await this.findGroupByTitle(params.from, params.windowId);
    const toGroup = await this.findGroupByTitle(params.to, params.windowId);
    if (fromGroup.id === toGroup.id) {
      throw new FirefoxTabsError("INVALID_MERGE_TARGETS", "from and to must be different groups.");
    }

    const windowTabs = await this.browserApi.tabs.query({ windowId: fromGroup.windowId });
    const fromTabs = windowTabs.filter((tab) => tab.groupId === fromGroup.id);
    const fromIds = fromTabs.map((tab) => publicTab(tab).id);

    if (fromIds.length > 0) {
      if (fromGroup.windowId !== toGroup.windowId) {
        for (const tabId of fromIds) {
          await this.browserApi.tabs.moveToWindow(tabId, toGroup.windowId);
        }
      }
      await this.browserApi.tabs.group({ tabIds: fromIds, groupId: toGroup.id });
    }
    await this.browserApi.tabGroups.remove(fromGroup.id);

    const merged = await Promise.all(fromIds.map((tabId) => this.browserApi.tabs.get(tabId)));
    const tabs = merged.map(publicTab);
    if (tabs.some((tab) => tab.groupId !== toGroup.id || tab.windowId !== toGroup.windowId)) {
      throw new FirefoxTabsError("VERIFICATION_FAILED", "Firefox did not report the expected group after merging.", {
        expectedGroupId: toGroup.id,
        expectedWindowId: toGroup.windowId,
        tabs,
      });
    }
    const groups = await this.browserApi.tabGroups.query({ windowId: fromGroup.windowId });
    if (groups.some((candidate) => candidate.id === fromGroup.id)) {
      throw new FirefoxTabsError("VERIFICATION_FAILED", "Firefox still reports the source group after merging.", {
        groupId: fromGroup.id,
      });
    }
    return { changed: true, merged: tabs.length, removedGroup: true, group: toGroup, tabs };
  }

  async listWindows(): Promise<{
    windows: Array<{
      windowId: number;
      tabCount: number;
      groupCount: number;
      groups: Array<{ id: number; title: string; collapsed: boolean; tabCount: number }>;
    }>;
  }> {
    const [tabs, groups] = await Promise.all([
      this.browserApi.tabs.query({}),
      this.browserApi.tabGroups.query({}),
    ]);
    const byWindow = new Map<number, { tabCount: number; groups: Map<number, { id: number; title: string; collapsed: boolean; tabCount: number }> }>();
    for (const tab of tabs) {
      const windowId = tab.windowId;
      let entry = byWindow.get(windowId);
      if (!entry) {
        entry = { tabCount: 0, groups: new Map() };
        byWindow.set(windowId, entry);
      }
      entry.tabCount += 1;
      if (tab.groupId !== TAB_GROUP_ID_NONE) {
        let group = entry.groups.get(tab.groupId);
        if (!group) {
          const source = groups.find((candidate) => candidate.id === tab.groupId);
          group = { id: tab.groupId, title: source?.title ?? "", collapsed: source?.collapsed ?? false, tabCount: 0 };
          entry.groups.set(tab.groupId, group);
        }
        group.tabCount += 1;
      }
    }
    const windows = [...byWindow.entries()]
      .map(([windowId, entry]) => ({
        windowId,
        tabCount: entry.tabCount,
        groupCount: entry.groups.size,
        groups: [...entry.groups.values()],
      }))
      .sort((a, b) => a.windowId - b.windowId);
    return { windows };
  }

  async renameTabGroup(params: RenameTabGroupParams): Promise<{
    changed: boolean;
    before: BrowserTabGroup;
    after: BrowserTabGroup;
  }> {
    const newTitle = params.newTitle.trim();
    if (newTitle.length === 0) {
      throw new FirefoxTabsError("INVALID_GROUP_TITLE", "newTitle must not be empty or whitespace only.");
    }
    const group = await this.findGroupByTitle(params.groupTitle, params.windowId);
    if ((group.title ?? "") === newTitle) {
      return { changed: false, before: group, after: group };
    }
    const existing = await this.browserApi.tabGroups.query({ windowId: group.windowId });
    if (existing.some((candidate) => candidate.id !== group.id && (candidate.title ?? "") === newTitle)) {
      throw new FirefoxTabsError(
        "GROUP_ALREADY_EXISTS",
        `A tab group named ${JSON.stringify(newTitle)} already exists in this window.`,
        { windowId: group.windowId, candidates: existing },
      );
    }

    const after = await this.browserApi.tabGroups.update(group.id, { title: newTitle });
    if ((after.title ?? "") !== newTitle || after.id !== group.id) {
      throw new FirefoxTabsError("VERIFICATION_FAILED", "Firefox did not report the expected group title.", {
        expected: { groupId: group.id, title: newTitle },
        after,
      });
    }
    return { changed: true, before: group, after };
  }

  async setTabGroupCollapsed(params: SetTabGroupCollapsedParams): Promise<{
    changed: boolean;
    before: BrowserTabGroup;
    after: BrowserTabGroup;
  }> {
    const group = await this.findGroupByTitle(params.groupTitle, params.windowId);
    if (group.collapsed === params.collapsed) {
      return { changed: false, before: group, after: group };
    }
    const after = await this.browserApi.tabGroups.update(group.id, { collapsed: params.collapsed });
    if (after.collapsed !== params.collapsed || after.id !== group.id) {
      throw new FirefoxTabsError("VERIFICATION_FAILED", "Firefox did not report the expected collapsed state.", {
        expected: { groupId: group.id, collapsed: params.collapsed },
        after,
      });
    }
    return { changed: true, before: group, after };
  }

  async ungroupTab(params: UngroupTabParams): Promise<{
    changed: boolean;
    before: PublicTab;
    after: PublicTab;
  }> {
    const tab = await this.resolveTab(params.selector);
    const before = publicTab(tab);
    if (tab.groupId === TAB_GROUP_ID_NONE) {
      return { changed: false, before, after: before };
    }

    await this.browserApi.tabs.ungroup(before.id);
    const after = publicTab(await this.browserApi.tabs.get(before.id));
    if (after.groupId !== TAB_GROUP_ID_NONE) {
      throw new FirefoxTabsError("VERIFICATION_FAILED", "Firefox still reports the tab as grouped after ungrouping.", {
        after,
      });
    }
    return { changed: true, before, after };
  }

  async repositionTab(params: RepositionTabParams): Promise<{
    changed: boolean;
    before: PublicTab;
    after: PublicTab;
  }> {
    if (!Number.isInteger(params.index) || params.index < -1) {
      throw new FirefoxTabsError("INVALID_TAB_INDEX", "index must be -1 (end of window) or a non-negative integer.");
    }

    const tab = await this.resolveTab(params.selector);
    const before = publicTab(tab);
    const windowTabs = await this.browserApi.tabs.query({ windowId: tab.windowId });
    const targetIndex = params.index === -1 ? windowTabs.length - 1 : Math.min(params.index, windowTabs.length - 1);
    if (targetIndex < 0 || tab.index === targetIndex) {
      return { changed: false, before, after: before };
    }

    await this.browserApi.tabs.move(before.id, { index: targetIndex });
    const after = publicTab(await this.browserApi.tabs.get(before.id));
    if (after.index !== targetIndex) {
      throw new FirefoxTabsError("VERIFICATION_FAILED", "Firefox did not report the expected position after moving the tab.", {
        expectedIndex: targetIndex,
        after,
      });
    }
    return { changed: true, before, after };
  }

  async pinTab(selector: TabSelector): Promise<{ changed: boolean; before: PublicTab; after: PublicTab }> {
    const tab = await this.resolveTab(selector);
    const before = publicTab(tab);
    if (tab.pinned) return { changed: false, before, after: before };
    const after = publicTab(await this.browserApi.tabs.update(before.id, { pinned: true }));
    if (!after.pinned) {
      throw new FirefoxTabsError("VERIFICATION_FAILED", "Firefox did not report the tab as pinned.", { after });
    }
    return { changed: true, before, after };
  }

  async unpinTab(selector: TabSelector): Promise<{ changed: boolean; before: PublicTab; after: PublicTab }> {
    const tab = await this.resolveTab(selector);
    const before = publicTab(tab);
    if (!tab.pinned) return { changed: false, before, after: before };
    const after = publicTab(await this.browserApi.tabs.update(before.id, { pinned: false }));
    if (after.pinned) {
      throw new FirefoxTabsError("VERIFICATION_FAILED", "Firefox did not report the tab as unpinned.", { after });
    }
    return { changed: true, before, after };
  }

  async duplicateTab(selector: TabSelector): Promise<{
    changed: boolean;
    before: PublicTab;
    after: PublicTab;
  }> {
    const tab = await this.resolveTab(selector);
    const before = publicTab(tab);
    const duplicated = publicTab(await this.browserApi.tabs.duplicate(before.id));
    if (duplicated.url !== before.url || duplicated.windowId !== before.windowId) {
      throw new FirefoxTabsError("VERIFICATION_FAILED", "Firefox did not report the expected duplicate tab.", {
        expectedUrl: before.url,
        expectedWindowId: before.windowId,
        after: duplicated,
      });
    }
    return { changed: true, before, after: duplicated };
  }

  async setTabGroupColor(params: SetTabGroupColorParams): Promise<{
    changed: boolean;
    before: BrowserTabGroup;
    after: BrowserTabGroup;
  }> {
    const colors = ["blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange", "grey"];
    if (!colors.includes(params.color)) {
      throw new FirefoxTabsError("INVALID_GROUP_COLOR", `color must be one of: ${colors.join(", ")}.`);
    }
    const group = await this.findGroupByTitle(params.groupTitle, params.windowId);
    if (group.color === params.color) {
      return { changed: false, before: group, after: group };
    }
    const after = await this.browserApi.tabGroups.update(group.id, { color: params.color });
    if (after.color !== params.color || after.id !== group.id) {
      throw new FirefoxTabsError("VERIFICATION_FAILED", "Firefox did not report the expected group color.", {
        expected: { groupId: group.id, color: params.color },
        after,
      });
    }
    return { changed: true, before: group, after };
  }

  async moveTabToWindow(params: MoveTabToWindowParams): Promise<{
    changed: boolean;
    before: PublicTab;
    after: PublicTab;
  }> {
    if (!Number.isInteger(params.windowId) || params.windowId <= 0) {
      throw new FirefoxTabsError("INVALID_WINDOW_ID", "windowId must be a positive integer.");
    }
    if (params.index !== undefined && (!Number.isInteger(params.index) || params.index < -1)) {
      throw new FirefoxTabsError("INVALID_TAB_INDEX", "index must be -1 (end of window) or a non-negative integer.");
    }
    const tab = await this.resolveTab(params.selector);
    const before = publicTab(tab);
    if (tab.windowId === params.windowId && params.index === undefined) {
      return { changed: false, before, after: before };
    }
    await this.browserApi.tabs.moveToWindow(
      before.id,
      params.windowId,
      params.index === undefined ? {} : { index: params.index },
    );
    const after = publicTab(await this.browserApi.tabs.get(before.id));
    if (after.windowId !== params.windowId) {
      throw new FirefoxTabsError("VERIFICATION_FAILED", "Firefox did not report the expected window after moving the tab.", {
        expectedWindowId: params.windowId,
        after,
      });
    }
    return { changed: true, before, after };
  }

  async getActiveTab(): Promise<{ tab: PublicTab | null }> {
    const tabs = await this.browserApi.tabs.query({ active: true, lastFocusedWindow: true });
    return { tab: tabs.length > 0 ? publicTab(tabs[0]!) : null };
  }

  async restoreTab(params: RestoreTabParams = {}): Promise<{
    restoredTab: PublicTab | null;
    restoredWindowId: number | null;
  }> {
    if (params.sessionId !== undefined && params.sessionId.length === 0) {
      throw new FirefoxTabsError("INVALID_SESSION_ID", "sessionId must not be empty.");
    }
    let restored: { tab?: BrowserTab; window?: { id?: number } };
    try {
      restored = await this.browserApi.sessions.restore(params.sessionId);
    } catch {
      throw new FirefoxTabsError("NOTHING_TO_RESTORE", "Firefox has no recently closed tab or window to restore.");
    }
    const tab = restored.tab === undefined ? null : publicTab(restored.tab);
    const windowId = restored.window?.id ?? null;
    if (tab === null && windowId === null) {
      throw new FirefoxTabsError("NOTHING_TO_RESTORE", "Firefox has no recently closed tab or window to restore.");
    }
    return { restoredTab: tab, restoredWindowId: windowId };
  }

  async setTabMuted(params: SetTabMutedParams): Promise<{
    changed: boolean;
    before: PublicTab;
    after: PublicTab;
  }> {
    const tab = await this.resolveTab(params.selector);
    const before = publicTab(tab);
    const currentlyMuted = tab.muted ?? false;
    if (currentlyMuted === params.muted) {
      return { changed: false, before, after: before };
    }
    const after = publicTab(await this.browserApi.tabs.update(before.id, { pinned: tab.pinned, muted: params.muted }));
    if ((after.muted ?? false) !== params.muted) {
      throw new FirefoxTabsError(
        "MUTE_REQUIRES_USER_GESTURE",
        "Firefox ignored the programmatic mute/unmute; mute and unmute changes require a user gesture. Ask the user to click the tab's sound icon, or retry after the user interacts with the tab.",
        { expectedMuted: params.muted, after },
      );
    }
    return { changed: true, before, after };
  }

  async openTabsIntoGroup(params: OpenTabsIntoGroupParams): Promise<{
    tabs: PublicTab[];
    group: BrowserTabGroup;
    created: boolean;
  }> {
    if (params.urls.length === 0) {
      throw new FirefoxTabsError("INVALID_URL", "urls must contain at least one URL.");
    }
    const urls = params.urls.map((raw) => {
      let url: URL;
      try {
        url = new URL(raw);
      } catch {
        throw new FirefoxTabsError("INVALID_URL", "url must be a complete, valid URL.", { url: raw });
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new FirefoxTabsError("UNSUPPORTED_URL_SCHEME", "Only http:// and https:// URLs can be opened.", {
          protocol: url.protocol,
        });
      }
      return url.href;
    });

    let group: BrowserTabGroup | undefined;
    let created = false;
    try {
      group = await this.findGroupByTitle(params.groupTitle, params.windowId);
    } catch (error) {
      if (error instanceof FirefoxTabsError && error.code === "GROUP_NOT_FOUND") {
        group = undefined;
      } else {
        throw error;
      }
    }

    const opened: BrowserTab[] = [];
    try {
      for (const url of urls) {
        const createdTab = await this.browserApi.tabs.create({
          url,
          active: false,
          ...(params.windowId === undefined ? {} : { windowId: params.windowId }),
        });
        opened.push(createdTab);
      }
      const ids = opened.map((tab) => publicTab(tab).id);
      if (group !== undefined) {
        await this.browserApi.tabs.group({ tabIds: ids, groupId: group.id });
      } else {
        const targetWindowId = params.windowId ?? publicTab(opened[0]!).windowId;
        const newGroupId = await this.browserApi.tabs.group({
          tabIds: ids,
          createProperties: { windowId: targetWindowId },
        });
        group = await this.browserApi.tabGroups.update(newGroupId, {
          title: params.groupTitle,
          ...(params.collapsed === undefined ? {} : { collapsed: params.collapsed }),
        });
        created = true;
      }
    } catch (error) {
      try {
        if (opened.length > 0) {
          await this.browserApi.tabs.remove(opened.map((tab) => publicTab(tab).id));
        }
      } catch {
        // Preserve the original error; the caller must treat the operation as unverified.
      }
      throw error;
    }

    const tabs = (await Promise.all(opened.map((tab) => this.browserApi.tabs.get(publicTab(tab).id)))).map(publicTab);
    if (group === undefined || tabs.some((tab) => tab.groupId !== group.id)) {
      throw new FirefoxTabsError("VERIFICATION_FAILED", "Firefox did not report the expected group after opening the tabs.", {
        expectedGroupId: group?.id,
        tabs,
      });
    }
    return { tabs, group, created };
  }

  async moveTabsToGroup(params: MoveTabsToGroupParams): Promise<{
    changed: boolean;
    before: PublicTab[];
    after: PublicTab[];
    group: BrowserTabGroup;
  }> {
    if (params.tabIds.length === 0) {
      throw new FirefoxTabsError("INVALID_TAB_IDS", "tabIds must contain at least one tab ID.");
    }
    if (params.tabIds.some((tabId) => !Number.isInteger(tabId) || tabId <= 0)) {
      throw new FirefoxTabsError("INVALID_TAB_IDS", "Every tab ID must be a positive integer.");
    }
    if (new Set(params.tabIds).size !== params.tabIds.length) {
      throw new FirefoxTabsError("INVALID_TAB_IDS", "tabIds must not contain duplicates.");
    }
    if (params.windowId !== undefined && (!Number.isInteger(params.windowId) || params.windowId <= 0)) {
      throw new FirefoxTabsError("INVALID_WINDOW_ID", "windowId must be a positive integer.");
    }

    const before = await Promise.all(
      params.tabIds.map((tabId) => this.browserApi.tabs.get(tabId).catch(() => undefined)),
    );
    if (before.some((tab) => tab === undefined)) {
      throw new FirefoxTabsError("TAB_NOT_FOUND", "At least one requested tab does not exist.", {
        tabIds: params.tabIds,
      });
    }
    const publicBefore = before.map((tab) => publicTab(tab!));
    const targetWindowId = params.windowId ?? publicBefore[0]!.windowId;
    const group = await this.findGroupByTitle(params.groupTitle, targetWindowId);

    const pinned = publicBefore.filter((tab) => tab.pinned);
    if (pinned.length > 0 && !params.allowUnpin) {
      throw new FirefoxTabsError(
        "PINNED_TAB_REQUIRES_CONFIRMATION",
        "Grouping these tabs would unpin them. Retry with allowUnpin=true only after explicit confirmation.",
        { tabs: pinned },
      );
    }

    const alreadyInGroup = publicBefore.filter(
      (tab) => tab.groupId === group.id && tab.windowId === group.windowId,
    );
    if (alreadyInGroup.length === publicBefore.length) {
      return { changed: false, before: publicBefore, after: publicBefore, group };
    }

    for (const tab of publicBefore) {
      if (tab.windowId !== group.windowId) {
        await this.browserApi.tabs.moveToWindow(tab.id, group.windowId);
      }
    }
    await this.browserApi.tabs.group({ tabIds: publicBefore.map((tab) => tab.id), groupId: group.id });
    const after = (await Promise.all(publicBefore.map((tab) => this.browserApi.tabs.get(tab.id)))).map(publicTab);
    if (after.some((tab) => tab.groupId !== group.id || tab.windowId !== group.windowId)) {
      throw new FirefoxTabsError("VERIFICATION_FAILED", "Firefox did not report the expected group after moving the tabs.", {
        expectedGroupId: group.id,
        expectedWindowId: group.windowId,
        tabs: after,
      });
    }
    return { changed: true, before: publicBefore, after, group };
  }
}
