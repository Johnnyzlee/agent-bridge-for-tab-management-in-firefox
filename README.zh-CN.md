# Agent Bridge for Tab Management in Firefox

[English](README.md)

让任何你信任的 AI Agent 直接管理你正在使用的 Firefox 标签页和标签组——打开网页、建组、移组、取消分组，无需复制粘贴令牌，也不用碰浏览器界面。

完全本地运行。无账号、无云端、无遥测。

## 能做什么

- 列出实时标签页和标签组。
- 后台打开 `http`/`https` 页面（不抢占焦点）。
- 按精确名称创建、移动、移除标签组。
- 拒绝歧义匹配、重复组名、跨窗口分组和未经确认的取消置顶。
- 每次修改后都会回读 Firefox 状态验证成功后才报告。

## 三步安装

### 1. 安装扩展

从[最新 Release](https://github.com/Johnnyzlee/agent-bridge-for-tab-management-in-firefox/releases) 下载 `tab_management_agent_bridge_for_firefox-0.4.1.xpi`，用 Firefox 打开即可。

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

#### OpenCLAW

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

## 常用命令

```bash
npm start                 # 启动 MCP server
npm run doctor            # 检查配置、权限和 Native Host 注册
npm run uninstall         # 移除 Native Host 注册（保留配置）
npm run uninstall --purge # 同时删除本地配置
```

## 典型场景：先收集，后阅读

浏览时把 URL 发给你的 Agent：

> 在 Firefox 后台打开这些 URL，全部放进名为"待读"的标签组（不存在才创建）。

页面在后台打开并自动归组。稍后坐到电脑前，把它当作一个专注的阅读队列逐个处理。

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
