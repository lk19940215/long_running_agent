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
3. **零手动干预** — 除首次浏览器登录态外，其余由 Agent 自动处理

---

## 持久化架构

```
.claude-coder/
  .env                    ← 模型配置（ANTHROPIC_API_KEY 等）     [用户配置]
  test.env                ← 测试凭证（API Key、测试账号等）      [Agent 可写]
  playwright-auth.json    ← 浏览器状态（cookies + localStorage） [auth 命令生成]
```

### 文件生命周期

| 文件 | 创建方 | 写入方 | 回滚保护 | 生命周期 |
|------|--------|--------|----------|----------|
| `.env` | `claude-coder setup` | 用户 | 是 | 长期 |
| `test.env` | Agent 或用户 | Agent + 用户 | 是 | 长期，按需更新 |
| `playwright-auth.json` | `claude-coder auth` | auth 命令 | 是 | 中期，cookies 过期后需刷新 |

### 回滚保护机制

Harness 在 `git reset --hard` 前备份、后恢复以下文件：
- `session_result.json` — 会话结果
- `progress.json` — 历史记录
- `test.env` — 测试凭证
- `playwright-auth.json` — 浏览器状态

这确保无论回滚多少次，凭证始终保留。

---

## 核心流程

### 流程 1：Agent 自动发现凭证

```
Agent 测试 → 发现需要 API Key → 写入 test.env → 下次 session 自动加载
```

Agent 在 CLAUDE.md Step 5 中被指导：测试中发现的凭证追加到 `.claude-coder/test.env`。Harness 在每次 session 的 prompt 中注入 hint，告知 Agent `test.env` 的存在和用法。

### 流程 2：用户预配置浏览器登录态

```
用户运行 claude-coder auth → 手动登录 → 状态自动保存 → Agent 测试时使用
```

适用于需要已登录状态才能测试的前端页面（如后台管理、需要 cookie 的 SPA）。

### 流程 3：用户预配置 API Key

```
用户编辑 test.env → 填入 API Key → Agent 测试前 source 加载
```

适用于后端功能依赖真实 API 调用的场景。

---

## CLI 命令

### `claude-coder auth [url]`

一键导出浏览器登录态：

```bash
# 默认打开 http://localhost:3000
claude-coder auth

# 指定 URL
claude-coder auth http://localhost:8080/admin
```

**自动完成**：
1. 启动 Playwright 浏览器，用户手动登录后关闭
2. 保存 cookies + localStorage 到 `.claude-coder/playwright-auth.json`
3. 创建/更新 `.mcp.json`，配置 `--storage-state`
4. 添加 `.gitignore` 条目
5. 启用 `.claude-coder/.env` 中 `MCP_PLAYWRIGHT=true`

### `claude-coder setup`（相关）

配置模型时可启用 Playwright MCP：

```bash
claude-coder setup
# 选择启用 MCP_PLAYWRIGHT=true
```

---

## 场景示例

### 场景 1：全栈项目首次测试

```bash
# 1. 配置模型
claude-coder setup

# 2. 填入后端测试需要的 API Key
cat >> .claude-coder/test.env << 'EOF'
OPENAI_API_KEY=sk-xxx
ZHIPU_API_KEY=xxx.xxx
EOF

# 3. 导出前端登录态（可选，Agent 也能用 Playwright MCP 自动登录）
claude-coder auth http://localhost:3000

# 4. 开始自动编码和测试
claude-coder run
```

### 场景 2：Agent 自主发现并处理凭证缺失

Agent 在测试 feat-005（AI 内容生成）时发现需要 `OPENAI_API_KEY`：

1. Agent 尝试调用 API → 报错 "API key required"
2. Agent **不中断任务**，改用替代验证方式（如 mock 响应、检查代码逻辑是否正确、验证接口可达性）
3. Agent 将凭证需求写入 `test.env`：`echo 'OPENAI_API_KEY=需要配置' >> .claude-coder/test.env`
4. Agent 在 `session_result.json` 的 notes 中记录："AI 内容生成功能已实现，但需要真实 OPENAI_API_KEY 才能完整测试，已记录到 test.env"
5. Agent 完成其他可验证的步骤后标记任务为 `done`（功能已实现）或 `testing`（等待凭证后完整验证）

**核心原则**：缺少凭证不等于任务失败。Agent 应最大化推进，将凭证问题记录为后续补充项，而非阻塞整个 session。

### 场景 3：前端 localStorage 配置持久化

项目的前端将 LLM 服务商配置存储在 localStorage 中：

```bash
# 启动前后端服务
# 运行 auth，手动在页面中配置 LLM 设置
claude-coder auth http://localhost:3000

# playwright-auth.json 中已包含 localStorage 数据
# 后续 Agent 使用 Playwright MCP 测试时自动加载这些配置
```

### 场景 4：cookies 过期后刷新

```bash
# 重新运行 auth 即可
claude-coder auth http://localhost:3000
# 新的 cookies 覆盖旧文件，立即生效
```
