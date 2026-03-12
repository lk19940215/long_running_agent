---
name: Unified AssetManager and cleanup
overview: 将 config.js 中的 paths() 和所有路径管理合并到 AssetManager，提供统一 API（read/readJson/write/writeJson/path/exists/dir）；重构 prompts.js 提取 hint 函数；全局代码清理。
todos:
  - id: expand-asset-manager
    content: 扩展 assets.js：统一注册表 + path/read/readJson/write/writeJson/exists/dir/ensureDirs API
    status: completed
  - id: simplify-config
    content: 精简 config.js：移除 paths()/getLoopDir()/ensureLoopDir()，loadConfig 改用 assets
    status: completed
  - id: update-consumers
    content: 更新 ~20 个消费方文件：paths() -> assets API
    status: completed
  - id: refactor-prompts
    content: 重构 prompts.js：提取 10 个 hint 函数
    status: completed
  - id: fix-hooks-bug
    content: 修复 hooks.js fs 缺失 BUG + 全局代码清理
    status: completed
  - id: update-tests
    content: 更新测试用例，终端全流程测试
    status: completed
isProject: false
---

# 统一 AssetManager + prompts 重构 + 代码清理

## 1. 扩展 AssetManager — 统一注册表 + 统一 API

文件：[src/common/assets.js](src/common/assets.js)

将现有 `REGISTRY`（模板）扩展为包含所有文件类型的统一注册表，通过 `kind` 字段内部区分：

```javascript
const REGISTRY = new Map([
  // Templates (dual-resolve: user assets dir -> bundled dir, cached)
  ['agentProtocol', { kind: 'template', file: 'agentProtocol.md' }],
  ['scanProtocol',  { kind: 'template', file: 'scanProtocol.md' }],
  // ... 其他 11 个模板 ...

  // Data files (single dir: .claude-coder/)
  ['env',            { kind: 'data', file: '.env' }],
  ['tasks',          { kind: 'data', file: 'tasks.json' }],
  ['progress',       { kind: 'data', file: 'progress.json' }],
  ['sessionResult',  { kind: 'data', file: 'session_result.json' }],
  ['profile',        { kind: 'data', file: 'project_profile.json' }],
  ['tests',          { kind: 'data', file: 'tests.json' }],
  ['testEnv',        { kind: 'data', file: 'test.env' }],
  ['playwrightAuth', { kind: 'data', file: 'playwright-auth.json' }],
  ['browserProfile', { kind: 'runtime', file: 'browser-profile' }],

  // Project root files (base = projectRoot, not loopDir)
  ['mcpConfig',      { kind: 'root', file: '.mcp.json' }],
]);

const DIRS = new Map([
  ['loop',     ''],
  ['assets',   'assets'],
  ['runtime',  '.runtime'],
  ['logs',     '.runtime/logs'],
]);
```

**统一 API（对外一套方法，内部按 kind 分流）：**

- `path(name)` — 任意注册名 -> 完整路径
- `read(name)` — 模板: cached dual-resolve string; 数据: raw string (no cache)
- `readJson(name, fallback?)` — read + JSON.parse
- `write(name, content)` — 写入 raw string（仅 data/runtime/root）
- `writeJson(name, data)` — JSON.stringify + write
- `exists(name)` — 检查文件是否存在
- `dir(name)` — 获取目录路径
- `render(name, vars)` — 模板渲染（仅 template）
- `ensureDirs()` — 创建所有目录（替代 ensureLoopDir）
- `deployAll()` — 部署模板到 assets（已有）

**init 自动化：** `init(projectRoot?)` 接收 projectRoot（默认 `process.cwd()`），自动计算 loopDir、assetsDir、runtime。支持懒初始化（首次调用 path/read 时自动 init）。

## 2. 精简 config.js

文件：[src/common/config.js](src/common/config.js)

**移除：**

- `paths()` 函数（完全被 assets 接管）
- `getLoopDir()` 函数
- `ensureLoopDir()` 函数（被 `assets.ensureDirs()` 替代）

**保留（不动）：**

- `COLOR`, `log()` — 日志
- `getProjectRoot()` — 基础工具
- `loadConfig()` — 内部改用 `assets.path('env')` 获取路径
- `parseEnvFile()`, `buildEnvVars()`, `getAllowedTools()`, `updateEnvVar()` — env 管理

## 3. 更新所有消费方（~20 个文件）

替换模式对照：

- `const p = paths(); readJson(p.tasksFile, null)` -> `assets.readJson('tasks')`
- `writeJson(p.tasksFile, data)` -> `assets.writeJson('tasks', data)`
- `fs.existsSync(p.profile)` -> `assets.exists('profile')`
- `p.logsDir` -> `assets.dir('logs')`
- `p.mcpConfig` -> `assets.path('mcpConfig')`
- `fs.readFileSync(p.envFile, 'utf8')` -> `assets.read('env')`
- `ensureLoopDir()` -> `assets.ensureDirs()`

涉及文件清单：

- `src/common/tasks.js` — loadTasks, saveTasks, showStatus
- `src/core/context.js` — constructor
- `src/core/hooks.js` — GuidanceInjector.createHook
- `src/core/init.js` — init, loadProfile
- `src/core/plan.js` — run
- `src/core/prompts.js` — buildCodingPrompt, buildPlanPrompt
- `src/core/runner.js` — killServicesByProfile, appendProgress, run
- `src/core/scan.js` — validateProfile, scan
- `src/core/validator.js` — validateSessionResult, checkTestCoverage
- `src/core/simplify.js` — simplify
- `src/commands/auth.js` — auth, updateMcpConfig
- `src/commands/setup.js` — setup
- `src/commands/setup-modules/mcp.js` — configureMCP
- `src/commands/setup-modules/helpers.js` — ensureGitignore

## 4. 重构 prompts.js — 提取 hint 函数

文件：[src/core/prompts.js](src/core/prompts.js)

将 `buildCodingPrompt` 中的 10 个 inline hint 块提取为独立函数：

```javascript
function buildMcpHint(config) { ... }
function buildRetryHint(failures, lastLog) { ... }
function buildEnvHint(failures, sessionNum) { ... }
function buildTestHint() { ... }
function buildDocsHint() { ... }
function buildTaskHint(projectRoot) { ... }
function buildTestEnvHint(projectRoot) { ... }
function buildPlaywrightAuthHint(config) { ... }
function buildMemoryHint() { ... }
function buildServiceHint(maxSessions) { ... }

function buildCodingPrompt(sessionNum, opts = {}) {
  const config = loadConfig();
  const projectRoot = getProjectRoot();
  return assets.render('codingUser', {
    sessionNum,
    mcpHint: buildMcpHint(config),
    retryContext: buildRetryHint(opts.consecutiveFailures, opts.lastValidateLog),
    envHint: buildEnvHint(opts.consecutiveFailures, sessionNum),
    testHint: buildTestHint(),
    docsHint: buildDocsHint(),
    taskHint: buildTaskHint(projectRoot),
    testEnvHint: buildTestEnvHint(projectRoot),
    playwrightAuthHint: buildPlaywrightAuthHint(config),
    memoryHint: buildMemoryHint(),
    serviceHint: buildServiceHint(opts.maxSessions),
  });
}
```

100+ 行简化为 ~15 行编排器，每个 hint 函数独立可维护。

## 5. 代码清理

**BUG 修复：**

- [src/core/hooks.js](src/core/hooks.js) — `getFileContent()` 使用 `fs.readFileSync` 但 `fs` 已被移除，需加回 `const fs = require('fs')`

**清理项：**

- [src/commands/setup-modules/helpers.js](src/commands/setup-modules/helpers.js) — `ensureGitignore` 日志仅提及 `.env`，实际也添加了 `.runtime/`
- [src/commands/setup-modules/simplify.js](src/commands/setup-modules/simplify.js) — `newInterval` 赋值后逻辑不一致
- 全局清理：移除所有 `require('../common/config').paths` 导入，替换为 `require('../common/assets').assets`
- 移除 `readJson`/`writeJson` from utils.js 的直接调用（改用 `assets.readJson`/`assets.writeJson`）