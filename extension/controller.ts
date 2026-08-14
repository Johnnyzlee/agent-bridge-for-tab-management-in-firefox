import { FirefoxTabsError } from "../shared/errors.js";
import type {
  CreateTabGroupParams,
  ListGroupsParams,
  ListTabsParams,
  MoveTabToGroupParams,
  OpenTabParams,
  RepositionTabParams,
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
    update(tabId: number, updateProperties: { pinned: boolean }): Promise<BrowserTab>;
    move(tabId: number, moveProperties: { index: number }): Promise<BrowserTab>;
  };
  tabGroups: {
    query(queryInfo: Record<string, unknown>): Promise<BrowserTabGroup[]>;
    update(
      groupId: number,
      updateProperties: { title: string; collapsed?: boolean },
    ): Promise<BrowserTabGroup>;
  };
}

export interface PublicTab {
  id: number;
  windowId: number;
  index: number;
  groupId: number;
  active: boolean;
  pinned: boolean;
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

  async moveTabToGroup(params: MoveTabToGroupParams): Promise<{
    changed: boolean;
    before: PublicTab;
    after: PublicTab;
    group: BrowserTabGroup;
  }> {
    if (params.groupTitle.length === 0) {
      throw new FirefoxTabsError("INVALID_GROUP_TITLE", "groupTitle must not be empty.");
    }

    const tab = await this.resolveTab(params.selector);
    const before = publicTab(tab);

    if (tab.pinned && !params.allowUnpin) {
      throw new FirefoxTabsError(
        "PINNED_TAB_REQUIRES_CONFIRMATION",
        "Grouping this tab would unpin it. Retry with allowUnpin=true only after explicit confirmation.",
        { tab: before },
      );
    }

    const groups = await this.browserApi.tabGroups.query({ windowId: tab.windowId });
    const matches = groups.filter((group) => (group.title ?? "") === params.groupTitle);
    if (matches.length === 0) {
      throw new FirefoxTabsError(
        "GROUP_NOT_FOUND",
        `No tab group named ${JSON.stringify(params.groupTitle)} exists in the tab's window.`,
        { windowId: tab.windowId, availableGroups: groups },
      );
    }
    if (matches.length > 1) {
      throw new FirefoxTabsError(
        "AMBIGUOUS_GROUP",
        `More than one group named ${JSON.stringify(params.groupTitle)} exists in the tab's window.`,
        { windowId: tab.windowId, candidates: matches },
      );
    }

    const group = matches[0]!;
    if (tab.groupId === group.id) {
      return { changed: false, before, after: before, group };
    }

    await this.browserApi.tabs.group({ tabIds: [before.id], groupId: group.id });
    const after = publicTab(await this.browserApi.tabs.get(before.id));
    if (after.groupId !== group.id) {
      throw new FirefoxTabsError("VERIFICATION_FAILED", "Firefox did not report the expected group after moving the tab.", {
        expectedGroupId: group.id,
        after,
      });
    }

    return { changed: true, before, after, group };
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
}
