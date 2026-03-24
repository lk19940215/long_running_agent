# Claude Coder — 技术架构文档

> 本文件面向开发者和 AI，用于快速理解本工具的设计、文件结构、提示语架构和扩展方向。

---

## 一句话定位

一个基于 Claude Agent SDK 的**自主编码 harness**：自动扫描项目 → 拆解任务 → 逐个实现 → 校验 → 回滚/重试 → 推送，全程无需人工干预。

---

## 0. 核心设计规则（MUST READ）

> 以下规则按重要性排序（注意力 primacy zone），所有代码修改和架构决策必须遵循。

### 规则 1：长 Session 不停工

Agent 在单次 session 中应最大化推进任务进度。**任何非致命问题都不应中断 session**。

- 缺少 API Key → 用 mock 或代码逻辑验证替代，记录到 `test.env`，继续推进
- 测试环境未就绪 → 跳过该测试步骤，完成其余可验证的步骤
- 服务启动失败 → 尝试排查修复，无法修复则记录问题后推进代码实现
- **长时间思考是正常行为**：模型处理大文件（如 500+ 行的代码文件）时可能出现 10-20 分钟的思考间隔，不代表卡死

**反面案例**：Agent 因 `OPENAI_API_KEY` 缺失直接标记任务 `failed` → 浪费整个 session

> Harness 兜底机制：当工具调用间隔超过 `SESSION_STALL_TIMEOUT`（默认 20 分钟）时自动中断 session 并触发 rollback + 重试。此阈值设计为远超正常思考时长，仅捕捉真正的卡死场景。

### 规则 2：回滚即彻底回滚

`git reset --hard` 是全量回滚，不做部分文件保护。

- 凭证文件（`test.env`、`playwright-auth.json`、`browser-profile/`）应通过 `.gitignore` 排除在 git 之外
- 如果回滚发生，说明 session 确实失败，代码应全部还原
- 不需要 backup/restore 机制 — 这是过度设计

### 规则 3：分层校验 + AI 自愈（fatal / warn / pass）

不是所有校验失败都需要回滚。session_result.json 解析失败时，先尝试 AI 修复（`repair.js`），修复后重新校验：

| 情况 | 有新 commit | 处理 |
|------|------------|------|
| session_result.json 格式异常 | — | 先调用 AI 修复 → 重新校验 |
| AI 修复后仍异常 | 是 | **warn** — 代码已提交且可能正确，不回滚 |
| AI 修复后仍异常 | 否 | **fatal** — 无进展，回滚 |
| 全部通过 | — | **pass** — 推送 |

### 规则 4：凭证与代码分离

| 文件 | git 状态 | 说明 |
|------|---------|------|
| `test.env` | .gitignore | Agent 可写入发现的 API Key、测试账号 |
| `playwright-auth.json` | .gitignore | cookies + localStorage 快照（isolated 模式，`claude-coder auth` 生成） |
| `.runtime/browser-profile/` | .gitignore | 持久化浏览器 Profile（persistent 模式，`claude-coder auth` 生成） |
| `session_result.json` | git-tracked | Agent 每次 session 覆盖写入 |
| `tasks.json` | git-tracked | Agent 修改 status 字段 |

### 规则 5：Harness 准备上下文，Agent 直接执行

Agent 不应浪费工具调用读取 harness 已知的数据。所有可预读的上下文通过 prompt hint 注入（见第 5 节 Prompt 注入架构）。

### 规则 6：三层 Session 终止保护

SDK 的 `query()` 循环在模型产出**无 tool_use 的纯文本响应**时自动结束。但非 Claude 模型（GLM/Qwen/DeepSeek）可能不正确返回 `stop_reason: "end_turn"`，导致 SDK 继续发起新 turn 或模型陷入长时间思考。三层可配置的保护机制按优先级互补：

#### 第 1 层：Result Message 检测（核心机制）

`session.runQuery()` 遍历消息流时，通过 `extractResult(messages)` 检测 `SDKResultMessage`，其 `subtype` 字段（`success` / `error_max_turns` 等）是查询结束的唯一可靠信号。

#### 第 2 层：停顿检测（通用兜底）

每 30 秒检查最后一次工具调用时间。无工具调用 > `SESSION_STALL_TIMEOUT`（默认 1200 秒 / 20 分钟）→ 自动中断 session → runner 重试逻辑。

#### 第 3 层：maxTurns（仅 CI 推荐）

SDK 内置轮次计数。默认 0（无限制），仅 CI/pipeline 需要时启用。

| 配置项 | 环境变量 | 默认值 | 说明 |
|--------|---------|--------|------|
| 停顿超时 | `SESSION_STALL_TIMEOUT` | 1200 秒 | 长时间无工具调用 |
| 最大轮次 | `SESSION_MAX_TURNS` | 0（无限制） | 仅 CI 推荐 |

配置方式：`claude-coder setup` → 配置安全限制，或直接编辑 `.claude-coder/.env`。

---

## 1. 核心架构

```mermaid
flowchart TB
    subgraph CLI["bin/cli.js → src/index.js main()"]
        direction TB
        mainFn["main(command, input, opts)<br/>命令分发"]
    end

    subgraph Runner["src/core/runner.js (编排循环)"]
        direction TB
        coding["coding.executeCoding()<br/>编码 session"]
        simplify_r["simplify.executeSimplify()<br/>代码审查"]
    end

    subgraph SessionClass["src/core/session.js (Session 类)"]
        direction TB
        ensureSDK["ensureSDK() → 懒加载 SDK"]
        run["run() → 生命周期管理"]
        runQuery["runQuery() → 消息流遍历"]
        buildOpts["buildQueryOptions() → SDK 选项"]
    end

    subgraph SDK["Claude Agent SDK"]
        query["query() 函数"]
        hook_sys["PreToolUse hook<br/>hooks.js 工厂"]
    end

    subgraph Files["文件系统 (.claude-coder/)"]
        direction TB
        profile["project_profile.json<br/>tasks.json"]
        runtime["session_result.json<br/>progress.json"]
        phase[".runtime/<br/>harness_state.json / logs/"]
    end

    CLI -->|"executeRun / executePlan / ..."| Runner
    Runner -->|"Session.run()"| SessionClass
    SessionClass -->|"sdk.query()"| SDK

    query -->|PreToolUse 事件| hook_sys
    query -->|Agent 工具调用| Files
```

**核心特征：**
- **项目无关**：项目信息由 Agent 扫描后存入 `project_profile.json`，harness 不含项目特定逻辑
- **可恢复**：通过 `session_result.json` 跨会话记忆，任意 session 可断点续跑
- **可观测**：双通道终端指示器（spinner 心跳 + 永久工具行），实时显示工具调用和运行时长
- **自愈**：JSON 损坏 AI 修复 + 编辑死循环检测 + 停顿超时自动中断 + runner 重试机制
- **跨平台**：纯 Node.js 实现，macOS / Linux / Windows 通用
- **零依赖**：`dependencies` 为空，Claude Agent SDK 作为 peerDependency

---

## 2. 执行流程

```mermaid
flowchart LR
    start(["claude-coder run"]) --> main["main() → executeRun()"]

    main --> loop["编码循环"]

    loop --> loadT["loadTasks()"]
    loadT -->|失败| repair["repairJsonFile()"]
    repair --> loadT2["再次 loadTasks()"]
    loadT2 -->|仍失败| abort([终止])

    loadT -->|成功| allDone{全部 done?}
    allDone -->|是| finalSimplify["needsFinalSimplify?<br/>→ simplify + push"]
    finalSimplify --> finish([完成])

    allDone -->|否| snapshot["snapshotBeforeSession()"]
    snapshot --> session["executeCoding(N)"]
    session -->|stalled| onStall["onStall()<br/>回滚 + 重试"]
    onStall --> loop

    session -->|正常| val["validateSession()<br/>(含 AI 修复)"]
    val -->|pass| onSuccess["onSuccess()"]
    onSuccess --> simplifyCheck{shouldSimplify?}
    simplifyCheck -->|是| simplify["tryRunSimplify()"]
    simplify --> push["tryPush()"]
    simplifyCheck -->|否| push
    push --> loop

    val -->|fatal| onFailure["onFailure()<br/>回滚 + 标记 failed?"]
    onFailure --> loop
```

---

## 3. 目录结构与模块职责

```
claude-coder/
├── bin/
│   └── cli.js                    # CLI 入口：参数解析、命令路由
├── src/
│   ├── index.js                  # main() 函数：资产初始化、配置加载、命令分发
│   ├── common/                   # 共享基础设施
│   │   ├── assets.js             # AssetManager：路径注册、读写、模板渲染、recipesDir()
│   │   ├── display.js            # 终端显示基础：COLOR 常量、log()、printModeBanner()
│   │   ├── config.js             # .env 加载、模型映射、环境变量构建、常量定义
│   │   ├── utils.js              # 公共工具（Git、休眠、gitignore 管理）
│   │   ├── tasks.js              # 任务数据读写 + 进度统计
│   │   ├── logging.js            # 日志工具（SDK 消息处理）
│   │   ├── sdk.js                # Claude Agent SDK 加载（缓存）
│   │   ├── indicator.js          # 终端进度指示器
│   │   └── interaction.js        # 人机交互 Hook
│   ├── core/                     # 核心运行时
│   │   ├── runner.js             # 编排循环：session → validate → simplify → push
│   │   ├── session.js            # Session 类：SDK 管理 + query 封装 + 生命周期
│   │   ├── state.js              # 运行状态管理：session_count、task 调度、syncAfterPlan
│   │   ├── coding.js             # 编码 session：prompt 构建 + 执行
│   │   ├── repair.js             # AI 驱动的 JSON 修复（session_result / tasks）
│   │   ├── simplify.js           # 代码审查：智能 diff 范围 + 自动提交
│   │   ├── hooks.js              # Hook 工厂：停顿检测 + 编辑防护 + guidance 注入
│   │   ├── prompts.js            # 提示语构建：模板渲染 + 动态 hint 注入
│   │   ├── plan.js               # 计划生成 + 任务分解（onMessage 捕获 Write 路径）
│   │   ├── go.js                 # AI 需求组装（食谱系统）
│   │   ├── scan.js               # 项目扫描
│   │   └── init.js               # 环境初始化：依赖安装、服务启动
│   └── commands/                 # CLI 命令实现
│       ├── setup.js              # 交互式配置：模型选择、API Key、MCP 工具
│       └── auth.js               # 浏览器凭证：Playwright 登录态导出 / Chrome DevTools 远程调试配置
├── types/
│   └── index.d.ts                # TypeScript 类型声明
├── templates/                    # Prompt 模板目录
│   ├── coreProtocol.md           # 核心协议（全局铁律 + session_result 格式）
│   ├── codingSystem.md           # 编码 session 系统 prompt（3 步工作流）
│   ├── planSystem.md             # 计划 session 系统 prompt
│   ├── scanSystem.md             # 扫描 session 系统 prompt
│   ├── goSystem.md               # Go session 系统 prompt
│   ├── codingUser.md             # 编码 session 用户 prompt 模板
│   ├── scanUser.md               # 扫描 session 用户 prompt 模板
│   ├── planUser.md               # 任务分解用户 prompt 模板
│   ├── guidance.json             # Hook 注入规则（Playwright / Chrome DevTools、Bash 进程管理）
│   ├── web-testing.md            # 浏览器测试通用规则（Playwright / Chrome DevTools 共用）
│   └── bash-process.md           # 进程管理跨平台命令参考
├── recipes/                      # 内置食谱库（可通过 --deploy-templates 部署到项目）
└── design/                       # 设计文档
    ├── ARCHITECTURE.md           # 本文档
    ├── core-code.md              # 代码架构图
    ├── core-flow.md              # 核心流程（权威文档）
    ├── hook-mechanism.md         # Hook 注入机制
    ├── session-guard.md          # Session 守护机制
    ├── indicator-mechanism.md    # 终端指示器机制（双通道显示）
    ├── go-flow.md                # Go 指令流程
    ├── prompt-injection-flow.md  # 提示语注入流程
    └── model-config-flow.md      # 模型配置传导链路
```

### 模块职责说明

| 模块 | 职责 |
|------|------|
| `bin/cli.js` | CLI 入口，解析命令行参数，路由到对应模块 |
| `src/index.js` | `main()` 函数：资产初始化、配置加载、checkReady、命令分发 |
| `src/common/assets.js` | AssetManager 单例：路径注册表、读写接口、模板渲染、`recipesDir()` |
| `src/common/display.js` | 终端显示基础设施：COLOR 常量、log()、printModeBanner() |
| `src/common/config.js` | .env 文件解析、模型配置加载、环境变量构建 + 常量（任务状态、文件名、重试配置） |
| `src/common/utils.js` | 公共工具：Git 操作、gitignore 管理、休眠函数 |
| `src/common/tasks.js` | 任务数据读写：loadTasks / saveTasks / getStats / printStats |
| `src/common/logging.js` | 日志工具：SDK 消息处理、结果提取、Session 分隔符 |
| `src/common/indicator.js` | 终端双通道指示器：spinner 心跳 + 永久工具行 + CJK 宽度 + 路径归一化 |
| `src/core/runner.js` | 编排循环：加载任务 → session → validate → simplify → push |
| `src/core/session.js` | Session 类：`ensureSDK`、`run`、`buildQueryOptions`、`runQuery`、`finish` |
| `src/core/state.js` | 运行状态管理：loadState / saveState / selectNextTask / syncAfterPlan |
| `src/core/coding.js` | 编码 session：构建 coding prompt + 执行 query |
| `src/core/repair.js` | AI 驱动的 JSON 文件修复：session_result.json / tasks.json |
| `src/core/simplify.js` | 代码审查：智能 diff 范围检测 + AI 审查 + 自动提交 |
| `src/core/hooks.js` | Hook 工厂：PreToolUse 拦截、PostToolUse endTool、停顿检测 |
| `src/core/prompts.js` | Prompt 构建：系统 prompt 组装 + 用户 prompt 模板渲染 + hint 注入 |
| `src/core/plan.js` | 计划生成：需求 → 方案文档 → 任务分解 |
| `src/core/go.js` | AI 需求组装：食谱扫描 → 方案生成 → 衔接 plan |
| `src/core/scan.js` | 项目扫描：技术栈识别、服务发现、文档收集 |
| `src/core/init.js` | 环境初始化：npm install、服务启动、健康检查 |
| `src/commands/setup.js` | 交互式配置向导：模型提供商选择、API Key 输入 |
| `src/commands/auth.js` | 浏览器工具凭证/配置：Playwright 登录态导出 + Chrome DevTools 远程调试 |

---

## 4. 文件清单

### 用户项目运行时数据（.claude-coder/）

| 文件 | 生成时机 | 用途 |
|------|----------|------|
| `.env` | `claude-coder setup` | 模型配置 + API Key（gitignored） |
| `project_profile.json` | 首次扫描 | 项目元数据 |
| `tasks.json` | `claude-coder plan` | 任务列表 + 状态跟踪 |
| `progress.json` | 每次 session 结束 | 结构化会话日志 + 成本记录 |
| `session_result.json` | 每次 session 结束 | 当前 session 结果（供下次 session 上下文注入） |
| `test.env` | Agent 写入 | 测试凭证：API Key、测试账号等 |
| `playwright-auth.json` | `claude-coder auth`（isolated 模式） | 浏览器 cookies + localStorage 快照 |
| `.runtime/harness_state.json` | 编码循环 | 运行状态：session 计数、simplify 记录 |
| `.runtime/browser-profile/` | `claude-coder auth`（persistent 模式） | 持久化浏览器 Profile |
| `.runtime/logs/` | 每次 session | 每 session 独立日志文件 |

---

## 5. Prompt 注入架构

### 架构图

```mermaid
flowchart TB
    subgraph PromptFiles["templates/ (模板文件)"]
        coding_sys["codingSystem.md"]
        scan_sys["scanSystem.md"]
        plan_sys["planSystem.md"]
        core_proto["coreProtocol.md"]
        coding_tpl["codingUser.md"]
        scan_tpl["scanUser.md"]
        plan_tpl["planUser.md"]
    end

    subgraph Prompts["src/core/prompts.js (renderTemplate 引擎)"]
        sys_p["buildSystemPrompt()"]
        coding_p["buildCodingContext()"]
        scan_p["buildScanPrompt()"]
        plan_p["buildPlanPrompt()"]
    end

    subgraph SessionQ["Session.runQuery()"]
        query["sdk.query()<br/>systemPrompt + prompt"]
    end

    coding_sys --> sys_p
    scan_sys --> sys_p
    plan_sys --> sys_p
    core_proto --> sys_p
    coding_tpl -->|"renderTemplate({{hints}})"| coding_p
    scan_tpl -->|"renderTemplate({{vars}})"| scan_p
    plan_tpl -->|"renderTemplate({{vars}})"| plan_p
    sys_p --> query
    coding_p --> query
    scan_p --> query
    plan_p --> query
```

### Session 类型与注入内容

| Session 类型 | systemPrompt | user prompt | 触发条件 |
|---|---|---|---|
| **编码** | codingSystem.md + coreProtocol.md | `buildCodingContext()` + 条件 hint | 主循环每次迭代 |
| **扫描** | scanSystem.md + coreProtocol.md | `buildScanPrompt()` + profile 质量要求 | `claude-coder init` |
| **计划** | planSystem.md + coreProtocol.md | `buildPlanPrompt()` + planUser.md | `claude-coder plan` |
| **修复** | 无 | AI 修复 JSON 文件的内联 prompt | JSON 解析失败时 |
| **审查** | 无 | git diff + 审查指令 | 周期性 / 最终审查 |

### 编码 Session 的条件 Hint

| # | Hint | 触发条件 | 影响 |
|---|---|---|---|
| 1 | `taskContext` | 始终注入 | 任务 ID、描述、步骤、进度（结构化注入） |
| 2 | `memoryHint` | session_result.json 存在 | 上次会话摘要 |
| 3 | `envHint` | 按 session 编号和失败状态 | 环境提示 |
| 4 | `docsHint` | profile.existing_docs 非空 | 编码前读文档 |
| 5 | `testEnvHint` | test.env 存在 | 测试凭证提示 |
| 6 | `mcpHint` | WEB_TEST_TOOL 非空 且任务需要 Web | 浏览器测试工具提示 |
| 7 | `webTestHint` | WEB_TEST_TOOL 非空 且任务需要 Web | 工具模式/连接提示 |
| 8 | `retryContext` | 上次校验失败 | 避免同样的问题 |
| 9 | `serviceHint` | 始终注入 | 服务管理策略 |

---

## 6. 注意力机制与设计决策

### U 型注意力优化

System prompt 按 LLM 注意力 U 型曲线排列（`buildSystemPrompt` 将特定协议置于核心协议之前）：

```
顶部 (primacy zone)    → 特定协议（工作流 + 铁律）  → 最高行为合规率
中部 (低注意力区)      → 参考数据（文件格式等）      → 按需查阅
底部 (recency zone)    → 核心协议（全局铁律）        → 最高约束遵循率
```

### 关键设计决策

| 决策 | 理由 |
|------|------|
| **特定协议置顶** | 编码/扫描/计划各有独立的系统 prompt，置于核心协议之前获得 primacy zone 注意力 |
| **Session 类管理生命周期** | ensureSDK + hooks + indicator + logStream 统一在 Session 类中，命令模块只需传入 execute 回调 |
| **main() 函数集中分发** | `src/index.js` 的 `main()` 承担资产初始化、配置加载、checkReady，CLI 层只做参数解析 |
| **AI 修复 JSON** | 用 repair.js 替代 regex 硬提取，更可靠且可扩展 |
| **任务上下文注入** | `buildTaskContext()` 将完整的任务信息（ID、描述、步骤）结构化注入 user prompt |
| **simplify 内聚闭环** | 智能 diff 范围检测 + AI 审查 + 自动提交全在 simplify.js 内完成 |
| **prompts.js 模板分离** | 静态文本抽离到 templates/ 目录，prompts.js 仅负责变量计算和渲染 |
| **食谱按需部署** | 默认读取内置食谱，`--deploy-templates` 可选部署到项目目录供自定义 |

---

## 7. Hook 数据流

> 详细讲解见 [indicator-mechanism.md](indicator-mechanism.md)

SDK 的 hooks 是**进程内回调**（非独立进程），零延迟、无 I/O 开销。终端采用双通道显示：

```mermaid
sequenceDiagram
    participant SDK as Claude Agent SDK
    participant Hook as PreToolUse Hook
    participant IPS as inferPhaseStep()
    participant Ind as Indicator._render()
    participant Stall as stallChecker
    participant Term as 终端 stderr

    SDK->>Hook: PreToolUse {tool_name: "Read", tool_input: {path: "src/app.tsx"}}
    Hook->>IPS: inferPhaseStep(indicator, "Read", input)
    IPS->>IPS: startTool + updatePhase + normalizePath
    IPS->>Term: 永久行: [11:37:48] 00:30 Read src/app.tsx + \n

    Note over SDK,Hook: return {decision: "allow"}

    loop 每 1s
        Ind->>Term: \r\x1b[K ⠇ S1 02:05 思考中（覆盖同一行）
    end

    SDK->>Hook: PostToolUse
    Hook->>Ind: endTool() + updatePhase("thinking")

    loop 每 30s
        Stall->>Ind: 检查 now - lastActivityTime
        alt 超过 STALL_TIMEOUT
            Stall->>SDK: abort() → break for-await
        end
    end
```

---

## 8. 相关文档

- [代码架构图](./core-code.md) — 各模块调用链路详解
- [核心流程](./core-flow.md) — 权威架构文档
- [模型配置传导链路](./model-config-flow.md) — .env 到 SDK 的完整路径
- [Hook 注入机制](./hook-mechanism.md) — GuidanceInjector + 安全防护
- [Session 守护机制](./session-guard.md) — 中断策略 + 活跃度检测
- [终端指示器机制](./indicator-mechanism.md) — 双通道显示 + 路径归一化 + CJK 宽度
- [Go 指令流程](./go-flow.md) — 食谱系统 + AI 需求组装
- [提示语注入流程](./prompt-injection-flow.md) — 每个命令的 prompt 组装过程
