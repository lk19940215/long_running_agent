# Playwright MCP 凭证持久化方案

## 背景

在使用 claude-coder 运行涉及前端测试的任务时，Playwright MCP 可能需要：
1. 已登录状态的 cookies（如后台管理页面）
2. API Key 等测试凭证（如 AI 生成功能需要真实 API 调用）

本文档描述如何在 claude-coder 工作流中管理这些凭证。

---

## 方案 1: Playwright --storage-state（推荐用于 cookies）

### 原理

`@playwright/mcp` 支持 `--storage-state=<path>` 参数，加载预存的浏览器状态（cookies、localStorage）。

### 步骤

**1. 手动登录并导出状态**

```bash
# 启动 Playwright，手动登录后导出
npx playwright codegen --save-storage=.claude-coder/playwright-auth.json http://localhost:3000
```

登录完成后关闭浏览器，状态自动保存到 `playwright-auth.json`。

**2. 配置 MCP 使用保存的状态**

在项目的 `.mcp.json`（Claude Code MCP 配置）中：

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": [
        "@playwright/mcp@latest",
        "--storage-state=.claude-coder/playwright-auth.json"
      ]
    }
  }
}
```

**3. 安全注意事项**

```gitignore
# .gitignore
.claude-coder/playwright-auth.json
```

### 注意

- 状态文件包含敏感 cookies，必须加入 `.gitignore`
- cookies 有过期时间，需要定期重新导出
- `--storage-state` 与 `--isolated` 模式配合使用效果最佳

---

## 方案 2: test.env（推荐用于 API Key）

### 原理

在 `.claude-coder/test.env` 中存放测试专用的环境变量（如 API Key）。claude-coder 会自动检测此文件存在，并通过 Hint 提示 Agent 在测试前加载它。

### 步骤

**1. 创建 test.env**

```bash
# .claude-coder/test.env
OPENAI_API_KEY=sk-xxx
ZHIPU_API_KEY=xxx.xxx
TEST_USER_TOKEN=xxx
```

**2. Agent 自动感知**

当 `.claude-coder/test.env` 存在时，harness 在编码 session 的 prompt 中注入提示：

> 测试环境变量在 .claude-coder/test.env（含 API Key 等），测试前用 source .claude-coder/test.env 或 export 加载。

Agent 在执行测试时会自动 `source` 该文件。

**3. 安全注意事项**

```gitignore
# .gitignore
.claude-coder/test.env
```

---

## 方案 3: project_profile.json 中声明测试依赖

在扫描阶段或手动编辑 `project_profile.json`，声明哪些测试需要真实 API Key：

```json
{
  "test_dependencies": {
    "real_api_key": true,
    "required_env_vars": ["OPENAI_API_KEY", "ZHIPU_API_KEY"],
    "env_file": ".claude-coder/test.env"
  }
}
```

Agent 在 Step 5 测试时，如果检测到 `preconditions.real_api_key: true`，会先检查环境变量是否可用，不可用则跳过该测试并标记为 `skip`。

---

## 最佳实践

| 场景 | 推荐方案 |
|------|----------|
| 需要已登录状态测试页面 | 方案 1 (--storage-state) |
| 需要 API Key 测试后端功能 | 方案 2 (test.env) |
| 需要区分 mock 测试和集成测试 | 方案 3 (profile 声明) |
| 以上组合 | 方案 1 + 2 + 3 |

### 工作流示例

```
1. claude-coder setup                      → 配置模型
2. 创建 .claude-coder/test.env             → 填入 API Key
3. claude-coder auth http://localhost:3000  → 一键导出登录状态
4. claude-coder run                        → Agent 自动使用凭证测试
```

---

## CLI 集成：`claude-coder auth`（v1.2.0+）

方案 1 的手动步骤已封装为 CLI 命令，一键完成：

```bash
claude-coder auth [url]
```

**自动执行**：
1. 启动 Playwright 浏览器，用户手动登录后关闭
2. 保存 cookies + localStorage 到 `.claude-coder/playwright-auth.json`
3. 创建/更新 `.mcp.json`，配置 `--storage-state` 参数
4. 自动将 `playwright-auth.json` 加入 `.gitignore`
5. 在 `.claude-coder/.env` 中启用 `MCP_PLAYWRIGHT=true`

**Prompt 自动感知**：当 `playwright-auth.json` 存在时，harness 在编码 session 的 prompt 中注入提示：

> 已检测到 Playwright 登录状态（.claude-coder/playwright-auth.json），前端/全栈测试将使用已认证的浏览器会话。

Agent 在执行前端测试时会自动使用已认证状态，无需手动登录。
