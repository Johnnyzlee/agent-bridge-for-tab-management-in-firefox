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
  return {
    createCalls,
    groupCalls,
    ungroupCalls,
    updateGroupCalls,
    moveCalls,
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
        group.title = properties.title;
        if (properties.collapsed !== undefined) group.collapsed = properties.collapsed;
        return { ...group };
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
});
