# 代码架构图

## CLI 入口

```
bin/cli.js  parseArgs(argv) → main()
├── run      → runner.run(opts)                    → [runner.run 展开]
├── plan     → plan.run(input, opts)               → [plan.run 展开]
├── init     → init()                              → [scan 展开]
├── simplify → simplify(focus, { n })              → [simplify 展开]
├── setup    → setup.setup()                       → provider/mcp/safety 交互
├── auth     → auth(url)                           → Playwright 登录态导出
└── status   → tasks.showStatus()                  → 进度 + 成本
```

---

## runner.run — 自动编码循环

```
runner.run(opts)                                    ← src/core/runner.js
├── assets.ensureDirs(), loadConfig()
├── isGitRepo() ? skip : execSync('git init')
├── !profile → 提示先 init
├── !tasks.json → 提示先 plan
├── printStats()
│
└── for session = 1..max:
    ├── loadTasks() → findNextTask()                ← common/tasks
    ├── getHead()                                   ← common/utils
    │
    ├── runCodingSession(session, opts)              → [coding 展开]
    │   └── exitCode, logPath
    │
    ├── [stalled] → rollback(head) + markFailed?
    │
    ├── [success] → validate(head, taskId)          → [validator 展开]
    │   ├── [pass]  → simplify?  tryPush?
    │   └── [fatal] → rollback + markFailed?
    │
    ├── appendProgress(entry)
    └── [pause] → promptContinue()
```

---

## coding — 编码 Session

```
runCodingSession(sessionNum, opts)                  ← src/core/coding.js
└── runSession('coding', { execute })               → [base.runSession 展开]
    └── execute(sdk, ctx):
        ├── buildCodingPrompt(sessionNum, opts)     ← core/prompts
        │   ├── loadTasks() → findNextTask()
        │   ├── buildMcpHint / RetryHint / EnvHint / TestHint / DocsHint
        │   ├── buildTaskHint / TestEnvHint / PlaywrightAuthHint
        │   └── assets.render('codingUser', vars)
        ├── buildQueryOptions(config, opts)          ← core/query
        ├── buildSystemPrompt(false)                 ← core/prompts
        │   └── assets.render('agentProtocol')
        ├── ctx.runQuery(sdk, prompt, queryOpts)     → [context.runQuery 展开]
        └── extractResult(collected)                 ← common/logging
```

---

## plan.run — 计划生成 + 任务分解

```
plan.run(input, opts)                               ← src/core/plan.js
├── 读取输入（positional / -r 文件）
├── loadConfig(), assets.ensureDirs()
│
├── runPlanSession(instruction, opts)
│   └── runSession('plan'/'plan_interactive', { execute })  → [base.runSession]
│       └── execute(sdk, ctx):
│           │
│           │ Phase 1: 计划生成
│           ├── _executePlanGen(sdk, ctx, userInput, opts)
│           │   ├── buildPlanOnlyPrompt(userInput, interactive)
│           │   ├── buildQueryOptions()
│           │   ├── buildSystemPrompt(true)
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
│           │   ├── loadTasks(), getStats()
│           │   └── assets.render('addUser', vars)
│           ├── buildQueryOptions()
│           └── ctx.runQuery(sdk, tasksPrompt, ...)   → 模型生成 tasks.json
│
├── printStats()
└── [auto-run] → promptAutoRun() → runner.run(opts)
```

---

## base.runSession — 通用 Session 基座

> 所有 session 类型（coding/plan/scan/simplify）共用此基座。

```
runSession(type, config)                            ← src/core/base.js
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
└── return { exitCode, logPath }
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
│   scan/simplify:    [stall]
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

## validator — Session 结果校验

```
validate(headBefore, taskId)                        ← src/core/validator.js
├── validateSessionResult()
│   ├── assets.readJson('sessionResult')
│   ├── 字段检查: overall_status, summary
│   └── tryExtractFromBroken(raw)  ← 截断 JSON 修复
├── checkGitProgress(headBefore)
│   ├── getGitHead() 对比
│   └── git log --oneline -1
├── inferFromTasks(taskId)
│   └── loadTasks() → 检查 status
├── checkTestCoverage(taskId, statusAfter)
│   └── assets.readJson('tests')
└── return { status: 'pass'|'warning'|'fatal', reason }
```

---

## scan — 项目扫描

```
scan(requirement, opts)                             ← src/core/scan.js
├── retry loop (max 3):
│   └── _runScanSession(requirement, opts)
│       └── runSession('scan', { execute })          → [base.runSession]
│           └── execute(sdk, ctx):
│               ├── buildScanPrompt(projectType, requirement)
│               ├── buildQueryOptions()
│               ├── buildSystemPrompt(true)
│               └── ctx.runQuery(sdk, prompt, opts)
└── validateProfile()
    └── 检查 profile 结构: tech_stack, services
```

---

## simplify — 代码审查简化

```
simplify(focus, opts)                               ← src/core/simplify.js
└── _runSimplifySession(n, focus, opts)
    ├── git diff HEAD~n..HEAD → diff
    └── runSession('simplify', { execute })          → [base.runSession]
        └── execute(sdk, ctx):
            └── ctx.runQuery(sdk, simplifyPrompt, opts)
```

---

## 共享模块（common/）

```
common/
├── config.js      loadConfig, buildEnvVars, getAllowedTools, log, updateEnvVar
├── assets.js      AssetManager: init, read, readJson, writeJson, render, dir, ensureDirs
├── indicator.js   Indicator, inferPhaseStep
├── logging.js     logMessage, extractResult, extractResultText, writeSessionSeparator
├── tasks.js       loadTasks, saveTasks, findNextTask, getFeatures, getStats, forceStatus, printStats
├── utils.js       truncatePath, getGitHead, isGitRepo, appendGitignore, sleep, localTimestamp
├── sdk.js         loadSDK (缓存)
├── constants.js   EDIT_THRESHOLD, RETRY, FILES, TASK_STATUSES
└── interaction.js createAskUserQuestionHook
```
