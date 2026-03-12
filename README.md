# Claude Coder

**中文** | [English](docs/README.en.md)

一个**长时间自运行的自主编码 Agent Harness**：基于 Claude Agent SDK，通过 Hook 提示注入引导模型行为，倒计时活跃度监控保障稳定运行，多 session 编排实现一句话需求到完整项目的全自动交付。

### 亮点

- **Hook 提示注入**：通过 JSON 配置在工具调用时向模型注入上下文引导，零代码修改即可扩展规则（[机制详解](design/hook-mechanism.md)）
- **长时间自循环编码**：多 session 编排 + 倒计时活跃度监控 + git 回滚重试，Agent 可持续编码数小时不中断（[守护机制](design/session-guard.md)）
- **配置驱动**：支持 Claude 官方、Coding Plan 多模型路由、DeepSeek 等任意 Anthropic 兼容 API

---

## 快速上手

```bash
# 前置：安装 Claude Agent SDK
npm install -g @anthropic-ai/claude-agent-sdk

# 安装
npm install -g claude-coder

# 配置模型
claude-coder setup

# 进入项目目录
cd your-project

# 初始化项目（扫描技术栈、生成 profile）
claude-coder init

# 开始自动编码
claude-coder run "实现用户注册和登录功能"
```

## 命令列表

| 命令 | 说明 |
|------|------|
| `claude-coder setup` | 交互式配置（模型、MCP、安全限制、自动审查） |
| `claude-coder init` | 初始化项目环境（扫描技术栈、生成 profile） |
| `claude-coder plan "需求"` | 生成计划方案 |
| `claude-coder plan -r [file]` | 从需求文件生成计划 |
| `claude-coder plan --planOnly` | 仅生成计划文档，不分解任务 |
| `claude-coder plan -i "需求"` | 交互模式，允许模型提问 |
| `claude-coder run [需求]` | 自动编码循环 |
| `claude-coder run --max 1` | 单次执行 |
| `claude-coder run --dry-run` | 预览模式（查看任务队列） |
| `claude-coder simplify [focus]` | 代码审查和简化 |
| `claude-coder auth [url]` | 导出 Playwright 登录状态 |
| `claude-coder status` | 查看进度和成本 |

**选项**：`--max N` 限制 session 数（默认 50），`--pause N` 每 N 个 session 暂停确认，`--model M` 指定模型。

## 工作原理

```
需求输入 ─→ 项目扫描 ─→ 任务分解 ─→ 编码循环
                                       │
                                 ┌──────┴──────┐
                                 │  Session N   │
                                 │  Claude SDK  │
                                 │  6 步流程    │
                                 └──────┬──────┘
                                        │
                                   harness 校验
                                        │
                              通过 → 下一个任务
                              失败 → git 回滚 + 重试
```

每个 session 内，Agent 自主执行 6 步：恢复上下文 → 环境检查 → 选任务 → 编码 → 测试 → 收尾（git commit）。

## 机制文档

| 文档 | 说明 |
|------|------|
| [Hook 注入机制](design/hook-mechanism.md) | SDK Hook 调研、GuidanceInjector 三级匹配、配置格式、副作用评估 |
| [Session 守护机制](design/session-guard.md) | 中断策略、倒计时活跃度检测、工具运行状态追踪、防刷屏 |
| [技术架构](design/ARCHITECTURE.md) | 核心设计规则、模块职责、提示语注入架构 |
| [测试凭证方案](docs/PLAYWRIGHT_CREDENTIALS.md) | Playwright 登录态导出、API Key 持久化 |
| [SDK 使用指南](docs/CLAUDE_AGENT_SDK_GUIDE.md) | Claude Agent SDK 接口参考 |

## 使用场景

**新项目**：`claude-coder run "用 Express + React 做 Todo 应用"` — 自动搭建脚手架、分解任务、逐个实现。

**已有项目**：`claude-coder run "新增头像上传功能"` — 先扫描现有代码和技术栈，再增量开发。

**需求文档驱动**：在项目根目录创建 `requirements.md`，运行 `claude-coder run`。需求变更后 `claude-coder add -r` 同步新任务。

**自动测试 + 凭证持久化**：`claude-coder auth http://localhost:3000` — 导出浏览器登录态，Agent 测试时自动使用。详见 [测试凭证方案](docs/PLAYWRIGHT_CREDENTIALS.md)。

## 模型支持

| 提供商 | 说明 |
|--------|------|
| 默认 | Claude 官方模型，使用系统登录态 |
| Coding Plan | 自建 API，推荐的多模型路由配置 |
| API | DeepSeek 或其他 Anthropic 兼容 API |

## 建议配置

### 长时间自运行 Agent（最稳）

```bash
ANTHROPIC_DEFAULT_OPUS_MODEL=glm-5
ANTHROPIC_DEFAULT_SONNET_MODEL=qwen3-coder-next
ANTHROPIC_DEFAULT_HAIKU_MODEL=qwen3-coder-plus
ANTHROPIC_MODEL=kimi-k2.5
```

### 自用 Claude Code（最强）

```bash
ANTHROPIC_DEFAULT_OPUS_MODEL=qwen3-max-2026-01-23
ANTHROPIC_DEFAULT_SONNET_MODEL=qwen3-coder-next
ANTHROPIC_DEFAULT_HAIKU_MODEL=qwen3-coder-plus
ANTHROPIC_MODEL=glm-5
```

## 项目结构

```
your-project/
  .claude-coder/              # 运行时数据（gitignored）
    .env                    # 模型配置
    project_profile.json    # 项目扫描结果
    tasks.json              # 任务列表 + 状态
    session_result.json     # 上次 session 结果
    progress.json           # 会话历史 + 成本
    tests.json              # 验证记录
    test.env                # 测试凭证（可选）
    .runtime/
      logs/                 # 每 session 独立日志
```

## 常见问题

**"Credit balance is too low"**：运行 `claude-coder setup` 重新配置 API Key。

**中断恢复**：直接重新运行 `claude-coder run`，从上次中断处继续。

**长时间无响应**：模型处理复杂任务时可能出现长思考间隔（indicator 显示黄色"工具执行中"或红色"无响应"），这是正常行为。超过阈值后 harness 自动中断并重试。通过 `claude-coder setup` 的安全限制配置或 `.env` 中 `SESSION_STALL_TIMEOUT=秒数` 调整。

**跳过任务**：将 `.claude-coder/tasks.json` 中该任务的 `status` 改为 `done`。

## 参考文章

[Anthropic: Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)

## License

MIT
