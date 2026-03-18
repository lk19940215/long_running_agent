# 代码架构图

## CLI 入口

```
bin/cli.js  parseArgs(argv) → cliMain()
├── setup    → setup.setup()                       → provider/mcp/safety 交互
├── auth     → auth(url)                           → Playwright 登录态导出
├── status   → tasks.showStatus()                  → 进度 + 成本
└── 其他命令 → src/index.js main(command, input, opts)
              ├── init     → init.executeInit(config, opts)
              ├── scan     → scan.executeScan(config, opts)
              ├── plan     → plan.executePlan(config, input, opts)
              ├── run      → runner.executeRun(config, opts)   → [runner 展开]
              ├── go       → go.executeGo(config, input, opts) → [go-flow.md]
              └── simplify → simplify.executeSimplify(config, input, opts)
```

---

## runner.executeRun — 自动编码循环

```
executeRun(config, opts)                            ← src/core/runner.js
├── loadState() → session_count, next_task_id
│
├── printStats()
│
└── for session = 1..max:
    ├── loadTasks()                                 ← common/tasks
    │   └── [失败] → repairJsonFile(tasksPath)      ← core/repair.js
    │       └── loadTasks() 重试
    │
    ├── isAllDone(taskData)
    │   └── [全完成] → needsFinalSimplify? → tryPush
    │
    ├── snapshotBeforeSession(taskData)
    │   ├── selectNextTask()
    │   └── return { headBefore, taskId }
    │
    ├── executeCoding(config, session, opts)         → [coding 展开]
    │
    ├── [stalled] → onStall(headBefore, taskId)
    │   └── handleRetryOrSkip → rollback + markFailed?
    │
    ├── [正常] → validateSession(headBefore, taskId)
    │   ├── validateSessionResult()
    │   ├── [JSON 损坏] → repairJsonFile() → 重新校验
    │   ├── checkGitProgress()
    │   └── return { fatal, hasWarnings, sessionData }
    │
    ├── [pass] → onSuccess(taskId)
    │   ├── incrementSession()
    │   ├── appendProgress()
    │   ├── shouldSimplify? → tryRunSimplify()
    │   └── tryPush()
    │
    ├── [fatal] → onFailure(headBefore, taskId)
    │   └── handleRetryOrSkip → rollback + markFailed?
    │
    └── [pause] → promptContinue()
```

---

## coding — 编码 Session

```
executeCoding(config, sessionNum, opts)              ← src/core/coding.js
└── Session.run('coding', config, { execute })
    └── execute(session):
        ├── buildCodingContext(sessionNum, opts)     ← core/prompts
        │   ├── _resolveTask(taskId)
        │   ├── buildTaskContext() → 任务详情 + 步骤
        │   ├── buildMcpHint / buildRetryHint / buildEnvHint
        │   ├── buildDocsHint / buildTestEnvHint
        │   ├── buildPlaywrightAuthHint / buildMemoryHint
        │   ├── buildServiceHint
        │   └── assets.render('codingUser', vars)
        ├── session.buildQueryOptions(opts)
        ├── buildSystemPrompt('coding')              ← core/prompts
        │   └── codingSystem.md + coreProtocol.md
        └── session.runQuery(prompt, queryOpts)
```

---

## repair — AI 驱动的 JSON 修复

```
repairJsonFile(filePath, opts)                      ← src/core/repair.js
├── 文件检查: 不存在 / 空内容 → 跳过
├── prompt: "修复 ${filePath} 的 JSON 格式，用 Write 工具写入原路径"
└── Session.run('repair', config, { execute })
    └── execute(session):
        ├── session.buildQueryOptions()
        ├── maxTurns: 3
        └── session.runQuery(prompt, queryOpts)
            └── AI 使用 Write 工具修复文件
```

---

## plan.executePlan — 计划生成 + 任务分解

```
executePlan(config, input, opts)                    ← src/core/plan.js
├── 读取输入（positional / -r 文件）
│
├── Session.run('plan'/'plan_interactive', config, { execute })
│   └── execute(session):
│       │
│       │ Phase 1: 计划生成
│       ├── _executePlanGen(session, userInput, opts)
│       │   ├── buildPlanOnlyPrompt(userInput, interactive)
│       │   ├── queryOpts: { permissionMode: 'plan', hooks: session.hooks }
│       │   ├── session.runQuery(prompt, queryOpts, {
│       │   │     onMessage(msg) → 实时捕获 Write tool_use 中的计划路径
│       │   │   })
│       │   └── copyPlanToProject()
│       │
│       │ Phase 2: 任务分解（除非 --planOnly）
│       ├── buildPlanPrompt(planPath)             ← core/prompts
│       ├── session.buildQueryOptions(opts)
│       ├── queryOpts.systemPrompt = buildSystemPrompt('plan')
│       ├── session.runQuery(tasksPrompt, queryOpts)
│       └── syncAfterPlan()                       ← core/state
│
├── printStats()
└── [auto-run] → promptAutoRun() → executeRun(config, opts)
```

---

## Session — 通用 Session 管理

> 所有 session 类型（coding/plan/scan/simplify/repair/go）共用此类。

```
Session.run(type, config, { execute, logFileName, sessionNum, label })
├── Session.ensureSDK(config)                       ← 懒加载 SDK 单例 + 注入环境变量
├── session = new Session(type, config, { ... })
│   ├── _initLogging(logFileName, logStream)
│   │   └── WriteStream → logStream
│   ├── writeSessionSeparator()
│   ├── _initHooks(hookType)                        → [hooks 展开]
│   │   └── createHooks(type, indicator, logStream, options)
│   └── _startIndicator(sessionNum, stallTimeoutMin)
│       └── indicator.start() → setInterval(_render, 1s)
│
├── execute(session)                                ← 由调用方提供
│   ├── session.buildQueryOptions(overrides)
│   └── session.runQuery(prompt, queryOpts, { onMessage })
│       ├── sdk.query({ prompt, options: queryOpts })
│       ├── for await (message of querySession):
│       │   ├── messages.push(message)
│       │   ├── _logMessage(message)
│       │   └── onMessage?(message, messages)
│       └── return { messages, success, subtype, cost, usage, turns }
│
├── session.finish()
│   ├── cleanup() → clearInterval(stallChecker)
│   ├── logStream.end()
│   └── indicator.stop()
└── return { exitCode, logFile, stalled, ...result }
```

---

## hooks — Hook 工厂

> 详细讲解见 [hook-mechanism.md](hook-mechanism.md)

```
createHooks(type, indicator, logStream, options)    ← src/core/hooks.js
│
├── FEATURE_MAP[type] → 选取功能模块
│   coding:           [guidance, editGuard, stop, stall]
│   plan:             [stop, stall]
│   plan_interactive: [stop, stall, interaction]
│   go:               [stop, stall, interaction]
│   scan/simplify:    [stop, stall]
│   repair:           [stop, stall]
│
├── createStallModule(indicator, logStream, options)
│   └── setInterval(checkStall, 30s)
│       └── idle > stallTimeout → abort()
│
├── createEditGuardModule(options)
│   └── 滑动窗口（60s）内编辑超阈值 → deny
│
├── createGuidanceModule()
│   └── GuidanceInjector.createHook()
│       └── 三级匹配: matcher → condition → file/toolTips → additionalContext
│
└── 组装:
    PreToolUse:          [logging, editGuard?, guidance?, interaction?]
    PostToolUse:         [endToolHook]
    PostToolUseFailure:  [failureHook (endTool)]
    Stop:                [stopHook?]
    SessionStart:        [sessionStartHook]
```

---

## simplify — 代码审查简化

```
executeSimplify(config, focus, opts)                ← src/core/simplify.js
├── getSmartDiffRange(projectRoot, n)
│   ├── git log --grep='style: auto simplify' → 上次审查 commit
│   └── fallback → HEAD~n..HEAD
├── git diff <range> → diff
│
├── Session.run('simplify', config, { execute })
│   └── execute(session):
│       ├── session.buildQueryOptions(opts)
│       ├── disallowedTools: ['askUserQuestion']
│       └── session.runQuery(prompt, queryOpts)
│
└── commitIfDirty(projectRoot)                      ← 自动提交 "style: auto simplify"
```

---

## scan — 项目扫描

```
executeScan(config, opts)                           ← src/core/scan.js
├── retry loop (max 3):
│   └── Session.run('scan', config, { execute })
│       └── execute(session):
│           ├── buildScanPrompt(projectType)
│           ├── session.buildQueryOptions(opts)
│           ├── buildSystemPrompt('scan')
│           │   └── scanSystem.md + coreProtocol.md
│           └── session.runQuery(prompt, queryOpts)
└── validateProfile()
    └── 检查 profile 结构: tech_stack, services
```

---

## state — 运行状态管理

```
state.js                                            ← src/core/state.js
├── loadState() / saveState()
├── incrementSession()
├── markSimplifyDone()
├── syncAfterPlan()                                 ← plan.js 调用
└── selectNextTask(taskData)
    ├── failed 优先（按 priority）
    ├── pending 且依赖就绪（按 priority）
    └── in_progress（按 priority）
```

---

## indicator — 终端指示器（双通道显示）

> 详细讲解见 [indicator-mechanism.md](indicator-mechanism.md)

```
通道 A — Spinner 心跳（Indicator._render, 每秒覆盖）
  ⠇ S1 02:05 思考中

通道 B — 永久工具行（inferPhaseStep, 每次工具调用追加 \n）
  [HH:MM:SS] MM:SS ToolName target

Indicator                                           ← src/common/indicator.js
├── start(sessionNum, stallTimeoutMin, projectRoot)
├── stop()
├── startTool()         → toolRunning=true, 重置 lastActivityTime
├── endTool()           → toolRunning=false, 重置 lastActivityTime（幂等）
├── updateActivity()    → 仅重置 lastActivityTime
├── pauseRendering()    → _paused=true（文本输出期间）
├── resumeRendering()   → _paused=false
└── _render()           → 每秒 \r\x1b[K 覆盖同一行（仅 spinner + 时间 + 阶段）

inferPhaseStep(indicator, toolName, toolInput)       ← 输出永久行
├── Write/Edit/MultiEdit  → coding, target: file_path
├── Bash/Shell            → target: extractBashCore(command)
├── Read/Glob/Grep/LS    → thinking, target: file_path / pattern
├── Task                  → thinking
├── WebSearch/WebFetch    → thinking
├── mcp__*                → coding, target: url / element
└── 其他                  → 原始工具名
```

---

## 共享模块（common/）

```
common/
├── assets.js      AssetManager: init, read, readJson, writeJson, render, dir, ensureDirs, recipesDir
├── config.js      loadConfig, buildEnvVars, log, updateEnvVar
├── constants.js   EDIT_THRESHOLD, RETRY, FILES, TASK_STATUSES
├── indicator.js   Indicator, inferPhaseStep
├── interaction.js createAskUserQuestionHook
├── logging.js     logMessage, extractResult, extractResultText, writeSessionSeparator
├── sdk.js         loadSDK (缓存)
├── tasks.js       loadTasks, saveTasks, getFeatures, getStats, printStats
└── utils.js       truncatePath, getGitHead, isGitRepo, appendGitignore, ensureGitignore, sleep
```
