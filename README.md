# Claude Auto Loop

**中文** | [English](README.en.md)

让 AI Agent 自动完成复杂的多步编码任务。

AI Agent 单次会话的上下文有限，面对大型需求时容易丢失进度、过早宣布完成、或改出不可用的代码。本工具通过**外部 harness** 管理任务状态、自动校验每次会话的产出、失败时自动 git 回滚并重试，让 Agent 变成一个"可靠的、可重试的函数"。

基于 [Anthropic: Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)，并做了多项工程级增强。

---

## 30 秒开始

**前置条件**: [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) (`npm install -g @anthropic-ai/claude-code`) + Python 3 + Git

```bash
# 1. 克隆本项目到你的工程目录下
cd /path/to/your/project
git clone --depth 1 https://github.com/lk19940215/claude-auto-loop.git
rm -rf claude-auto-loop/.git    # 移除工具自带的 git 历史，避免嵌套仓库

# 2. 启动（二选一）

# 快捷模式：一句话需求
bash claude-auto-loop/run.sh "实现用户登录功能，支持邮箱和 OAuth"

# 详细模式：写需求文档（推荐，可指定技术栈、样式、功能细节）
cp claude-auto-loop/requirements.example.md requirements.md
vim requirements.md                # 编辑你的需求
bash claude-auto-loop/run.sh     # 自动读取 requirements.md

# 3. 后续继续（自动从上次中断处恢复）
bash claude-auto-loop/run.sh
```

> **提示**：`requirements.md` 优先于 CLI 参数。你可以随时修改它，下一个 session 会自动读取最新内容。

就这么多。下面是详细说明。

---

## 运行后会发生什么

```
bash claude-auto-loop/run.sh "你的需求"
        |
        v
  ┌─────────────────────────────────────────┐
  │ 1. 项目扫描（首次自动执行）               │
  │    Agent 扫描项目文件 → 生成:             │
  │    - project_profile.json (项目元数据)    │
  │    - init.sh (环境初始化脚本)             │
  │    - tasks.json (任务列表 + 状态)         │
  └─────────────────────────────────────────┘
        |
        v
  ┌─────────────────────────────────────────┐
  │ 2. 编码循环（自动重复直到全部完成）        │
  │                                         │
  │    每个 session:                         │
  │    ① 恢复上下文（读进度文件 + git log）   │
  │    ② 健康检查（启动服务、检查端口）        │
  │    ③ 选一个任务（优先修复失败的）          │
  │    ④ 增量实现（一次只做一个功能）          │
  │    ⑤ 测试验证（端到端测试）               │
  │    ⑥ 收尾（git commit + 更新进度）        │
  └─────────────────────────────────────────┘
        |
        v
  ┌─────────────────────────────────────────┐
  │ 3. Harness 校验（每次 session 后自动）    │
  │                                         │
  │    ✓ session_result.json 合法？          │
  │    ✓ git 有新提交？                      │
  │    ✓ 服务健康检查通过？                   │
  │    ✓ 自定义钩子通过？                     │
  │                                         │
  │    失败 → git 回滚 → 重试（最多 3 次）    │
  │    通过 → 继续下一个 session              │
  └─────────────────────────────────────────┘
        |
        v
  所有任务 done → 自动退出
  中途 Ctrl+C → 下次运行自动恢复
```

### 查看进度

```bash
cat claude-auto-loop/progress.txt          # 每次 session 的工作记录
cat claude-auto-loop/tasks.json            # 任务列表和状态
cat claude-auto-loop/project_profile.json  # 自动检测的项目元数据
```

---

## 运行机制详解

### 核心循环：谁驱动什么

整个系统分两层，各司其职：

- **外层 -- run.sh（harness）**：一个 while 循环，不做任何智能决策。它只负责：调用 Agent → 校验产出 → 失败就回滚 → 重复。
- **内层 -- Agent（Claude）**：每个 session 内部，Agent 自己读 `tasks.json`，选任务、写代码、测试、提交。

```
run.sh 核心逻辑（伪代码）:

while session < 50:                          # 安全上限，防止无限循环
    if all tasks done:
        exit                                 # 全部完成，退出

    记录 git HEAD                             # 记住 session 前的代码状态

    claude -p "按 CLAUDE.md 执行"             # ← Agent 自己选任务、实现、测试、提交

    bash validate.sh                          # ← harness 外部校验 Agent 的产出

    if 校验通过:
        continue                              # 进入下一个 session
    else:
        git reset --hard HEAD_BEFORE          # 回滚到 session 前
        consecutive_failures++
        if consecutive_failures >= 3:
            强制标记当前任务为 failed            # 跳过这个任务，防止死循环
            consecutive_failures = 0

    每 5 个 session 暂停一次，问用户是否继续
```

**为什么 harness 不选任务？** 因为 Agent 拥有完整的项目上下文（代码、依赖关系、上次的进度），它比一个 shell 脚本更适合做决策。harness 只做 Agent 做不好的事情：外部校验和强制回滚。

### 任务选择逻辑

每个 session 开始时，Agent 按以下规则从 `tasks.json` 中选一个任务：

1. **优先选 `failed` 的任务** -- 修复之前失败的，比做新功能更重要
2. **其次选 `pending` 的任务** -- 还没开始的新功能
3. **按 `priority` 排序** -- 数字越小越优先
4. **检查 `depends_on`** -- 如果依赖的任务还没 `done`，跳过
5. **一次只选一个** -- 防止上下文耗尽

选中后，Agent 把任务 `status` 改为 `in_progress`，然后开始实现。

### 任务状态机

每个任务有 5 种状态，必须按箭头方向流转，不能跳步：

```
pending ──→ in_progress ──→ testing ──→ done
                               │
                               v
                            failed ──→ in_progress（重试）
```

| 状态 | 含义 | 谁设置 |
|---|---|---|
| `pending` | 未开始 | 初始化时自动设置 |
| `in_progress` | 正在实现 | Agent 选中任务时 |
| `testing` | 代码写完，正在测试 | Agent 开始验证时 |
| `done` | 测试通过 | Agent 确认测试通过后 |
| `failed` | 测试失败或实现有问题 | Agent 发现问题时 / harness 连续失败 3 次时强制标记 |

**禁止的操作**：`pending` 不能直接到 `done`（必须先写代码再测试），`in_progress` 不能直接到 `done`（必须先测试）。

### 校验与失败处理

每个 session 结束后，harness 运行 `validate.sh` 检查 Agent 的产出。根据结果有 4 种场景：

**场景 1 -- 正常完成**

```
Agent 实现功能 → 测试通过 → status 改为 done → git commit → 写 session_result.json
    → validate.sh 检查: session_result 合法 ✓ git 有新提交 ✓
    → 通过，进入下一个 session
```

**场景 2 -- Agent 自报失败**

```
Agent 实现功能 → 测试未通过 → status 改为 failed → git commit → session_result 写 "failed"
    → validate.sh 检查: session_result 合法（Agent 诚实地报告了失败）✓
    → 通过（不回滚），下一个 session Agent 会优先修复这个 failed 的任务
```

**场景 3 -- Agent 产出不合格（需要回滚）**

```
Agent 崩溃 / 超时 / 没写 session_result.json / JSON 格式错误
    → validate.sh 检查: session_result 缺失或非法 ✗
    → 致命失败 → harness 执行 git reset --hard（回到 session 前的状态）
    → tasks.json 也被回滚，任务状态恢复原样
    → 下一个 session 重新尝试同一个任务
```

**场景 4 -- 连续失败 3 次（跳过）**

```
同一个任务连续 3 次触发场景 3
    → harness 判断这个任务 Agent 做不了
    → 强制把 in_progress 的任务标记为 failed
    → 重置失败计数器，继续选下一个 pending 的任务
```

### git 回滚如何保证一致性

回滚用的是 `git reset --hard HEAD_BEFORE`，它会把**所有文件**恢复到 session 开始前的状态 -- 包括 `tasks.json`。所以任务的状态也会回到修改前。这意味着：

- 回滚后，没有"改了一半"的脏状态
- 下一个 session 看到的 `tasks.json` 和上一个成功 session 结束时一样
- Agent 会重新选择同一个任务（因为它还是 `pending` 或 `in_progress`）

### 安全机制

防止 Agent 无限运行或失控的保护措施：

| 机制 | 说明 |
|---|---|
| 最大会话数 | 默认 50 个 session 后自动停止，达到上限后提示如何继续 |
| 单任务最大重试 | 同一任务连续失败 3 次后强制标记为 `failed`，跳到下一个任务 |
| 定期人工确认 | 每 5 个 session 暂停一次，等待用户确认是否继续 |
| Ctrl+C 安全退出 | 收到中断信号时优雅退出，并提示 `bash claude-auto-loop/run.sh` 即可恢复 |
| 初始化重试 | 项目扫描阶段最多重试 3 次，避免因偶发错误导致无法启动 |
| git 回滚 | 每次校验失败自动 `git reset --hard`，代码永远不会停留在不可用状态 |

**断点恢复**：无论是 Ctrl+C 中断、终端意外关闭、还是达到会话上限，只需重新运行 `bash claude-auto-loop/run.sh` 即可从上次中断处继续。所有进度都持久化在 `tasks.json` 和 `progress.txt` 中。

---

## Cursor IDE 模式

如果你用 Cursor 而不是 Claude CLI，也能用这套工具。区别是：你手动触发每次对话，而不是 run.sh 自动循环。

### 安装

```bash
# 一次性：复制规则文件到 Cursor 配置目录
mkdir -p .cursor/rules
cp claude-auto-loop/cursor.mdc .cursor/rules/claude-auto-loop.mdc
```

### 使用

1. **第一次对话**：在 Cursor 中新建对话，输入你的需求，例如：

   > "实现用户登录功能，支持邮箱和 OAuth"

   Cursor 会自动读取 Agent 协议（通过 cursor.mdc），Agent 会执行项目扫描、生成 tasks.json 等初始化工作。

2. **后续每次对话**：直接新建对话即可。Agent 会自动：
   - 读取 `CLAUDE.md` 了解工作协议
   - 读取 `progress.txt` 和 `tasks.json` 恢复上下文
   - 选择下一个任务，实现、测试、提交

3. **每次对话结束后**（可选）：运行校验确认 Agent 的产出合格

   ```bash
   bash claude-auto-loop/validate.sh
   ```

### CLI 模式 vs Cursor 模式

| 维度 | Claude CLI 模式 | Cursor IDE 模式 |
|---|---|---|
| 谁驱动循环 | `run.sh` 自动循环 | 你手动发起每次对话 |
| 校验 | 自动（每次 session 后） | 可选（手动运行 validate.sh） |
| 回滚 | 自动 git reset | 手动 / Agent 自我检查 |
| 适合场景 | 无人值守批量开发 | 交互式开发、需要人工介入 |

---

## 可选配置

默认情况下，不需要任何配置就能运行。以下配置是**可选的**。

```bash
bash claude-auto-loop/setup.sh
```

### 替代模型（降低成本）

默认使用 Claude 官方 API。如需替代模型：

| 选项 | 说明 |
|---|---|
| Claude 官方 | 默认，质量最高 |
| GLM 4.7 (智谱) | `open.bigmodel.cn` 兼容网关，国内直连，成本低 |
| GLM 4.7 (Z.AI) | `api.z.ai` 兼容网关，海外节点 |
| 自定义 | 任意 Anthropic 兼容的 BASE_URL |

### MCP 工具（浏览器测试）

如果项目有 Web 前端，建议安装 [Playwright MCP](https://github.com/microsoft/playwright-mcp)，Agent 将用它做端到端浏览器测试（click、snapshot、navigate 等 25+ 工具）。纯后端项目可跳过。

配置保存在 `config.env`（自动加入 `.gitignore`），仅影响本工具，不改变全局配置。

---

## 相比 Anthropic 文章的增强

本工具基于 Anthropic 的 [long-running agent harness](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) 思想，在以下维度做了工程级增强：

| 维度 | Anthropic 原文方案 | 本工具增强 |
|---|---|---|
| 任务状态 | 简单 bool (`passes`) | 5 态状态机 (`pending` → `in_progress` → `testing` → `done` / `failed`) |
| 校验方式 | 依赖 Agent 自报告 | 外部 harness 硬校验 (`validate.sh`) |
| 失败处理 | 无 | git 自动回滚 + 最多 3 次重试 |
| 项目信息 | 硬编码在 CLAUDE.md | 自动扫描生成 `project_profile.json` |
| 环境初始化 | 手写 init.sh | Agent 扫描后自动生成 |
| 结构化输出 | 无 | 每次 session 强制输出 `session_result.json`（machine-readable） |
| 运行环境 | 仅 Claude CLI | 同时支持 Claude CLI + Cursor IDE |
| 测试工具 | 无 | 可插拔 Playwright MCP 浏览器自动化 |
| 校验扩展 | 无 | `validate.d/` 钩子目录，用户可自定义 |
| 模型选择 | 仅 Claude | 支持 GLM 4.7 等 Anthropic 兼容模型 |
| 需求输入 | CLI 一句话参数 | 支持 `requirements.md` 需求文档（可指定技术栈、样式、随时可改） |

---

## 参考

### 文件说明

**预置文件**（通用，复制到任何项目即可用）：

| 文件 | 说明 |
|---|---|
| `CLAUDE.md` | Agent 协议：状态机、6 步工作流程、铁律 |
| `run.sh` | CLI 模式入口：外部循环 + 校验 + 回滚 + 重试 |
| `validate.sh` | 独立校验脚本：CLI 自动调用 / Cursor 手动运行 |
| `setup.sh` | 交互式前置配置（模型选择 + MCP 工具安装） |
| `cursor.mdc` | Cursor 规则文件：复制到 `.cursor/rules/` 使用 |
| `requirements.example.md` | 需求文档模板：复制为 `requirements.md` 填写详细需求 |
| `README.md` | 本文件 |

**运行时生成**（项目特定，由 Agent 或 setup.sh 创建）：

| 文件 | 说明 |
|---|---|
| `config.env` | 模型 + MCP 配置（由 setup.sh 生成，含 API Key，已 gitignore） |
| `project_profile.json` | 自动检测的项目元数据（技术栈、服务、端口等） |
| `init.sh` | 自动生成的环境初始化脚本（幂等设计） |
| `tasks.json` | 任务列表 + 状态机跟踪 |
| `progress.txt` | 跨会话记忆日志（追加式） |
| `session_result.json` | 临时文件（每次 session 后由 harness 删除） |

### 自定义校验钩子

在 `validate.d/` 目录下放置 `.sh` 脚本，`validate.sh` 会自动执行它们：

```bash
mkdir -p claude-auto-loop/validate.d

# 示例：添加 lint 检查
cat > claude-auto-loop/validate.d/lint.sh << 'EOF'
#!/bin/bash
cd "$(dirname "$0")/../.."
npm run lint 2>&1 || exit 2  # exit 2 = 警告，exit 1 = 致命
EOF
```

钩子退出码约定：`0` = 通过，`1` = 致命失败（触发 git 回滚），`2+` = 警告（不阻断）。
