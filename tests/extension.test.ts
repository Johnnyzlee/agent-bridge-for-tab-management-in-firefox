import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..");

describe("extension assets", () => {
  it("no longer asks the user for a token or offers token generation", async () => {
    const html = await readFile(path.join(repoRoot, "extension", "options.html"), "utf8");
    expect(html).not.toMatch(/type=["']password["']/);
    expect(html).not.toMatch(/id=["']token["']/);
    expect(html).not.toMatch(/生成令牌/);
    expect(html).not.toMatch(/复制令牌/);
    expect(html).toContain("重新连接");
    expect(html).toContain("修复 / 重新检测本地安装");

    const js = await readFile(path.join(repoRoot, "extension", "options.js"), "utf8");
    expect(js).not.toMatch(/bridgeToken/);
    expect(js).not.toMatch(/generateToken/);
  });

  it("declares nativeMessaging permission and keeps the stable Gecko ID", async () => {
    const manifest = JSON.parse(await readFile(path.join(repoRoot, "extension", "manifest.json"), "utf8"));
    expect(manifest.permissions).toContain("nativeMessaging");
    expect(manifest.permissions).toContain("tabs");
    expect(manifest.permissions).toContain("tabGroups");
    expect(manifest.browser_specific_settings.gecko.id).toBe("firefox-tabs-mcp@local.invalid");
    expect(manifest.version).toBe("0.4.0");
    expect(manifest.content_security_policy).toContain("ws://127.0.0.1:*");
  });

  it("keeps the URL restriction and write-safety in the MCP tool descriptions", async () => {
    const mcp = await readFile(path.join(repoRoot, "mcp-server", "mcp.ts"), "utf8");
    expect(mcp).toContain("Only http:// and https:// URLs are allowed.");
    expect(mcp).toContain("allowUnpin: z");
    expect(mcp).toContain("Create a new, exactly titled Firefox group from one or more ungrouped tabs");
    expect(mcp).toContain("Move one exactly identified Firefox tab into an existing, exactly named group");
  });
});
