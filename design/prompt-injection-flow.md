# 提示语注入流程

> 本文档追踪每个 CLI 命令的提示语组装过程：哪些文件被读取、什么条件下注入什么内容。

---

## 总体架构

```
SDK.query({
  prompt:       ← User Prompt（每个命令不同，动态注入 hints）
  systemPrompt: ← System Prompt（coreProtocol + 会话专用协议）
  hooks:        ← PreToolUse/PostToolUse（guidance.json 驱动的运行时注入）
  settingSources: ['project']  ← 自动加载 .claude/CLAUDE.md
})
```

**三层注入：**
1. **System Prompt**（身份 + 铁律 + 工作流）— 不变的协议
2. **User Prompt**（任务上下文 + hints）— 每次 session 动态组装
3. **Hooks**（工具级 guidance）— 模型调用特定工具时按需注入

---

## 1. `run` 命令 → Coding Session

### 入口

```
cli.js → main() → runner.executeRun(config, opts) → for loop
         → coding.executeCoding(config, session, opts)
         → Session.run('coding', config, { execute(session) })
```

### System Prompt 组装

```
buildSystemPrompt('coding')
├── assets.read('codingSystem')     ← templates/codingSystem.md（置顶，primacy zone）
│   └── 编码身份 + 铁律 + 状态机 + 3 步工作流 + 工具规范 + 禁止清单
└── assets.read('coreProtocol')     ← templates/coreProtocol.md
    └── 全局铁律 + session_result.json 格式 + 全局文件权限表
```

### User Prompt 组装

```
buildCodingContext(sessionNum, opts)
└── assets.render('codingUser', vars)    ← templates/codingUser.md
    │
    ├── {{sessionNum}}                   ← 当前 session 编号（固定注入）
    │
    ├── {{taskContext}}                  ← buildTaskContext(projectRoot, taskId)
    │   条件: 始终注入（结构化任务上下文）
    │   读取: .claude-coder/tasks.json → selectNextTask() + getStats()
    │   内容: 任务 ID、描述、状态、category、依赖、完整步骤列表、进度统计
    │
    ├── {{memoryHint}}                   ← buildMemoryHint()
    │   条件: session_result.json 存在且有 session_result 字段
    │   读取: .claude-coder/session_result.json
    │   内容: "上次会话 success（pending → done）。遗留: <notes前200字>"
    │
    ├── {{envHint}}                      ← buildEnvHint(consecutiveFailures, sessionNum)
    │   条件: 按 sessionNum 和失败状态
    │   内容: 首次会话提示 / 失败后提示 / 空
    │
    ├── {{docsHint}}                     ← buildDocsHint()
    │   条件: profile.existing_docs 非空
    │   读取: .claude-coder/project_profile.json → existing_docs
    │   内容: "项目文档: README.md, ..."
    │
    ├── {{testEnvHint}}                  ← buildTestEnvHint(projectRoot)
    │   条件: test.env 存在
    │   内容: "测试凭证文件: <path>，测试前用 source 加载"
    │
    ├── {{mcpHint}}                      ← buildMcpHint(config, task)
    │   条件: config.mcpPlaywright === true 且 needsWebTools(task)
    │   内容: "前端/全栈任务可用 Playwright MCP..."
    │
    ├── {{playwrightAuthHint}}           ← buildPlaywrightAuthHint(config, task)
    │   条件: config.mcpPlaywright === true 且 needsWebTools(task)
    │   读取: config.playwrightMode + 检查 playwright-auth.json
    │   内容: 按 persistent/isolated/extension 模式返回不同提示
    │
    ├── {{retryContext}}                 ← buildRetryHint(consecutiveFailures, lastValidateLog)
    │   条件: consecutiveFailures > 0
    │   内容: "注意：上次会话校验失败，原因：..."
    │
    └── {{serviceHint}}                  ← buildServiceHint(maxSessions)
        条件: 始终注入
        内容: maxSessions===1 ? "停止服务" : "保持服务运行"
```

### SDK 选项

```
session.buildQueryOptions(opts)
├── permissionMode: 'bypassPermissions'
├── cwd: projectRoot
├── env: buildEnvVars(config)    ← API Key、BaseURL、Model 等环境变量
├── settingSources: ['project']  ← 自动加载 .claude/CLAUDE.md
├── model: config.model          ← 条件: config 中有指定
├── maxTurns: config.maxTurns    ← 条件: > 0 时注入
├── hooks: session.hooks         ← createHooks('coding', ...) 产生
├── abortController: session.abortController
└── disallowedTools: ['askUserQuestion']
```

### Hooks 运行时注入

```
createHooks('coding', ...)
├── guidance     ← GuidanceInjector, 基于 guidance.json 规则
│   ├── matcher: "^mcp__playwright__" → 注入 playwright.md（仅一次）
│   │                                 + 按工具名注入 toolTips
│   └── matcher: "Bash", condition: kill/pkill → 注入 bash-process.md（仅一次）
├── editGuard    ← 60s 滑动窗口内编辑超阈值 → deny
├── stop         ← per-turn 日志记录
└── stall        ← 空闲超时 → abort
```

---

## 2. `plan` 命令 → Plan Session

### 入口

```
cli.js → main() → plan.executePlan(config, input, opts)
         → Session.run('plan', config, { execute(session) })
```

### Phase 1：计划生成（permissionMode: 'plan'）

```
System Prompt: 无（SDK plan 模式自带）
User Prompt:   buildPlanOnlyPrompt(userInput, interactive)
               └── 内联构建，不使用模板
               └── 指示模型探索代码 → 写计划到 ~/.claude/plans/*.md

SDK 选项:
├── permissionMode: 'plan'       ← 只读模式，只能读代码不能改
├── hooks: session.hooks          ← createHooks('plan', ...) → 仅 stall 模块
└── disallowedTools: ['askUserQuestion']  ← 非交互模式时禁用
```

### Phase 2：任务分解（permissionMode: 'bypassPermissions'）

```
buildSystemPrompt('plan')
└── planSystem.md + coreProtocol.md

buildPlanPrompt(planPath)
└── assets.render('planUser', vars)       ← templates/planUser.md
    │
    ├── {{profileContext}}               ← profile.tech_stack
    │   读取: .claude-coder/project_profile.json
    │   内容: "项目技术栈: 后端: fastapi, 前端: react"
    │
    ├── {{taskContext}}                  ← loadTasks() + loadState()
    │   读取: .claude-coder/tasks.json + .runtime/harness_state.json
    │   内容: "已有 5 个任务...新任务 ID 从 feat-006 开始，priority 从 6 开始"
    │
    ├── {{recentExamples}}              ← tasks.features.slice(-3)
    │   内容: 最后 3 个任务的格式示例
    │
    ├── {{projectRoot}}                 ← 项目绝对路径
    │
    ├── {{planPath}}                    ← Phase 1 生成的计划文件路径
    │
    ├── {{addGuide}}                    ← assets.read('addGuide')
    │   读取: templates/addGuide.md（完整内容嵌入）
    │   内容: tasks.json 格式 + 字段规范 + 粒度规则 + 验证命令模板
    │
    └── {{testRuleHint}}               ← 条件: testRule 存在 且 .mcp.json 存在
        内容: "项目已配置 Playwright MCP，参考 test_rule.md"

SDK 选项:
├── permissionMode: 'bypassPermissions'
├── systemPrompt: buildSystemPrompt('plan')
└── hooks: session.hooks

后处理:
└── syncAfterPlan()                     ← core/state 同步 harness_state.json 的 next_task_id
```

---

## 3. `init` 命令 → Scan Session

### 入口

```
cli.js → main() → scan.executeScan(config, opts)
         → Session.run('scan', config, { execute(session) })
```

### System Prompt 组装

```
buildSystemPrompt('scan')
├── assets.read('scanSystem')       ← templates/scanSystem.md（置顶）
│   └── 扫描身份 + 扫描铁律 + 扫描文件表 + 扫描协议步骤 + profile.json 格式
└── assets.read('coreProtocol')     ← templates/coreProtocol.md
```

### User Prompt 组装

```
buildScanPrompt(projectType)
└── assets.render('scanUser', { projectType })   ← templates/scanUser.md
    │
    └── {{projectType}}              ← hasCodeFiles() ? 'existing' : 'new'
        内容: "项目类型: existing"
        + profile 质量要求（services 不为空、existing_docs 不为空等）
```

### SDK 选项

```
buildQueryOptions(config, opts)
├── permissionMode: 'bypassPermissions'
├── settingSources: ['project']
└── hooks: session.hooks ← createHooks('scan', ...) → stop + stall 模块
```

---

## 4. `simplify` 命令 → Simplify Session（含 runner 周期调度）

### 入口

```
cli.js → main() → simplify.executeSimplify(config, focus, opts)
         → Session.run('simplify', config, { execute(session) })
```

### Prompt 组装

```
System Prompt: 无（内联在 user prompt 中）
User Prompt:   内联构建
├── getSmartDiffRange()             ← 智能范围：优先查找上次 "style: auto simplify" 以来的 diff
│   └── fallback: git diff HEAD~n..HEAD
├── focus                           ← 用户指定的审查焦点（可选）
└── 审查指令（简化代码、消除重复等）

SDK 选项:
├── permissionMode: 'bypassPermissions'
└── hooks: session.hooks ← createHooks('simplify', ...) → stop + stall 模块

后处理:
└── commitIfDirty()                 ← 自动提交审查结果 "style: auto simplify"
```

---

## 数据流总览

```
harness 读取的文件              注入位置              注入条件
─────────────────────────────────────────────────────────────
.claude-coder/.env              SDK env vars          始终
.claude/CLAUDE.md               SDK settingSources    始终（SDK 自动）
templates/codingSystem.md       systemPrompt          coding（置顶）
templates/scanSystem.md         systemPrompt          scan（置顶）
templates/planSystem.md         systemPrompt          plan（置顶）
templates/coreProtocol.md       systemPrompt          coding, scan, plan（附后）
templates/codingUser.md         user prompt           coding
templates/scanUser.md           user prompt           scan
templates/addUser.md            user prompt           plan phase 2
templates/addGuide.md           user prompt           plan phase 2（嵌入）
templates/guidance.json         hooks                 coding（工具匹配时）
templates/playwright.md         hooks                 coding（MCP 工具首次调用）
templates/bash-process.md       hooks                 coding（kill/taskkill 命令时）
.claude-coder/project_profile   docsHint              profile.existing_docs 非空时
.claude-coder/tasks.json        taskContext            始终（结构化注入）
.claude-coder/session_result    memoryHint            存在时
.claude-coder/test.env          testEnvHint           存在时
.runtime/harness_state.json     taskContext(plan)     plan phase 2
```
