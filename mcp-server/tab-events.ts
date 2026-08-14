import { WebSocket } from "ws";
import { FirefoxTabsError } from "../shared/errors.js";

interface TabCompleteRecord {
  url: string;
  title: string;
  completedAt: number;
}

interface TabWaiter {
  timer: NodeJS.Timeout;
  agent?: WebSocket;
  respond(result: unknown): void;
  reject(error: FirefoxTabsError): void;
}

export interface TabEventTrackerOptions {
  maxCompletedTabs?: number;
}

export class TabEventTracker {
  private readonly completedTabs = new Map<number, TabCompleteRecord>();
  private readonly tabWaiters = new Map<number, Set<TabWaiter>>();
  private readonly maxCompletedTabs: number;

  constructor(options: TabEventTrackerOptions = {}) {
    this.maxCompletedTabs = options.maxCompletedTabs ?? 500;
  }

  handleEvent(message: Record<string, unknown>): void {
    if (message.event !== "tab_complete") return;
    const data = message.data as { tabId?: unknown; url?: unknown; title?: unknown } | undefined;
    if (data === undefined || typeof data.tabId !== "number" || !Number.isInteger(data.tabId) || data.tabId <= 0) {
      return;
    }
    const record: TabCompleteRecord = {
      url: typeof data.url === "string" ? data.url : "",
      title: typeof data.title === "string" ? data.title : "",
      completedAt: Date.now(),
    };
    this.completedTabs.set(data.tabId, record);
    if (this.completedTabs.size > this.maxCompletedTabs) {
      const oldest = this.completedTabs.keys().next().value;
      if (oldest !== undefined) {
        this.completedTabs.delete(oldest);
      }
    }
    const waiters = this.tabWaiters.get(data.tabId);
    if (waiters && waiters.size > 0) {
      this.tabWaiters.delete(data.tabId);
      for (const waiter of waiters) {
        clearTimeout(waiter.timer);
        waiter.respond({ tabId: data.tabId, url: record.url, title: record.title, completedAt: record.completedAt, waitedMs: 0 });
      }
    }
  }

  handleAgentWait(agent: WebSocket, requestId: string, params: unknown): void {
    const raw = params as { tabId?: unknown; timeoutMs?: unknown };
    const tabId = raw.tabId;
    if (typeof tabId !== "number" || !Number.isInteger(tabId) || tabId <= 0) {
      agent.send(
        JSON.stringify({
          type: "response",
          id: requestId,
          ok: false,
          error: { code: "INVALID_TAB_ID", message: "tabId must be a positive integer." },
        }),
      );
      return;
    }
    const timeoutMs = this.timeoutOf(raw.timeoutMs);
    const respond = (result: unknown): void => {
      agent.send(JSON.stringify({ type: "response", id: requestId, ok: true, result }));
    };
    const respondError = (code: string, message: string): void => {
      agent.send(JSON.stringify({ type: "response", id: requestId, ok: false, error: { code, message } }));
    };

    const cached = this.completedTabs.get(tabId);
    if (cached) {
      respond({ tabId, url: cached.url, title: cached.title, completedAt: cached.completedAt, waitedMs: 0 });
      return;
    }
    const waiter: TabWaiter = {
      timer: setTimeout(() => {
        this.removeWaiter(tabId, waiter);
        respondError("TAB_LOAD_TIMEOUT", `Firefox did not report tab ${tabId} as loaded within the timeout.`);
      }, timeoutMs),
      agent,
      respond,
      reject: (error) => respondError(error.code, error.message),
    };
    this.addWaiter(tabId, waiter);
  }

  async waitForTab(params: unknown): Promise<unknown> {
    const raw = params as { tabId?: unknown; timeoutMs?: unknown };
    const tabId = raw.tabId;
    if (typeof tabId !== "number" || !Number.isInteger(tabId) || tabId <= 0) {
      throw new FirefoxTabsError("INVALID_TAB_ID", "tabId must be a positive integer.");
    }
    const timeoutMs = this.timeoutOf(raw.timeoutMs);
    const cached = this.completedTabs.get(tabId);
    if (cached) {
      return { tabId, url: cached.url, title: cached.title, completedAt: cached.completedAt, waitedMs: 0 };
    }
    return new Promise<unknown>((resolve, reject) => {
      const waiter: TabWaiter = {
        timer: setTimeout(() => {
          this.removeWaiter(tabId, waiter);
          reject(new FirefoxTabsError("TAB_LOAD_TIMEOUT", `Firefox did not report tab ${tabId} as loaded within the timeout.`));
        }, timeoutMs),
        respond: (result) => {
          clearTimeout(waiter.timer);
          resolve(result);
        },
        reject,
      };
      this.addWaiter(tabId, waiter);
    });
  }

  rejectAllWaiters(error: FirefoxTabsError): void {
    for (const [tabId, waiters] of this.tabWaiters) {
      for (const waiter of waiters) {
        clearTimeout(waiter.timer);
        waiter.reject(error);
      }
    }
    this.tabWaiters.clear();
  }

  rejectWaitersForAgent(agent: WebSocket): void {
    for (const [tabId, waiters] of this.tabWaiters) {
      for (const waiter of waiters) {
        if (waiter.agent === agent) {
          clearTimeout(waiter.timer);
          waiters.delete(waiter);
        }
      }
      if (waiters.size === 0) {
        this.tabWaiters.delete(tabId);
      }
    }
  }

  clear(): void {
    this.completedTabs.clear();
  }

  stop(): void {
    for (const waiters of this.tabWaiters.values()) {
      for (const waiter of waiters) {
        clearTimeout(waiter.timer);
      }
    }
    this.tabWaiters.clear();
    this.completedTabs.clear();
  }

  private addWaiter(tabId: number, waiter: TabWaiter): void {
    let waiters = this.tabWaiters.get(tabId);
    if (!waiters) {
      waiters = new Set<TabWaiter>();
      this.tabWaiters.set(tabId, waiters);
    }
    waiters.add(waiter);
  }

  private removeWaiter(tabId: number, waiter: TabWaiter): void {
    const waiters = this.tabWaiters.get(tabId);
    if (!waiters) return;
    waiters.delete(waiter);
    if (waiters.size === 0) {
      this.tabWaiters.delete(tabId);
    }
  }

  private timeoutOf(raw: unknown): number {
    return Math.min(Math.max(typeof raw === "number" ? raw : 10_000, 100), 30_000);
  }
}
