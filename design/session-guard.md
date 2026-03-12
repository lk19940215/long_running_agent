# Session 守护机制

本文档描述 Claude Coder 的会话中断与活跃度检测机制，包含 stall 检测、completion 超时、倒计时重置、终端指示器四个部分。

---

## 一、中断策略

### 1.1 AbortController.abort()

使用 `AbortController` 向 SDK 异步迭代器发送取消信号，确定性硬停止。

| 维度 | 说明 |
|------|------|
| 机制 | `AbortController.abort()` |
| 行为 | 确定性，毫秒级终止 |
| API | V1 `sdk.query()` 原生支持 |
| 适用 | 超时 / 卡死中断 |

不使用 V2 `session.send()` 的原因：非确定性（依赖模型配合），V2 接口不稳定，且可能触发额外输出。

### 1.2 两级超时保护

```
createStallModule()
├── 每 30 秒 checkStall()
├── 正常模式：idle > SESSION_STALL_TIMEOUT → abort()
└── 完成模式：session_result 写入后 > SESSION_COMPLETION_TIMEOUT → abort()
```

| 配置项 | 默认值 | 配置方式 | 说明 |
|--------|--------|---------|------|
| `SESSION_STALL_TIMEOUT` | 1200s (20min) | `setup` 交互式 / `.env` | 无活动自动中断 |
| `SESSION_COMPLETION_TIMEOUT` | 300s (5min) | `setup` 交互式 / `.env` | session_result 写入后缩短超时 |
| `API_TIMEOUT_MS` | 3000000 (50min) | `.env` 声明式 | SDK 透传，单次 API HTTP 请求超时 |

---

## 二、倒计时重置机制

**核心策略**：每个活动事件都重置 `lastActivityTime`，所有活动源静默超过阈值时才判定"无响应"。

### 2.1 活动重置点

```
SDK 消息流                        Hook 生命周期
─────────                        ─────────────
assistant text    → updateActivity()    PreToolUse        → startTool()
assistant tool_use → (由 PreToolUse 处理)  PostToolUse       → endTool()
tool_result       → updateActivity()    PostToolUseFailure → endTool()
```

### 2.2 工具运行状态追踪

倒计时机制无法覆盖的场景：**单个工具执行超过阈值**（`browser_wait_for` 90s、`curl` 长超时、`Sleep`）。通过 `toolRunning` 标志区分：

| 状态 | toolRunning | idleMin >= 2 | 终端显示 |
|------|-------------|--------------|---------|
| 工具执行中 | true | true | 黄色"工具执行中 M:SS" |
| 真正无响应 | false | true | 红色"N分无响应" |
| 正常活跃 | any | false | 无额外提示 |

---

## 三、终端指示器（Indicator）

### 3.1 核心字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `lastActivityTime` | number | 最后活动时间戳（倒计时基准） |
| `toolRunning` | boolean | 工具是否正在执行 |
| `toolStartTime` | number | 当前工具开始时间 |
| `_paused` | boolean | 渲染暂停标志 |

### 3.2 核心方法

| 方法 | 说明 |
|------|------|
| `startTool(name)` | 标记工具开始 + 重置倒计时 |
| `endTool()` | 标记工具结束 + 重置倒计时（幂等） |
| `updateActivity()` | 仅重置倒计时 |
| `pauseRendering()` / `resumeRendering()` | 暂停/恢复 stderr 定时刷新 |

### 3.3 `inferPhaseStep()` 工具分类

| 工具 | 阶段 | 步骤标签 |
|------|------|---------|
| Write/Edit/MultiEdit | coding | 编辑文件 |
| Bash (git) | — | Git 操作 |
| Bash (sleep/curl) | — | 等待就绪 / 网络请求 |
| Bash (test/pytest) | coding | 测试验证 |
| Read/Glob/Grep/LS | thinking | 读取文件 |
| Task | thinking | 子 Agent 搜索 |
| WebSearch/WebFetch | thinking | 查阅文档 |
| mcp__* | coding | 浏览器: action |

---

## 四、防刷屏机制

1. **`_render()` 定时器**：每秒执行，`\r\x1b[K` 覆盖同一行
2. **`contentKey` 去重**（`context.js`）：`phase|step|toolTarget` 不变时不输出新状态行
3. **`pauseRendering`**：文本输出期间暂停定时器，避免 stdout/stderr 交叉
4. **`getStatusLine()` 动态内容**：工具耗时由 `_render()` 覆盖，不产生新行

---

## 五、涉及文件

| 文件 | 职责 |
|------|------|
| `src/common/indicator.js` | Indicator 类、`inferPhaseStep()`、工具分类 |
| `src/core/hooks.js` | `createStallModule()`、`createCompletionModule()`、`createFailureHook()` |
| `src/common/logging.js` | `tool_result` 消息 `updateActivity()` |
| `src/core/context.js` | `pauseRendering` / `resumeRendering` 防乱码 |
| `src/common/utils.js` | `localTimestamp()` 日志时间格式 |

---

## 六、日志时间格式

所有日志时间戳统一为本地 `HH:MM:SS` 格式（`localTimestamp()` in `utils.js`）。
