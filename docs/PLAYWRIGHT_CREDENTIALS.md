# Playwright MCP 浏览器模式与凭证管理

## 三种模式一览

| | persistent（默认推荐） | isolated | extension |
|---|---|---|---|
| **一句话** | **懒人模式** — 登录一次，永久生效 | **开发模式** — 验证登录流程的自动化测试 | 连接真实浏览器（实验性） |
| **使用的浏览器** | Chrome for Testing（Playwright 自带） | Chrome for Testing（Playwright 自带） | **用户的真实 Chrome/Edge** |
| **登录态** | 持久化，关闭后下次自动恢复 | 每次从 JSON 快照加载（auth 录制一次） | 直接复用浏览器已有登录态 |
| **典型场景** | Google SSO、企业内网 API 文档拉取、日常维护开发 | 验证登录流程本身、需要可重复的干净测试环境 | 需要浏览器插件或绕过自动化检测 |
| **状态存储** | `.claude-coder/.runtime/browser-profile/` | `.claude-coder/playwright-auth.json` | 无（浏览器自身管理） |
| **前置安装** | `npx playwright install chromium` | `npx playwright install chromium` | Playwright MCP Bridge 扩展 |
| **.mcp.json 参数** | `--user-data-dir=<path>` | `--isolated --storage-state=<path>` | `--extension` |

### 如何选择

- **persistent（推荐）**：适合需要 Google 登录态、内网 API 获取等场景。登录一次，后续所有 MCP 会话自动复用。
- **isolated**：适合需要验证登录流程的自动化测试，或需要每次干净环境的场景。cookies 过期后需重新 `auth`。
- **extension**（实验性）：适合需要浏览器插件（VPN、广告拦截等）的场景。需安装 Chrome 扩展。

---

## 前置安装

### persistent / isolated 模式

```bash
# 安装 Playwright 自带的 Chromium 浏览器（Chrome for Testing）
npx playwright install chromium
```

安装后位于 `~/Library/Caches/ms-playwright/chromium-*/`（macOS）。这不是你的真实 Chrome，是 Playwright 专用的自动化浏览器。

### extension 模式

1. 在真实 Chrome/Edge 中安装 [Playwright MCP Bridge](https://chromewebstore.google.com/detail/playwright-mcp-bridge/mmlmfjhmonkocbjadbfplnigmagldckm) 扩展
2. 确保扩展已启用
3. 无需安装 Chromium

---

## 配置流程

### Step 1：选择模式

```bash
claude-coder setup
# → 启用 Playwright MCP → 选择模式（persistent / isolated / extension）
# → 模式写入 .claude-coder/.env 的 MCP_PLAYWRIGHT_MODE
```

### Step 2：运行认证

```bash
# persistent / isolated：打开浏览器，手动登录后关闭
claude-coder auth http://your-target-url.com

# extension：不开浏览器，只生成 .mcp.json 配置
claude-coder auth
```

`auth` 命令会自动完成：
1. 根据当前模式执行对应的认证流程
2. 生成/更新 `.mcp.json`（Claude Code SDK 读取此文件启动 MCP 服务）
3. 更新 `.gitignore`
4. 启用 `.env` 中 `MCP_PLAYWRIGHT=true`

### Step 3：开始使用

```bash
claude-coder run "你的需求"
# Agent 自动通过 Playwright MCP 工具操作浏览器
```

---

## 各模式详细说明

### persistent 模式（默认）

**原理**：使用 `--user-data-dir` 创建持久化浏览器配置文件（类似 Chrome Profile）。所有 cookies、localStorage、IndexedDB、Service Worker 状态都保留在磁盘上。

```
.claude-coder/.runtime/browser-profile/   ← 持久化浏览器配置（~20-50MB）
```

**优点**：
- 登录状态完整保留，包括 Google SSO、OAuth 回调等复杂流程
- 无需重复登录
- cookies 自动续期

**缺点**：
- 配置目录较大
- 不同 session 共享状态（非隔离）

### isolated 模式

**原理**：使用 `--isolated --storage-state` 将 cookies + localStorage 快照注入新的隔离上下文。每次 MCP 会话从 JSON 文件重新加载。

```
.claude-coder/playwright-auth.json   ← cookies + localStorage 快照（~10-20KB）
```

**优点**：
- 每次 session 从相同状态开始，可重复性好
- 状态文件小，可版本控制（脱敏后）

**缺点**：
- cookies 过期后需重新 `claude-coder auth`
- Google SSO 等复杂登录可能无法完整恢复（缺少 IndexedDB/Service Worker 状态）

### extension 模式

**原理**：使用 `--extension` 通过 Chrome 扩展（WebSocket CDP relay）连接到用户正在运行的真实浏览器。

**优点**：
- 直接复用浏览器已有登录态，无需额外认证
- 可使用浏览器已安装的扩展（VPN、广告拦截等）
- 绕过自动化检测

**缺点**：
- 需要安装 [Playwright MCP Bridge](https://chromewebstore.google.com/detail/playwright-mcp-bridge/mmlmfjhmonkocbjadbfplnigmagldckm) 扩展
- Agent 操作会影响用户正在使用的浏览器
- 首次连接需要用户审批（可用 Token 自动跳过）

---

## 测试凭证管理

除浏览器登录态外，Agent 还需要 API Key、测试账号等凭证：

| 文件 | 创建方 | 写入方 | 用途 |
|------|--------|--------|------|
| `.claude-coder/.env` | `setup` | 用户 | 模型配置、MCP 开关 |
| `.claude-coder/test.env` | Agent 或用户 | Agent + 用户 | 测试凭证（API Key、测试账号） |

```bash
# 用户预配置
cat >> .claude-coder/test.env << 'EOF'
OPENAI_API_KEY=sk-xxx
TEST_USER=testuser@example.com
TEST_PASSWORD=xxx
EOF
```

Agent 在测试前会 `source .claude-coder/test.env` 加载凭证。发现新凭证需求时也会自动追加写入。

---

## 切换模式

```bash
# 通过 setup 菜单切换 MCP 模式（选项 3: 配置 MCP）
claude-coder setup

# 如果新模式需要登录（persistent / isolated），还需运行 auth
claude-coder auth <URL>
```

> **说明**：`setup` 菜单的「配置 MCP」选项会同时更新 `.env` 中的 `MCP_PLAYWRIGHT_MODE` 和重新生成 `.mcp.json`。完成后自动回到菜单，可继续调整其他配置。如果之前已经 auth 过对应模式（如 persistent 的 browser-profile 还在），切换回去后无需重新 auth。

---

## 清理

```bash
# 清除 persistent 模式配置
rm -rf .claude-coder/.runtime/browser-profile

# 清除 isolated 模式登录状态
rm .claude-coder/playwright-auth.json

# 完全重置 Playwright 配置
rm .mcp.json
# 然后重新运行 claude-coder auth
```
