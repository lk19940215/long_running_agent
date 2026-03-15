# 代码架构图

## CLI 入口

```
bin/cli.js  parseArgs(argv) → main()
├── run      → runner.run(opts)                    → [runner.run 展开]
├── plan     → plan.run(input, opts)               → [plan.run 展开]
├── init     → init()                              → [scan 展开]
├── simplify → simplify(focus, { n })              → [simplify 展开]
├── setup    → setup.setup()                       → provider/mcp/safety 交互
├── go       → go.run(input, opts)                  → [go-flow.md]
├── auth     → auth(url)                           → Playwright 登录态导出
└── status   → tasks.showStatus()                  → 进度 + 成本
```

---

## runner.run — 自动编码循环

```
runner.run(opts)                                    ← src/core/runner.js
├── config = loadConfig()
├── harness = new Harness(config)                   ← src/core/harness.js
├── harness.ensureEnvironment()
│   ├── assets.ensureDirs()
│   ├── ensureGitignore()
│   └── !isGitRepo → git init
│
├── harness.checkPrerequisites()
│   ├── !profile → 提示先 init
│   └── !tasks.json → 提示先 plan
│
├── printStats()
│
└── for session = 1..max:
    ├── loadTasks()                                 ← common/tasks
    │   └── [失败] → repairJsonFile(tasksPath)      ← core/repair.js
    │       └── loadTasks() 重试
    │
    ├── harness.isAllDone(taskData)
    │   └── [全完成] → needsFinalSimplify? → tryPush
    │
    ├── harness.snapshot(taskData)
    │   ├── selectNextTask()
    │   └── return { headBefore, taskId }
    │
    ├── runCodingSession(session, opts)              → [coding 展开]
    │
    ├── [stalled] → harness.onStall()
    │   └── _handleRetryOrSkip → rollback + markFailed?
    │
    ├── [正常] → harness.validate(headBefore, taskId)
    │   ├── _validateSessionResult()
    │   ├── [JSON 损坏] → repairJsonFile() → 重新校验
    │   ├── _checkGitProgress()
    │   └── return { fatal, hasWarnings, sessionData }
    │
    ├── [pass] → harness.onSuccess()
    │   ├── _incrementSession()
    │   ├── _appendProgress()
    │   ├── shouldSimplify? → tryRunSimplify()
    │   │   ├── simplify()
    │   │   └── harness.afterSimplify()
    │   └── harness.tryPush()
    │
    ├── [fatal] → harness.onFailure()
    │   └── _handleRetryOrSkip → rollback + markFailed?
    │
    └── [pause] → promptContinue()
```

---

## harness — 生命周期管理

```
Harness                                             ← src/core/harness.js
│
├── 状态管理 (harness_state.json)
│   ├── loadState() / saveState()
│   ├── _incrementSession()
│   ├── _markSimplifyDone()
│   └── syncAfterPlan()                             ← plan.js 调用
│
├── 任务调度
│   └── selectNextTask(taskData)
│       ├── failed 优先（按 priority）
│       ├── pending 且依赖就绪（按 priority）
│       └── in_progress（按 priority）
│
├── 校验
│   ├── validate(headBefore, taskId)
│   │   ├── _validateSessionResult()
│   │   │   ├── 不存在 → { valid: false }
│   │   │   ├── JSON 解析失败 → { rawContent }
│   │   │   └── 字段检查 → { valid: true/false, data }
│   │   ├── [rawContent] → repairJsonFile() → 重新校验
│   │   ├── _checkGitProgress(headBefore)
│   │   └── _inferFromTasks(taskId)
│   │
│   └── 分层策略:
│       ├── valid + no warning      → pass
│       ├── invalid + hasCommit     → warn（不回滚）
│       └── invalid + no commit     → fatal（回滚）
│
├── 生命周期回调
│   ├── onSuccess()  → _incrementSession + _appendProgress
│   ├── onFailure()  → _handleRetryOrSkip
│   ├── onStall()    → _handleRetryOrSkip
│   └── _handleRetryOrSkip()
│       ├── _rollback(headBefore)
│       ├── [超限] → _markTaskFailed()
│       └── _appendProgress()
│
├── Simplify 调度（由 runner 调用）
│   ├── shouldSimplify()     → session_count % interval === 0
│   ├── needsFinalSimplify() → last_simplify < session_count
│   └── afterSimplify(msg)   → _markSimplifyDone + _commitIfDirty
│
├── Git 操作
│   ├── tryPush()       → git push
│   ├── _rollback()     → git reset --hard + git clean -fd
│   └── _commitIfDirty() → git add -A + git commit
│
└── 进程管理
    └── cleanup() → _killServicesByProfile()
```

---

## coding — 编码 Session

```
runCodingSession(sessionNum, opts)                  ← src/core/coding.js
└── runSession('coding', { execute })               → [session 展开]
    └── execute(sdk, ctx):
        ├── buildCodingContext(sessionNum, opts)     ← core/prompts
        │   ├── _resolveTask(taskId)
        │   ├── buildTaskContext() → 任务详情 + 步骤
        │   ├── buildMcpHint / buildRetryHint / buildEnvHint
        │   ├── buildDocsHint / buildTestEnvHint
        │   ├── buildPlaywrightAuthHint / buildMemoryHint
        │   ├── buildServiceHint
        │   └── assets.render('codingUser', vars)
        ├── buildQueryOptions(config, opts)          ← core/query
        ├── buildSystemPrompt('coding')              ← core/prompts
        │   └── codingSystem.md + coreProtocol.md
        ├── ctx.runQuery(sdk, prompt, queryOpts)     → [context.runQuery 展开]
        └── extractResult(collected)                 ← common/logging
```

---

## repair — AI 驱动的 JSON 修复

```
repairJsonFile(filePath, opts)                      ← src/core/repair.js
├── 文件检查: 不存在 / 空内容 → 跳过
├── prompt: "修复 ${filePath} 的 JSON 格式，用 Write 工具写入原路径"
└── runSession('repair', { execute })               → [session 展开]
    └── execute(sdk, ctx):
        ├── buildQueryOptions()
        ├── maxTurns: 3
        └── ctx.runQuery(sdk, prompt, queryOpts)
            └── AI 使用 Write 工具修复文件
```

---

## plan.run — 计划生成 + 任务分解

```
plan.run(input, opts)                               ← src/core/plan.js
├── 读取输入（positional / -r 文件）
├── loadConfig(), assets.ensureDirs()
│
├── runPlanSession(instruction, opts)
│   └── runSession('plan'/'plan_interactive', { execute })  → [session]
│       └── execute(sdk, ctx):
│           │
│           │ Phase 1: 计划生成
│           ├── _executePlanGen(sdk, ctx, userInput, opts)
│           │   ├── buildPlanOnlyPrompt(userInput, interactive)
│           │   ├── buildQueryOptions()
│           │   ├── buildSystemPrompt('plan')
│           │   │   └── planSystem.md + coreProtocol.md
│           │   ├── sdk.query()  ← 直接调用，非 ctx.runQuery
│           │   ├── ctx._logMessage() 逐条处理
│           │   ├── ExitPlanMode 检测
│           │   ├── extractResultText()
│           │   ├── extractPlanPath()
│           │   └── copyPlanToProject()
│           │
│           │ Phase 2: 任务分解（除非 --planOnly）
│           ├── buildPlanPrompt(planPath)             ← core/prompts
│           │   ├── assets.readJson('profile')
│           │   ├── loadTasks(), getStats(), loadState()
│           │   └── assets.render('addUser', vars)
│           ├── buildQueryOptions()
│           ├── ctx.runQuery(sdk, tasksPrompt, ...)   → 模型生成 tasks.json
│           └── syncAfterPlan()                       ← core/harness
│
├── printStats()
└── [auto-run] → promptAutoRun() → runner.run(opts)
```

---

## session — 通用 Session 执行器

> 所有 session 类型（coding/plan/scan/simplify/repair）共用此执行器。

```
runSession(type, config)                            ← src/core/session.js
├── loadSDK()                                       ← common/sdk
├── ctx = new SessionContext(type, opts)             → [SessionContext 展开]
├── ctx.initLogging(logFileName, logStream)
│   └── WriteStream → logStream
├── ctx.initHooks(hookType)                         → [hooks 展开]
│   └── createHooks(type, indicator, logStream, options)
├── ctx.startIndicator(sessionNum, stallTimeoutMin)
│   └── indicator.start() → setInterval(_render, 1s)
│
├── config.execute(sdk, ctx)                        ← 由调用方提供
│
├── ctx.finish()
│   ├── indicator.stop()
│   └── hooks.cleanup()  → clearInterval(stallChecker)
└── return { exitCode, logPath, stalled }
```

---

## hooks — Hook 工厂

> 详细讲解见 [hook-mechanism.md](hook-mechanism.md)

```
createHooks(type, indicator, logStream, options)    ← src/core/hooks.js
│
├── FEATURE_MAP[type] → 选取功能模块
│   coding:           [guidance, editGuard, completion, stall]
│   plan:             [stall]
│   plan_interactive: [stall, interaction]
│   go:               [stall, interaction]
│   scan/simplify:    [stall]
│   repair:           [stall]
│
├── createStallModule(indicator, logStream, options)
│   └── setInterval(checkStall, 30s)
│       ├── idle > stallTimeout → abort()
│       └── completionDetected + idle > completionTimeout → abort()
│
├── createEditGuardModule(options)
│   └── 滑动窗口（60s）内编辑超阈值 → deny
│
├── createCompletionModule(indicator, stallModule)
│   └── PostToolUse: endTool() + session_result 检测
│
├── createGuidanceModule()
│   └── GuidanceInjector.createHook()
│       └── 三级匹配: matcher → condition → file/toolTips → additionalContext
│
└── 组装:
    PreToolUse:          [logging, editGuard?, guidance?, interaction?]
    PostToolUse:         [completion 或 fallback endTool]
    PostToolUseFailure:  [failureHook (endTool)]
```

---

## simplify — 代码审查简化

```
simplify(focus, opts)                               ← src/core/simplify.js
└── _runSimplifySession(n, focus, opts)
    ├── git diff HEAD~n..HEAD → diff
    └── runSession('simplify', { execute })          → [session]
        └── execute(sdk, ctx):
            └── ctx.runQuery(sdk, simplifyPrompt, opts)
```

---

## scan — 项目扫描

```
scan(opts)                                          ← src/core/scan.js
├── retry loop (max 3):
│   └── _runScanSession(opts)
│       └── runSession('scan', { execute })          → [session]
│           └── execute(sdk, ctx):
│               ├── buildScanPrompt(projectType)
│               ├── buildQueryOptions()
│               ├── buildSystemPrompt('scan')
│               │   └── scanSystem.md + coreProtocol.md
│               └── ctx.runQuery(sdk, prompt, opts)
└── validateProfile()
    └── 检查 profile 结构: tech_stack, services
```

---

## context — Session 上下文

```
SessionContext                                      ← src/core/context.js
├── constructor(type, opts)
│   ├── loadConfig() → config
│   ├── new Indicator()
│   └── new AbortController()
│
├── initHooks(hookType)
│   └── createHooks() → { hooks, cleanup, isStalled }
│
├── runQuery(sdk, prompt, queryOpts)
│   ├── sdk.query({ prompt, options: { hooks, ... } })
│   ├── for await (message of response):
│   │   ├── _logMessage(message)
│   │   └── collected.push(message)
│   └── stalled? → log warning
│
├── _logMessage(message)
│   ├── hasText? → pauseRendering + \r\x1b[K + stdout.write
│   ├── baseLogMessage(message, logStream, indicator)
│   └── hasText? → resumeRendering
│
└── finish() / errorFinish()
    ├── indicator.stop()
    └── hooks.cleanup()
```

---

## indicator — 终端指示器

> 详细讲解见 [session-guard.md](session-guard.md)

```
Indicator                                           ← src/common/indicator.js
├── startTool(name)     → toolRunning=true, 重置 lastActivityTime
├── endTool()           → toolRunning=false, 重置 lastActivityTime（幂等）
├── updateActivity()    → 仅重置 lastActivityTime
├── pauseRendering()    → _paused=true（文本输出期间）
├── resumeRendering()   → _paused=false
├── getStatusLine()     → 组装状态行
│   ├── toolRunning && idle >= 2min → 黄色"工具执行中"
│   ├── !toolRunning && idle >= 2min → 红色"无响应"
│   └── step + toolTarget
└── _render()           → 每秒 \r\x1b[K 覆盖同一行

inferPhaseStep(indicator, toolName, toolInput)
├── Write/Edit/MultiEdit  → coding / 编辑文件
├── Bash/Shell            → extractBashLabel + extractBashTarget
├── Read/Glob/Grep/LS    → thinking / 读取文件
├── Task                  → thinking / 子 Agent 搜索
├── WebSearch/WebFetch    → thinking / 查阅文档
├── mcp__*                → coding / 浏览器: action
└── 其他                  → 工具调用
```

---

## 共享模块（common/）

```
common/
├── assets.js      AssetManager: init, read, readJson, writeJson, render, dir, ensureDirs
├── config.js      loadConfig, buildEnvVars, log, updateEnvVar
├── constants.js   EDIT_THRESHOLD, RETRY, FILES, TASK_STATUSES
├── indicator.js   Indicator, inferPhaseStep
├── interaction.js createAskUserQuestionHook
├── logging.js     logMessage, extractResult, extractResultText, writeSessionSeparator
├── sdk.js         loadSDK (缓存)
├── tasks.js       loadTasks, saveTasks, getFeatures, getStats, printStats
└── utils.js       truncatePath, getGitHead, isGitRepo, appendGitignore, ensureGitignore, sleep
```
