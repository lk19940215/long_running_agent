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
  playwright-auth.json    ← 浏览器登录状态（MCP 每次会话加载）   [auth 命令生成]
```

### 文件生命周期

| 文件 | 创建方 | 写入方 | 回滚保护 | 生命周期 |
|------|--------|--------|----------|----------|
| `.env` | `claude-coder setup` | 用户 | 是 | 长期 |
| `test.env` | Agent 或用户 | Agent + 用户 | 是 | 长期，按需更新 |
| `playwright-auth.json` | `claude-coder auth` | auth 命令 | 是 | 长期，MCP 每次会话自动加载；如需更新重新运行 auth |

### 技术实现：为什么用 `--isolated --storage-state`

| 维度 | `--user-data-dir`（persistent） | `--isolated --storage-state`（当前方案） |
|------|--------------------------|--------------------------------------|
| 上下文类型 | 持久化上下文 | 隔离上下文 |
| localStorage | **已知 Bug #14949：`launchPersistentContext` 不注入 localStorage** | 从 JSON 可靠注入 |
| Cookies | Profile 自动续期 | 每次从 JSON 加载（静态） |
| 状态保持 | 跨会话自动保持 | 每次会话从 JSON 重新加载 |
| 适用场景 | 需要 cookie 自动续期（Google OAuth） | 需要 localStorage 注入（API Key 等） |

> **选择 `--isolated --storage-state` 的原因**：
> 经实测验证，Playwright 的 `launchPersistentContext` + `storageState` 存在已知缺陷
>（Issue #14949）：localStorage 完全不注入。而 `--isolated` 模式使用 `newContext({ storageState })`，
> localStorage 可靠注入。claude-coder 的典型场景是注入 API Key（存储在 localStorage），
> 因此选择 `--isolated --storage-state` 作为默认方案。
>
> 如需 cookie 持久化（Google OAuth/SSO），可手动修改 `.mcp.json` 为 `--user-data-dir` 模式，
> 但需在 MCP 浏览器中手动登录一次。

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
→ cookies + localStorage 保存到 playwright-auth.json
→ 更新 .mcp.json（--isolated --storage-state 指向 playwright-auth.json）
→ 每次 MCP 会话自动从 JSON 加载状态（无需手动登录）
→ 如需更新状态，重新运行 claude-coder auth
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
1. 启动 `playwright codegen`，用户手动登录后关闭浏览器
2. cookies + localStorage 保存到 `.claude-coder/playwright-auth.json`
3. 创建/更新 `.mcp.json`，配置 `--isolated --storage-state=.claude-coder/playwright-auth.json`
4. 添加 `.gitignore` 条目（`playwright-auth.json`）
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
# MCP 每次会话自动从 playwright-auth.json 加载 localStorage 和 cookies
```

### 场景 2：内部系统（Google OAuth / SSO）

```bash
claude-coder auth http://testyapi.example.com/group/2245
# 在弹出的浏览器中完成登录，关闭后状态保存到 JSON
# MCP 每次会话自动加载此状态
```

> **关于 Google OAuth**：`--isolated` 模式每次创建新上下文，Google 可能要求重新验证。
> 如需 cookie 持久化，可手动修改 `.mcp.json` 为 `--user-data-dir` 模式（但 localStorage 不会注入）。

### 场景 3：更新登录状态

```bash
claude-coder auth http://localhost:3000
# 重新登录，覆盖 playwright-auth.json
```

### 场景 4：清除登录状态

```bash
rm .claude-coder/playwright-auth.json
# 下次运行 claude-coder auth 重新配置
```
