```
cli.js:107  →  runner.run(opts)
                ├── config: paths(), loadConfig(), ensureLoopDir()     ← common/config
                ├── git check: execSync('git rev-parse ...')           ← 直接调用
                ├── precondition: fs.existsSync(profile/tasks)
                ├── printStats() → loadTasks(), getStats()             ← common/tasks
                ├── loadSDK()                                          ← common/sdk
                │
                └── for session=1..N:
                    ├── loadTasks(), getFeatures(), getStats()         ← common/tasks
                    ├── findNextTask()                                  ← common/tasks
                    ├── getHead() → getGitHead(cwd)                    ← common/utils ✓
                    │
                    ├── runCodingSession(session, opts)                 ← core/coding.js
                    │   └── runSession('coding', ...)                   ← core/base.js
                    │       ├── loadSDK()                               ← common/sdk (缓存命中)
                    │       ├── new SessionContext('coding', opts)      ← core/context.js
                    │       │   ├── loadConfig()                        ← [重复调用]
                    │       │   ├── Object.assign(process.env, ...)     ← 副作用
                    │       │   ├── new Indicator()                     ← common/indicator
                    │       │   └── paths()
                    │       ├── initLogging() → WriteStream
                    │       ├── writeSessionSeparator()                 ← common/logging
                    │       ├── initHooks('coding')                     ← core/hooks.js
                    │       │   └── createHooks → [guidance, editGuard, completion, stall]
                    │       ├── startIndicator()
                    │       │
                    │       └── execute(sdk, ctx):
                    │           ├── buildCodingPrompt(sessionNum)       ← core/prompts.js
                    │           │   ├── loadConfig()                    ← [又重复]
                    │           │   ├── loadTasks(), findNextTask()     ← [又重复]
                    │           │   ├── readJson(tests/profile/sr)      ← common/utils ✓
                    │           │   └── loadAndRender(codingUser)
                    │           ├── buildQueryOptions(config, opts)     ← core/query.js
                    │           ├── buildSystemPrompt(false)            ← core/prompts.js
                    │           ├── ctx.runQuery(sdk, prompt, opts)     ← context.js
                    │           │   └── sdk.query() + _logMessage()
                    │           └── extractResult(collected)            ← common/logging
                    │
                    ├── validate(headBefore, taskId)                    ← core/validator.js
                    │   ├── validateSessionResult()
                    │   │   ├── readJson(sessionResult)                ← common/utils ✓
                    │   │   └── tryExtractFromBroken(raw)               ← 截断修复
                    │   ├── checkGitProgress(headBefore)
                    │   │   ├── getGitHead(getProjectRoot())           ← common/utils ✓
                    │   │   └── execSync('git log --oneline -1')       ← ⚠ BUG
                    │   ├── inferFromTasks(taskId) → loadTasks()
                    │   └── checkTestCoverage() → readJson(tests)      ← common/utils ✓
                    │
                    ├── [pass] loadConfig(), simplify(), tryPush()
                    ├── [fatal] rollback() → git reset --hard
                    └── appendProgress() → readJson/writeJson          ← common/utils ✓
```

```
cli.js:122  →  plan.run(input, opts)
                ├── fs.readFileSync(reqPath)       ← -r 参数读文件
                ├── paths(), ensureLoopDir()        ← common/config
                ├── loadConfig()                    ← common/config
                ├── fs.existsSync(p.profile)
                ├── promptAutoRun()                 ← readline
                │
                └── runPlanSession(instruction, opts)
                    └── runSession('plan', ...)      ← core/base.js
                        ├── loadSDK()                ← common/sdk
                        ├── new SessionContext('plan', opts)
                        │   └── loadConfig()         ← [重复]
                        ├── initHooks('plan')         ← ⚠ 'plan' 不在 FEATURE_MAP
                        │   └── fallback → [STALL] only
                        │
                        └── execute(sdk, ctx):
                            │
                            │ Phase 1: _executePlanGen()
                            │   ├── sdk.query(...)    ← ⚠ 直接调用，未走 ctx.runQuery()
                            │   ├── ctx._logMessage() ← 手动逐条处理
                            │   ├── ExitPlanMode 超时检测
                            │   ├── extractResultText()     ← common/logging
                            │   ├── extractPlanPath()        ← regex
                            │   └── copyPlanToProject()      ← fs.copyFileSync
                            │
                            │ Phase 2: tasks.json 生成
                            │   ├── buildPlanPrompt(planPath) ← core/prompts.js
                            │   │   ├── readJson(profile)     ← common/utils ✓
                            │   │   ├── loadTasks(), getStats() ← common/tasks
                            │   │   └── loadAndRender(addUser)
                            │   ├── buildQueryOptions()        ← core/query.js
                            │   ├── buildPlanSystemPrompt()    ← 硬编码字符串
                            │   └── ctx.runQuery(sdk, ...)     ← context.js ✓
                            │
                ├── printStats()                    ← [与 runner 重复]
                └── [auto-run] require('./runner').run(opts)
```