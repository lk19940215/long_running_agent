# Session 守护机制

本文档描述 Claude Coder 的会话中断与活跃度检测机制，包含完成检测、stall 检测、倒计时重置、终端指示器四个部分。

---

## 一、会话完成检测

### 1.1 Result Message（流转控制）

`sdk.query()` 的消息流在结束时包含 `SDKResultMessage`，其 `subtype` 字段是判断查询是否正常完成的**唯一可靠信号**。

| subtype | 含义 |
|---------|------|
| `success` | 模型正常完成 |
| `error_max_turns` | 超过最大 turn 数限制 |
| `error_during_execution` | 执行过程中出错 |
| `error_max_budget_usd` | 超过预算限制 |

`session.runQuery()` 返回结构化结果 `{ messages, success, subtype, cost, usage, turns }`，由 `Session` 内聚处理。

### 1.2 Stop Hook（per-turn 日志）

> **注意**：Stop hook 在**每个 model response turn** 都会触发，不仅在会话结束时。因此它**不能**作为会话完成信号。

当前用途：per-turn 日志记录（`createStopHook`），辅助调试。

### 1.3 SessionEnd Hook（未使用）

SDK 提供 `SessionEnd` hook，在 `sdk.query()` 结束时触发一次。当前未使用，因为 result message + `finish()` 已覆盖需求。

---

## 二、中断策略

### 2.1 AbortController.abort()

使用 `AbortController` 向 SDK 异步迭代器发送取消信号，确定性硬停止。

| 维度 | 说明 |
|------|------|
| 机制 | `AbortController.abort()` |
| 行为 | 确定性，毫秒级终止 |
| API | V1 `sdk.query()` 原生支持 |
| 适用 | 超时 / 卡死中断 |

### 2.2 Stall 超时保护（安全兜底）

```
createStallModule()
├── 每 30 秒 checkStall()
└── idle > SESSION_STALL_TIMEOUT → abort()
```

| 配置项 | 默认值 | 配置方式 | 说明 |
|--------|--------|---------|------|
| `SESSION_STALL_TIMEOUT` | 1200s (20min) | `setup` 交互式 / `.env` | 无活动自动中断 |
| `API_TIMEOUT_MS` | 3000000 (50min) | `.env` 声明式 | SDK 透传，单次 API HTTP 请求超时 |

---

## 三、Session 生命周期

```
Session.run(type, config, { execute })
├── Session.ensureSDK(config)
├── new Session(type, config, { logFileName, sessionNum, label })
│   ├── _initLogging()
│   ├── writeSessionSeparator()
│   ├── _initHooks(type)
│   └── _startIndicator()
├── execute(session)
│   ├── session.buildQueryOptions()
│   └── session.runQuery(prompt, queryOpts, { onMessage })
└── session.finish()
```

### 3.1 Session.run() 模板方法

所有命令（coding/scan/simplify/repair/plan/go）统一使用 `Session.run()`，自动管理 try/catch + finish() 调用。

### 3.2 多查询门控示例

对于多查询场景（plan），`execute(session)` 内可多次调用 `session.runQuery()`，通过返回值做查询间门控：

```javascript
async execute(session) {
  const planResult = await session.runQuery(planPrompt, queryOpts);
  if (!planResult.success) {
    return { success: false };
  }
  await session.runQuery(tasksPrompt, queryOpts);
}
```

---

## 四、倒计时重置机制

**核心策略**：每个活动事件都重置 `lastActivityTime`，所有活动源静默超过阈值时才判定"无响应"。

### 4.1 活动重置点

```
SDK 消息流                        Hook 生命周期
─────────                        ─────────────
assistant text    → updateActivity()    PreToolUse        → startTool()
assistant tool_use → (由 PreToolUse 处理)  PostToolUse       → endTool()
tool_result       → updateActivity()    PostToolUseFailure → endTool()
```

### 4.2 工具运行状态追踪

倒计时机制无法覆盖的场景：**单个工具执行超过阈值**。通过 `toolRunning` 标志区分：

| 状态 | toolRunning | idleMin >= 2 | 终端显示 |
|------|-------------|--------------|---------|
| 工具执行中 | true | true | 黄色"工具执行中 M:SS" |
| 真正无响应 | false | true | 红色"N分无响应" |
| 正常活跃 | any | false | 无额外提示 |

---

## 五、终端指示器（Indicator）

### 5.1 核心方法

| 方法 | 说明 |
|------|------|
| `startTool(name)` | 标记工具开始 + 重置倒计时 |
| `endTool()` | 标记工具结束 + 重置倒计时（幂等） |
| `updateActivity()` | 仅重置倒计时 |
| `pauseRendering()` / `resumeRendering()` | 暂停/恢复 stderr 定时刷新 |

### 5.2 防刷屏

1. `_render()` 定时器：每秒执行，`\r\x1b[K` 覆盖同一行
2. `contentKey` 去重（`session.js` 的 `_logMessage`）：`phase|step|toolTarget` 不变时不输出新状态行
3. `pauseRendering`：文本输出期间暂停定时器，避免 stdout/stderr 交叉
4. `getStatusLine()` 动态内容：工具耗时由 `_render()` 覆盖，不产生新行

---

## 六、涉及文件

| 文件 | 职责 |
|------|------|
| `src/core/session.js` | `Session` 类：`ensureSDK()`、`run()`、`buildQueryOptions()`、`runQuery()`（结构化结果）、`finish()` |
| `src/core/hooks.js` | `createStopHook()`（per-turn 日志）、`createStallModule()`、`createEndToolHook()` |
| `src/common/indicator.js` | Indicator 类、`inferPhaseStep()`、工具分类 |
| `src/common/logging.js` | `extractResult()`、`logMessage()`、`writeSessionSeparator()` |
| `src/common/utils.js` | `localTimestamp()` 日志时间格式 |
