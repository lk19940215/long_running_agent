# 测试凭证持久化方案

## 设计思想

claude-coder 的核心目标是让 Agent **完全自主测试**，不因凭证缺失而中断。测试中涉及三类凭证：

| 类型 | 示例 | 特点 |
|------|------|------|
| 浏览器状态 | 登录 cookies、localStorage 中的用户配置 | 有过期时间，跨 session 需要持久化 |
| API Key | OPENAI_API_KEY、ZHIPU_API_KEY | 长期有效，需安全存储 |
| 测试账号 | 注册的测试用户名密码、生成的 token | 可能是 Agent 自己创建的，需跨 session 传递 |

**核心原则**：
1. **Agent 可自行发现并持久化凭证** — 测试中发现需要的 API Key 或账号，直接写入 `test.env`
2. **凭证不受回滚影响** — `git reset --hard` 不会摧毁已保存的凭证
3. **零手动干预** — 首次浏览器登录后，后续由持久化 profile 自动处理

---

## 持久化架构

```
.claude-coder/
  .env                    ← 模型配置（ANTHROPIC_API_KEY 等）     [用户配置]
  test.env                ← 测试凭证（API Key、测试账号等）      [Agent 可写]
  playwright-auth.json    ← 登录状态快照（备份参考）             [auth 命令生成]
  browser-profile/        ← 持久化浏览器 Profile（MCP 实际使用） [auth 命令创建]
```

### 文件生命周期

| 文件 | 创建方 | 写入方 | 回滚保护 | 生命周期 |
|------|--------|--------|----------|----------|
| `.env` | `claude-coder setup` | 用户 | 是 | 长期 |
| `test.env` | Agent 或用户 | Agent + 用户 | 是 | 长期，按需更新 |
| `playwright-auth.json` | `claude-coder auth` | auth 命令 | 是 | 快照备份，不被 MCP 直接使用 |
| `browser-profile/` | `claude-coder auth` | MCP 自动维护 | 是 | 长期，自动续期 |

### 技术实现：为什么用 `--user-data-dir` 而不是 `--storage-state`

| 维度 | `--storage-state`（旧方案） | `--user-data-dir`（当前方案） |
|------|-------------------------|--------------------------|
| 上下文类型 | 隔离上下文（isolated） | 持久化上下文（persistent） |
| 状态保持 | 每次从 JSON 文件加载，会话结束丢弃 | Profile 自动保存，跨会话保持 |
| Cookies 续期 | 不支持（JSON 文件静态） | 支持（浏览器自动刷新的 cookies 被保留） |
| localStorage | 从 JSON 注入（可靠） | 持久保存在 Profile 中 |
| Google OAuth | 每次创建新上下文 → Google 检测到自动化 | 持久 Profile → Google 视为常规浏览器 |
| 长期运行 | 差（cookies 过期后必须重新 auth） | 优（Profile 随浏览器使用自动演进） |

> **源码依据**：Playwright MCP `contextFactory()` 在 `isolated=false` 时使用 `PersistentContextFactory`，
> 调用 `launchPersistentContext(userDataDir, options)` 创建持久化浏览器上下文。
> `--storage-state` 虽然不强制 `isolated=true`，但官方文档明确描述其为 "load into an isolated browser context"，
> 且 `launchPersistentContext` 的 `storageState` 参数存在已知缺陷（Issue #14949）：localStorage 不注入，
> 旧 cookies 可能覆盖 Profile 中已刷新的 cookies。

---

## 核心流程

### 流程 1：Agent 自动发现凭证

```
Agent 测试 → 发现需要 API Key → 写入 test.env → 下次 session 自动加载
```

### 流程 2：用户预配置浏览器登录态

```
用户运行 claude-coder auth url
→ playwright codegen 打开浏览器 → 手动登录 → 关闭浏览器
→ cookies + localStorage 保存为快照备份（playwright-auth.json）
→ 创建 browser-profile/ 目录
→ 更新 .mcp.json（--user-data-dir 指向 browser-profile/）
→ 首次 MCP 会话时在浏览器窗口中登录一次
→ 之后 MCP 自动使用持久化 Profile，无需再次登录
```

### 流程 3：用户预配置 API Key

```
用户编辑 test.env → 填入 API Key → Agent 测试前 source 加载
```

---

## CLI 命令

### `claude-coder auth [url]`

配置持久化浏览器认证：

```bash
# 默认打开 http://localhost:3000
claude-coder auth

# 指定 URL（如内部 API 文档平台）
claude-coder auth http://testyapi.example.com/group/2245
```

**自动完成**：
1. 创建 `.claude-coder/browser-profile/` 持久化 Profile 目录
2. 启动 `playwright codegen`，用户手动登录后关闭浏览器（保存快照备份）
3. 创建/更新 `.mcp.json`，配置 `--user-data-dir=.claude-coder/browser-profile`
4. 添加 `.gitignore` 条目（`playwright-auth.json` + `browser-profile/`）
5. 启用 `.claude-coder/.env` 中 `MCP_PLAYWRIGHT=true`

---

## 场景示例

### 场景 1：全栈项目首次测试

```bash
claude-coder setup
cat >> .claude-coder/test.env << 'EOF'
OPENAI_API_KEY=sk-xxx
EOF
claude-coder auth http://localhost:3000
claude-coder run
# 首次 MCP 访问需登录的页面时，在浏览器窗口登录一次
# 之后所有 session 自动保持登录状态
```

### 场景 2：内部系统（Google OAuth / SSO）

```bash
claude-coder auth http://testyapi.example.com/group/2245
# 在弹出的浏览器中完成 Google 登录（快照备份）
# 首次 MCP 会话时在浏览器窗口中再次登录
# 之后持久化 Profile 自动保持 Google 登录状态
```

> **关于 Google OAuth 检测**：使用 `--user-data-dir` 持久化 Profile 后，Google 将浏览器视为
> "回访用户"而非"新自动化会话"，大幅降低重复登录要求。如果仍被检测，可在 `.mcp.json` 中
> 添加 `--browser chrome` 使用真实 Chrome 进一步降低检测率。

### 场景 3：长期运行（核心优势）

```bash
claude-coder run --max-sessions 50
# 浏览器 Profile 自动保持：
#   - cookies 被网站刷新时，新 cookies 自动写入 Profile
#   - 不依赖静态 JSON 文件，状态持续演进
#   - 即使中途重启 claude-coder，Profile 中的登录状态仍然有效
```

### 场景 4：清除登录状态

```bash
rm -rf .claude-coder/browser-profile/
# 下次 MCP 会话时将创建全新 Profile，需重新登录
```
