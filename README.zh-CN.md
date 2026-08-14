# Agent Bridge for Tab Management in Firefox

[English](README.md)

让任何你信任的 AI Agent 直接管理你正在使用的 Firefox 标签页和标签组——打开网页、建组、移组、取消分组，无需复制粘贴令牌，也不用碰浏览器界面。

完全本地运行。无账号、无云端、无遥测。

## 能做什么

- 列出实时标签页和标签组。
- 后台打开 `http`/`https` 页面（不抢占焦点）。
- 按精确名称创建、移动、移除标签组。
- 置顶/取消置顶/复制/静音标签页，恢复误关的标签页，跨窗口移动。
- 批量打开 URL 并原子入组；合并、重命名、着色、折叠标签组。
- 事件驱动地知道页面何时加载完成，以及当前活动标签页。
- 拒绝歧义匹配、重复组名、跨窗口分组和未经确认的取消置顶。
- 每次修改后都会回读 Firefox 状态验证成功后才报告。

## 它能帮你做什么

### 先收集，后阅读

刷信息流、聊天或在别的设备上工作时，你会不断遇到想仔细读的文章、文档和资料链接。与其自己一个个打开整理，不如把链接直接发给你的 Agent：

> 在 Firefox 后台打开这些 URL，把所有新标签页放进名为"待读"的标签组（不存在才创建）。

页面在后台打开、不抢焦点、自动归入一个组。稍后坐到电脑前，把它当成一个专注的阅读队列逐个处理。Firefox 标签组从此变成你的"网页收件箱"——更少杂乱、更少切换、零手工整理。

### 边看边整理研究资料

刷信息流或跨主题工作时，分批把链接发给 Agent：

> 在后台打开这三篇文章，归入"研究"组。

每个主题都有自己整洁的组，完全不打断你正在做的事。

### 一句话重新分组

想换一种结构？直接说：

> 把"交易"组里的所有标签页移到"投资"组。

一次原子的 `merge_firefox_tab_groups` 调用移动整个组、自动删除空源组并验证目标组里的每个标签页——不需要逐标签页循环。

### 让重要标签页排最前

同时开着很多页面？让顺序变得有意义：

> 把"季度报告"那个标签页移到窗口最前面。

精确匹配找到正确的标签页，`move_firefox_tab` 把它放到你要的位置，并经过 Firefox 验证。

### 任务结束一键复位

> 关闭"已完成"组，并把窗口里其他标签页全部取消分组。

`close_firefox_tab_group` 连同空组一起验证关闭；取消分组让其余标签页回到干净状态——每一步都先经 Firefox 验证再报告。

### 开一个新窗口从头开始

> 在后台开一个新窗口，把这些链接放进里面的"研究"组。

`new_firefox_window` 创建并验证新窗口，然后用组工具把链接归档进去——一个专属研究窗口，完全不打断当前工作。

### 让标签组保持整洁

> 把"临时"组改名为"稍后"，先折叠起来，等我回来再展开。

精确重命名（拒绝重名）+ 验证折叠/展开，一句话就能让标签栏保持清爽。

### 固定习惯，自动归档

养成习惯：一天里随手把文章链接、文档和参考页发给 Agent。它自动把它们归档到正确的组里，标签页始终保持整洁，完全不用你动手。

## 三步安装

### 1. 安装扩展

从[最新 Release](https://github.com/Johnnyzlee/agent-bridge-for-tab-management-in-firefox/releases) 下载 `tab_management_agent_bridge_for_firefox-0.5.5.xpi`，用 Firefox 打开即可。

### 2. 运行一次 setup

```bash
npm run quickstart
```

它会构建全部组件并注册本地桥接：

- 创建本地配置（端口 + 自动生成的密钥，权限 0600）；
- 注册 Native Messaging Host，让 Firefox 能找到它；
- 生成不含任何密钥的客户端配置 `.local/mcp-config.json`。

密钥由系统自动创建和管理——你永远看不到它，任何客户端配置里也不含它。需要修复注册时随时重跑 `npm run setup`。

### 3. 连接你的 Agent

#### Claude Code

```bash
claude mcp add firefox-tabs -- node /绝对路径/agent-bridge-for-tab-management-in-firefox/dist/server/index.js
```

然后重启 Claude Code。也可以把等价的 `mcpServers` 条目写进 `~/.claude.json`。

#### Codex

```bash
.local/add-to-codex.sh        # macOS / Linux
.local/add-to-codex.ps1       # Windows PowerShell
```

然后重启 Codex。

#### Hermes

在 `~/.hermes/config.yaml` 中添加：

```yaml
mcp_servers:
  firefox-tabs:
    command: node
    args:
      - /绝对路径/agent-bridge-for-tab-management-in-firefox/dist/server/index.js
    enabled: true
```

然后重启 Hermes（`hermes gateway restart`）。

#### OpenClaw

在 `~/.openclaw/openclaw.json` 中添加：

```json5
{
  mcp: {
    servers: {
      "firefox-tabs": {
        command: "node",
        args: ["/绝对路径/agent-bridge-for-tab-management-in-firefox/dist/server/index.js"],
        enabled: true
      }
    }
  }
}
```

或用命令行：`openclaw mcp add firefox-tabs --command node --arg /绝对路径/dist/server/index.js`

#### OpenCode

在 `~/.config/opencode/opencode.jsonc` 中添加：

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "firefox-tabs": {
      "type": "local",
      "command": ["node", "/绝对路径/agent-bridge-for-tab-management-in-firefox/dist/server/index.js"],
      "enabled": true
    }
  }
}
```

#### WorkBuddy

在 `~/.workbuddy/mcp.json` 中添加：

```json
{
  "mcpServers": {
    "firefox-tabs": {
      "command": "node",
      "args": ["/绝对路径/agent-bridge-for-tab-management-in-firefox/dist/server/index.js"]
    }
  }
}
```

#### 其他 MCP 客户端

把 `.local/mcp-config.json`（或下面的等价配置）合并进你的客户端配置：

```json
{
  "mcpServers": {
    "firefox-tabs": {
      "command": "node",
      "args": ["/绝对路径/agent-bridge-for-tab-management-in-firefox/dist/server/index.js"]
    }
  }
}
```

Server 会自动从共享的本地配置读取端口和密钥。无需环境变量，客户端配置里没有任何秘密。

## 验证

对你的 Agent 说：

> 检查 Firefox bridge 状态，列出我的标签组，打开 https://example.com，并放入标题完全一致的 Research 组（不存在才创建），最后验证 group ID。

或者打开扩展选项页：显示自动配置状态、连接状态和本地端口——没有其他需要配置的东西。

## 多 Agent 同时连接

共享 Broker 监听 `127.0.0.1:8767`，在单条 Firefox 连接上多路复用任意数量的 Agent。第一个启动的 MCP server 自动成为 Broker，其他实例自动以客户端身份接入——Claude Code、Hermes、OpenClaw、Codex、OpenCode 可以同时管理同一个 Firefox 会话。每个客户端仍用本地配置中的同一个共享密钥认证；你的客户端配置完全不用改。

## 与 Firefox 官方 MCP 互补使用

Mozilla 官方的 [Firefox DevTools MCP](https://github.com/mozilla/firefox-devtools-mcp) 为 Agent 提供 DevTools 调试能力（控制台、网络、DOM 检查），**不包含标签页和原生标签组管理**。

本项目恰好补上这一块：打开/关闭/复制/静音/置顶/恢复标签页，以及创建/移动/合并/重命名/着色/折叠/关闭原生标签组——全部精确匹配、支持跨窗口、写后验证。两者功能完全不重叠，可以在同一个客户端里同时配置、叠加使用：调试用 Firefox DevTools MCP，标签页和组整理用本项目。

## 常用命令

```bash
npm start                 # 启动 MCP server
npm run doctor            # 检查配置、权限和 Native Host 注册
npm run uninstall         # 移除 Native Host 注册（保留配置）
npm run uninstall --purge # 同时删除本地配置
```

## 隐私与安全

- 完全运行在本机；Native Messaging Host 不连接任何远程服务。
- WebSocket 桥接只监听 `127.0.0.1`，使用自动管理的密钥认证（timing-safe 比较，无免密钥降级）。
- Native Messaging 只允许签名扩展 ID 访问。
- 扩展从不读取网页内容。详见 [PRIVACY.md](PRIVACY.md) 和 [SECURITY.md](SECURITY.md)。

## 开发

需要 Firefox 142+、Node.js 20+：

```bash
npm ci
npm run check
```

基于 [MPL-2.0](LICENSE) 开源。独立项目，与 Mozilla 无背书关系。
