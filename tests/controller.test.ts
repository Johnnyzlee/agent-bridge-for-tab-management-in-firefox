import { describe, expect, it, vi } from "vitest";
import { FirefoxTabsError } from "../shared/errors.js";
import {
  FirefoxTabController,
  TAB_GROUP_ID_NONE,
  type BrowserApi,
  type BrowserTab,
  type BrowserTabGroup,
} from "../extension/controller.js";

function createBrowser(initialTabs: BrowserTab[], groups: BrowserTabGroup[]): BrowserApi & {
  createCalls: Array<{ url: string; active: boolean; windowId?: number }>;
  groupCalls: Array<
    | { tabIds: number[]; groupId: number }
    | { tabIds: number[]; createProperties: { windowId: number } }
  >;
  ungroupCalls: Array<number | number[]>;
  updateGroupCalls: Array<{ groupId: number; properties: { title: string; collapsed?: boolean } }>;
  moveCalls: Array<{ tabId: number; index: number }>;
  moveToWindowCalls: Array<{ tabId: number; windowId: number }>;
  removeCalls: Array<number[]>;
  removeGroupCalls: Array<number>;
} {
  const tabs = initialTabs.map((tab) => ({ ...tab }));
  const mutableGroups = groups.map((group) => ({ ...group }));
  const createCalls: Array<{ url: string; active: boolean; windowId?: number }> = [];
  const groupCalls: Array<
    | { tabIds: number[]; groupId: number }
    | { tabIds: number[]; createProperties: { windowId: number } }
  > = [];
  const ungroupCalls: Array<number | number[]> = [];
  const updateGroupCalls: Array<{ groupId: number; properties: { title: string; collapsed?: boolean } }> = [];
  const moveCalls: Array<{ tabId: number; index: number }> = [];
  const moveToWindowCalls: Array<{ tabId: number; windowId: number }> = [];
  const removeCalls: Array<number[]> = [];
  const removeGroupCalls: Array<number> = [];
  return {
    createCalls,
    groupCalls,
    ungroupCalls,
    updateGroupCalls,
    moveCalls,
    moveToWindowCalls,
    removeCalls,
    removeGroupCalls,
    tabs: {
      query: vi.fn(async (query: Record<string, unknown>) =>
        query.lastFocusedWindow ? tabs.filter((tab) => tab.windowId === 1) : tabs.map((tab) => ({ ...tab })),
      ),
      get: vi.fn(async (id: number) => {
        const tab = tabs.find((candidate) => candidate.id === id);
        if (!tab) throw new Error("missing tab");
        return { ...tab };
      }),
      create: vi.fn(async (options) => {
        createCalls.push(options);
        const windowId = options.windowId ?? 1;
        const tab: BrowserTab = {
          id: Math.max(0, ...tabs.map((candidate) => candidate.id ?? 0)) + 1,
          windowId,
          index: tabs.filter((candidate) => candidate.windowId === windowId).length,
          groupId: TAB_GROUP_ID_NONE,
          active: options.active,
          pinned: false,
          title: "",
          url: options.url,
        };
        tabs.push(tab);
        return { ...tab };
      }),
      group: vi.fn(async (options) => {
        groupCalls.push(options);
        const groupId = "groupId" in options
          ? options.groupId
          : Math.max(99, ...mutableGroups.map((group) => group.id)) + 1;
        if (!("groupId" in options)) {
          mutableGroups.push({
            id: groupId,
            windowId: options.createProperties.windowId,
            title: "",
            color: "grey",
            collapsed: false,
          });
        }
        for (const id of options.tabIds) {
          const tab = tabs.find((candidate) => candidate.id === id);
          if (tab) {
            tab.groupId = groupId;
            tab.pinned = false;
          }
        }
        return groupId;
      }),
      ungroup: vi.fn(async (ids) => {
        ungroupCalls.push(ids);
        const list = Array.isArray(ids) ? ids : [ids];
        for (const id of list) {
          const tab = tabs.find((candidate) => candidate.id === id);
          if (tab) tab.groupId = TAB_GROUP_ID_NONE;
        }
      }),
      update: vi.fn(async (id, properties) => {
        const tab = tabs.find((candidate) => candidate.id === id);
        if (!tab) throw new Error("missing tab");
        tab.pinned = properties.pinned;
        return { ...tab };
      }),
      move: vi.fn(async (id, properties) => {
        moveCalls.push({ tabId: id, index: properties.index });
        const tab = tabs.find((candidate) => candidate.id === id);
        if (!tab) throw new Error("missing tab");
        const windowTabs = tabs
          .filter((candidate) => candidate.windowId === tab.windowId)
          .sort((a, b) => a.index - b.index);
        const from = windowTabs.findIndex((candidate) => candidate.id === id);
        windowTabs.splice(from, 1);
        windowTabs.splice(Math.min(properties.index, windowTabs.length), 0, tab);
        windowTabs.forEach((candidate, index) => {
          candidate.index = index;
        });
        return { ...tab };
      }),
      moveToWindow: vi.fn(async (id, windowId) => {
        moveToWindowCalls.push({ tabId: id, windowId });
        const tab = tabs.find((candidate) => candidate.id === id);
        if (!tab) throw new Error("missing tab");
        tab.windowId = windowId;
        tab.index = tabs.filter((candidate) => candidate.windowId === windowId).length;
        return { ...tab };
      }),
      remove: vi.fn(async (ids) => {
        removeCalls.push(ids);
        for (const id of ids) {
          const index = tabs.findIndex((candidate) => candidate.id === id);
          if (index >= 0) tabs.splice(index, 1);
        }
      }),
    },
    tabGroups: {
      query: vi.fn(async (query: Record<string, unknown>) =>
        query.windowId === undefined
          ? mutableGroups.map((group) => ({ ...group }))
          : mutableGroups.filter((group) => group.windowId === query.windowId).map((group) => ({ ...group })),
      ),
      update: vi.fn(async (groupId, properties) => {
        updateGroupCalls.push({ groupId, properties });
        const group = mutableGroups.find((candidate) => candidate.id === groupId);
        if (!group) throw new Error("missing group");
        if (properties.title !== undefined) group.title = properties.title;
        if (properties.collapsed !== undefined) group.collapsed = properties.collapsed;
        return { ...group };
      }),
      remove: vi.fn(async (groupId) => {
        removeGroupCalls.push(groupId);
        const index = mutableGroups.findIndex((candidate) => candidate.id === groupId);
        if (index >= 0) mutableGroups.splice(index, 1);
      }),
    },
  };
}

const targetTab: BrowserTab = {
  id: 10,
  windowId: 1,
  index: 3,
  groupId: TAB_GROUP_ID_NONE,
  active: true,
  pinned: false,
  title: "Humans did not invent art",
  url: "https://aeon.co/essays/humans-did-not-invent-art-it-was-the-other-way-around",
};

const browsingGroup: BrowserTabGroup = {
  id: 42,
  windowId: 1,
  title: "Browsering",
  color: "blue",
  collapsed: false,
};

const targetUrl = "https://aeon.co/essays/humans-did-not-invent-art-it-was-the-other-way-around";

describe("FirefoxTabController", () => {
  it("opens an inactive HTTPS tab in the requested window and verifies it", async () => {
    const browser = createBrowser([targetTab], []);
    const controller = new FirefoxTabController(browser);
    const result = await controller.openTab({ url: targetUrl, windowId: 1 });

    expect(result.tab).toMatchObject({ id: 11, windowId: 1, url: targetUrl, active: false });
    expect(browser.createCalls).toEqual([{ url: targetUrl, active: false, windowId: 1 }]);
  });

  it("rejects non-HTTP URL schemes before opening a tab", async () => {
    const browser = createBrowser([targetTab], []);
    const controller = new FirefoxTabController(browser);

    await expect(controller.openTab({ url: "file:///tmp/private.txt" })).rejects.toMatchObject({
      code: "UNSUPPORTED_URL_SCHEME",
    } satisfies Partial<FirefoxTabsError>);
    expect(browser.createCalls).toHaveLength(0);
  });

  it("creates and verifies an exactly titled group from ungrouped tabs", async () => {
    const browser = createBrowser([targetTab], []);
    const controller = new FirefoxTabController(browser);
    const result = await controller.createTabGroup({ tabIds: [10], title: "Browsering", collapsed: false });

    expect(result.group).toMatchObject({ id: 100, windowId: 1, title: "Browsering", collapsed: false });
    expect(result.tabs[0]).toMatchObject({ id: 10, groupId: 100 });
    expect(browser.groupCalls).toEqual([{ tabIds: [10], createProperties: { windowId: 1 } }]);
    expect(browser.updateGroupCalls).toEqual([
      { groupId: 100, properties: { title: "Browsering", collapsed: false } },
    ]);
  });

  it("refuses to create a duplicate exact group title", async () => {
    const browser = createBrowser([targetTab], [browsingGroup]);
    const controller = new FirefoxTabController(browser);

    await expect(controller.createTabGroup({ tabIds: [10], title: "Browsering" })).rejects.toMatchObject({
      code: "GROUP_ALREADY_EXISTS",
    } satisfies Partial<FirefoxTabsError>);
    expect(browser.groupCalls).toHaveLength(0);
  });

  it("refuses to create one group from tabs in different windows", async () => {
    const browser = createBrowser([targetTab, { ...targetTab, id: 11, windowId: 2 }], []);
    const controller = new FirefoxTabController(browser);

    await expect(controller.createTabGroup({ tabIds: [10, 11], title: "Browsering" })).rejects.toMatchObject({
      code: "TABS_SPAN_WINDOWS",
    } satisfies Partial<FirefoxTabsError>);
    expect(browser.groupCalls).toHaveLength(0);
  });

  it("requires explicit permission before creating a group from a pinned tab", async () => {
    const browser = createBrowser([{ ...targetTab, pinned: true }], []);
    const controller = new FirefoxTabController(browser);

    await expect(controller.createTabGroup({ tabIds: [10], title: "Browsering" })).rejects.toMatchObject({
      code: "PINNED_TAB_REQUIRES_CONFIRMATION",
    } satisfies Partial<FirefoxTabsError>);
    expect(browser.groupCalls).toHaveLength(0);
  });

  it("does not move an already grouped tab while creating a new group", async () => {
    const browser = createBrowser([{ ...targetTab, groupId: 42 }], [browsingGroup]);
    const controller = new FirefoxTabController(browser);

    await expect(controller.createTabGroup({ tabIds: [10], title: "Research" })).rejects.toMatchObject({
      code: "TAB_ALREADY_GROUPED",
    } satisfies Partial<FirefoxTabsError>);
    expect(browser.groupCalls).toHaveLength(0);
  });

  it("moves one exact URL match into one exact group and verifies it", async () => {
    const browser = createBrowser([targetTab], [browsingGroup]);
    const controller = new FirefoxTabController(browser);
    const result = await controller.moveTabToGroup({
      selector: { url: targetUrl },
      groupTitle: "Browsering",
    });

    expect(result.changed).toBe(true);
    expect(result.before.groupId).toBe(TAB_GROUP_ID_NONE);
    expect(result.after.groupId).toBe(42);
    expect(browser.groupCalls).toEqual([{ tabIds: [10], groupId: 42 }]);
  });

  it("fails safely when a URL matches more than one tab", async () => {
    const browser = createBrowser([targetTab, { ...targetTab, id: 11, windowId: 2 }], [browsingGroup]);
    const controller = new FirefoxTabController(browser);

    await expect(
      controller.moveTabToGroup({ selector: { url: targetUrl }, groupTitle: "Browsering" }),
    ).rejects.toMatchObject({ code: "AMBIGUOUS_TAB" } satisfies Partial<FirefoxTabsError>);
    expect(browser.groupCalls).toHaveLength(0);
  });

  it("rejects selectors that combine multiple identity fields", async () => {
    const browser = createBrowser([targetTab], [browsingGroup]);
    const controller = new FirefoxTabController(browser);

    await expect(
      controller.moveTabToGroup({
        selector: { tabId: 10, url: targetUrl },
        groupTitle: "Browsering",
      }),
    ).rejects.toMatchObject({ code: "INVALID_SELECTOR" } satisfies Partial<FirefoxTabsError>);
    expect(browser.groupCalls).toHaveLength(0);
  });

  it("treats an already grouped tab as a verified no-op", async () => {
    const browser = createBrowser([{ ...targetTab, groupId: 42 }], [browsingGroup]);
    const controller = new FirefoxTabController(browser);
    const result = await controller.moveTabToGroup({ selector: { tabId: 10 }, groupTitle: "Browsering" });

    expect(result.changed).toBe(false);
    expect(browser.groupCalls).toHaveLength(0);
  });

  it("requires explicit permission before grouping a pinned tab", async () => {
    const browser = createBrowser([{ ...targetTab, pinned: true }], [browsingGroup]);
    const controller = new FirefoxTabController(browser);

    await expect(
      controller.moveTabToGroup({ selector: { tabId: 10 }, groupTitle: "Browsering" }),
    ).rejects.toMatchObject({ code: "PINNED_TAB_REQUIRES_CONFIRMATION" } satisfies Partial<FirefoxTabsError>);
    expect(browser.groupCalls).toHaveLength(0);
  });

  it("searches for a group only in the tab's own window", async () => {
    const browser = createBrowser([targetTab], [{ ...browsingGroup, windowId: 2 }]);
    const controller = new FirefoxTabController(browser);

    await expect(
      controller.moveTabToGroup({ selector: { tabId: 10 }, groupTitle: "Browsering" }),
    ).rejects.toMatchObject({ code: "GROUP_NOT_FOUND" } satisfies Partial<FirefoxTabsError>);
  });

  it("can ignore only a URL fragment when explicitly requested", async () => {
    const browser = createBrowser([{ ...targetTab, url: `${targetUrl}#comments` }], [browsingGroup]);
    const controller = new FirefoxTabController(browser);
    const result = await controller.moveTabToGroup({
      selector: { url: targetUrl, ignoreUrlFragment: true },
      groupTitle: "Browsering",
    });

    expect(result.after.groupId).toBe(42);
  });

  it("ungroups and verifies the selected tab", async () => {
    const browser = createBrowser([{ ...targetTab, groupId: 42 }], [browsingGroup]);
    const controller = new FirefoxTabController(browser);
    const result = await controller.ungroupTab({ selector: { tabId: 10 } });

    expect(result.changed).toBe(true);
    expect(result.after.groupId).toBe(TAB_GROUP_ID_NONE);
    expect(browser.ungroupCalls).toEqual([10]);
  });

  it("moves an exact tab to a target index and verifies it", async () => {
    const secondTab: BrowserTab = { ...targetTab, id: 11, index: 2 };
    const browser = createBrowser([targetTab, secondTab], []);
    const controller = new FirefoxTabController(browser);
    const result = await controller.repositionTab({ selector: { tabId: 10 }, index: 0 });

    expect(result.changed).toBe(true);
    expect(result.before.index).toBe(3);
    expect(result.after.index).toBe(0);
    expect(browser.moveCalls).toEqual([{ tabId: 10, index: 0 }]);
  });

  it("moves a tab to the end of its window with index -1", async () => {
    const secondTab: BrowserTab = { ...targetTab, id: 11, index: 2 };
    const browser = createBrowser([targetTab, secondTab], []);
    const controller = new FirefoxTabController(browser);
    const result = await controller.repositionTab({ selector: { tabId: 10 }, index: -1 });

    expect(result.after.index).toBe(1);
    expect(browser.moveCalls).toEqual([{ tabId: 10, index: 1 }]);
  });

  it("treats an already positioned tab as a verified no-op", async () => {
    const firstTab: BrowserTab = { ...targetTab, index: 0 };
    const secondTab: BrowserTab = { ...targetTab, id: 11, index: 1 };
    const browser = createBrowser([firstTab, secondTab], []);
    const controller = new FirefoxTabController(browser);
    const result = await controller.repositionTab({ selector: { tabId: 10 }, index: 0 });

    expect(result.changed).toBe(false);
    expect(browser.moveCalls).toHaveLength(0);
  });

  it("clamps an out-of-range target index to the window end", async () => {
    const secondTab: BrowserTab = { ...targetTab, id: 11, index: 2 };
    const browser = createBrowser([targetTab, secondTab], []);
    const controller = new FirefoxTabController(browser);
    const result = await controller.repositionTab({ selector: { tabId: 10 }, index: 999 });

    expect(result.after.index).toBe(1);
    expect(browser.moveCalls).toEqual([{ tabId: 10, index: 1 }]);
  });

  it("rejects an invalid target index", async () => {
    const browser = createBrowser([targetTab], []);
    const controller = new FirefoxTabController(browser);
    await expect(controller.repositionTab({ selector: { tabId: 10 }, index: -2 })).rejects.toMatchObject({
      code: "INVALID_TAB_INDEX",
    } satisfies Partial<FirefoxTabsError>);
    expect(browser.moveCalls).toHaveLength(0);
  });

  it("fails safely when a reposition selector is ambiguous", async () => {
    const browser = createBrowser([targetTab, { ...targetTab, id: 11, windowId: 2 }], []);
    const controller = new FirefoxTabController(browser);
    await expect(
      controller.repositionTab({ selector: { url: targetUrl }, index: 0 }),
    ).rejects.toMatchObject({ code: "AMBIGUOUS_TAB" } satisfies Partial<FirefoxTabsError>);
    expect(browser.moveCalls).toHaveLength(0);
  });

  it("closes a batch of tabs by id and verifies they are gone", async () => {
    const secondTab: BrowserTab = { ...targetTab, id: 11, index: 2 };
    const browser = createBrowser([targetTab, secondTab], []);
    const controller = new FirefoxTabController(browser);
    const result = await controller.closeTabs({ tabIds: [10, 11] });

    expect(result.changed).toBe(true);
    expect(result.closedTabs.map((tab) => tab.id)).toEqual([10, 11]);
    expect(browser.removeCalls).toEqual([[10, 11]]);
  });

  it("rejects closing unknown, empty, or duplicate tab id batches", async () => {
    const browser = createBrowser([targetTab], []);
    const controller = new FirefoxTabController(browser);
    await expect(controller.closeTabs({ tabIds: [999] })).rejects.toMatchObject({ code: "TAB_NOT_FOUND" });
    await expect(controller.closeTabs({ tabIds: [] })).rejects.toMatchObject({ code: "INVALID_TAB_IDS" });
    await expect(controller.closeTabs({ tabIds: [10, 10] })).rejects.toMatchObject({ code: "INVALID_TAB_IDS" });
    expect(browser.removeCalls).toHaveLength(0);
  });

  it("closes every tab of an exactly named group and removes the group", async () => {
    const groupedTab: BrowserTab = { ...targetTab, groupId: 42 };
    const secondTab: BrowserTab = { ...targetTab, id: 11, index: 2, groupId: 42 };
    const browser = createBrowser([groupedTab, secondTab], [browsingGroup]);
    const controller = new FirefoxTabController(browser);
    const result = await controller.closeTabGroup({ groupTitle: "Browsering" });

    expect(result.removedGroup).toBe(true);
    expect(result.closedTabs.map((tab) => tab.id)).toEqual([10, 11]);
    expect(browser.removeCalls).toEqual([[10, 11]]);
    expect(browser.removeGroupCalls).toEqual([42]);
  });

  it("removes an empty group when closing it", async () => {
    const browser = createBrowser([targetTab], [browsingGroup]);
    const controller = new FirefoxTabController(browser);
    const result = await controller.closeTabGroup({ groupTitle: "Browsering" });

    expect(result.closedTabs).toHaveLength(0);
    expect(result.removedGroup).toBe(true);
    expect(browser.removeCalls).toHaveLength(0);
    expect(browser.removeGroupCalls).toEqual([42]);
  });

  it("merges a source group into a target group and removes the empty source", async () => {
    const sourceGroup: BrowserTabGroup = { id: 42, windowId: 1, title: "Trading", color: "red", collapsed: false };
    const targetGroup: BrowserTabGroup = { id: 43, windowId: 1, title: "Investing", color: "blue", collapsed: false };
    const fromTab: BrowserTab = { ...targetTab, groupId: 42 };
    const fromTab2: BrowserTab = { ...targetTab, id: 11, index: 2, groupId: 42 };
    const browser = createBrowser([fromTab, fromTab2], [sourceGroup, targetGroup]);
    const controller = new FirefoxTabController(browser);
    const result = await controller.mergeTabGroups({ from: "Trading", to: "Investing" });

    expect(result.merged).toBe(2);
    expect(result.removedGroup).toBe(true);
    expect(result.group.id).toBe(43);
    expect(result.tabs.every((tab) => tab.groupId === 43)).toBe(true);
    expect(browser.removeGroupCalls).toEqual([42]);
  });

  it("rejects merging a group into itself", async () => {
    const browser = createBrowser([targetTab], [browsingGroup]);
    const controller = new FirefoxTabController(browser);
    await expect(
      controller.mergeTabGroups({ from: "Browsering", to: "Browsering" }),
    ).rejects.toMatchObject({ code: "INVALID_MERGE_TARGETS" });
  });

  it("merges groups across windows by moving tabs to the target window", async () => {
    const sourceGroup: BrowserTabGroup = { id: 42, windowId: 1, title: "Trading", color: "red", collapsed: false };
    const targetGroup: BrowserTabGroup = { id: 43, windowId: 2, title: "Investing", color: "blue", collapsed: false };
    const fromTab: BrowserTab = { ...targetTab, groupId: 42 };
    const browser = createBrowser([fromTab], [sourceGroup, targetGroup]);
    const controller = new FirefoxTabController(browser);
    const result = await controller.mergeTabGroups({ from: "Trading", to: "Investing" });

    expect(browser.moveToWindowCalls).toEqual([{ tabId: 10, windowId: 2 }]);
    expect(result.tabs).toHaveLength(1);
    expect(result.tabs[0]).toMatchObject({ groupId: 43, windowId: 2 });
    expect(browser.removeGroupCalls).toEqual([42]);
  });

  it("renames a group and rejects duplicate new titles", async () => {
    const otherGroup: BrowserTabGroup = { id: 43, windowId: 1, title: "Research", color: "blue", collapsed: false };
    const browser = createBrowser([targetTab], [browsingGroup, otherGroup]);
    const controller = new FirefoxTabController(browser);
    const result = await controller.renameTabGroup({ groupTitle: "Browsering", newTitle: "Reading" });
    expect(result.changed).toBe(true);
    expect(result.after.title).toBe("Reading");

    await expect(
      controller.renameTabGroup({ groupTitle: "Reading", newTitle: "Research" }),
    ).rejects.toMatchObject({ code: "GROUP_ALREADY_EXISTS" });
  });

  it("collapses and expands a group with verification", async () => {
    const browser = createBrowser([targetTab], [browsingGroup]);
    const controller = new FirefoxTabController(browser);
    const collapsed = await controller.setTabGroupCollapsed({ groupTitle: "Browsering", collapsed: true });
    expect(collapsed.changed).toBe(true);
    expect(collapsed.after.collapsed).toBe(true);

    const noop = await controller.setTabGroupCollapsed({ groupTitle: "Browsering", collapsed: true });
    expect(noop.changed).toBe(false);
  });

  it("moves a tab into a group in another window when windowId is given", async () => {
    const otherWindowGroup: BrowserTabGroup = { id: 43, windowId: 2, title: "Research", color: "blue", collapsed: false };
    const browser = createBrowser([targetTab], [otherWindowGroup]);
    const controller = new FirefoxTabController(browser);
    const result = await controller.moveTabToGroup({
      selector: { tabId: 10 },
      groupTitle: "Research",
      windowId: 2,
    });

    expect(browser.moveToWindowCalls).toEqual([{ tabId: 10, windowId: 2 }]);
    expect(result.after).toMatchObject({ groupId: 43, windowId: 2 });
  });

  it("still rejects cross-window moves without an explicit windowId", async () => {
    const otherWindowGroup: BrowserTabGroup = { id: 43, windowId: 2, title: "Research", color: "blue", collapsed: false };
    const browser = createBrowser([targetTab], [otherWindowGroup]);
    const controller = new FirefoxTabController(browser);
    await expect(
      controller.moveTabToGroup({ selector: { tabId: 10 }, groupTitle: "Research" }),
    ).rejects.toMatchObject({ code: "GROUP_NOT_FOUND" });
    expect(browser.moveToWindowCalls).toHaveLength(0);
  });

  it("lists windows with per-window tab and group counts", async () => {
    const windowTwoTab: BrowserTab = { ...targetTab, id: 11, windowId: 2, index: 0 };
    const groupedTab: BrowserTab = { ...targetTab, id: 12, windowId: 1, index: 4, groupId: 42 };
    const secondGroup: BrowserTabGroup = { id: 43, windowId: 1, title: "Research", color: "blue", collapsed: true };
    const browser = createBrowser(
      [targetTab, groupedTab, windowTwoTab],
      [browsingGroup, secondGroup],
    );
    const controller = new FirefoxTabController(browser);
    const result = await controller.listWindows();

    expect(result.windows).toEqual([
      {
        windowId: 1,
        tabCount: 2,
        groupCount: 1,
        groups: [{ id: 42, title: "Browsering", collapsed: false, tabCount: 1 }],
      },
      { windowId: 2, tabCount: 1, groupCount: 0, groups: [] },
    ]);
  });
});
