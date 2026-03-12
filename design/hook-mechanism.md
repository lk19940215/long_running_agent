# Hook 注入机制

> 实现文件：`src/core/hooks.js`  
> SDK：`@anthropic-ai/claude-agent-sdk` (>=0.2.71)

---

## 一、总览

本项目通过 SDK 的 Hook 回调机制实现三类核心能力：**提示语注入**、**安全防护**、**活跃度监控**。

```
SessionContext.initHooks(type)
        │
        ▼
  createHooks(type, indicator, logStream, options)
        │
        ├─ createGuidanceModule()     → JSON 配置驱动的提示注入
        ├─ createEditGuardModule()    → 编辑频率防护（滑动窗口）
        ├─ createCompletionModule()   → session_result 写入检测
        ├─ createStallModule()        → 无活动 / 完成超时中断
        ├─ createLoggingHook()        → 工具调用日志 + 状态指示器
        └─ createFailureHook()        → 工具失败后倒计时重置
        │
        ▼
  hooks = {
    PreToolUse:          [logging, editGuard, guidance, interaction]
    PostToolUse:         [completion]
    PostToolUseFailure:  [failureHook]
  }
        │
        ▼
  sdk.query({ prompt, options: { hooks, ... } })
```

### 功能矩阵

| 模块 | Hook 事件 | 功能 | Session 类型 |
|------|-----------|------|-------------|
| `guidance` | PreToolUse | 按 JSON 规则注入提示文本 | coding |
| `editGuard` | PreToolUse | 同文件编辑超阈值则 deny | coding |
| `completion` | PostToolUse | 检测 session_result 写入 + endTool | coding |
| `stall` | setInterval (非 hook) | 无活动 / 完成超时中断 | all |
| `logging` | PreToolUse | 记录工具调用 + inferPhaseStep | all |
| `failure` | PostToolUseFailure | endTool 防 toolRunning 卡住 | all |
| `interaction` | PreToolUse | 人机交互 (askUserQuestion) | plan_interactive, simplify |

### Session 类型与功能映射

```javascript
FEATURE_MAP = {
  coding:           [guidance, editGuard, completion, stall]
  plan:             [stall]
  plan_interactive: [stall, interaction]
  scan:             [stall]
  simplify:         [stall, interaction]
}
```

---

## 二、SDK 官方 Hook 调研

### 2.1 Hooks API 结构

```typescript
// 注册方式
options: {
  hooks: {
    PreToolUse: [
      { matcher: "Write|Edit", hooks: [callbackFn] }
    ]
  }
}

// 回调签名
type HookCallback = (
  input: HookInput,       // tool_name, tool_input, session_id, cwd, hook_event_name
  toolUseID: string | undefined,
  context: { signal: AbortSignal }
) => Promise<HookOutput>;

// 输出结构（两层）
interface HookOutput {
  // 顶层 — 控制对话流（所有事件通用）
  systemMessage?: string;     // 注入到对话，模型可见，持久性强
  continue?: boolean;         // false 则终止 session
  stopReason?: string;

  // hookSpecificOutput — 控制当前操作（事件特定）
  hookSpecificOutput?: {
    hookEventName: 'PreToolUse';
    permissionDecision?: 'allow' | 'deny' | 'ask';
    permissionDecisionReason?: string;
    updatedInput?: Record<string, unknown>;
    additionalContext?: string;    // v2.1.9+ 新增
  };
}
```

### 2.2 `additionalContext` 支持时间线

| 时间 | 事件 |
|------|------|
| 2025-09 | GitHub Issue #6965: 首次 Feature Request |
| 2025-12-25 | Issue #15345: 正式提案 |
| 2025-12-29 | Issue #15664: 详细描述用例 |
| **2026-01-16** | **Claude Code v2.1.9 正式实现** |
| 2026-01-20 | Issue #19432: 发现注入 bug（收到但未生效） |

### 2.3 `additionalContext` vs `systemMessage`

| 维度 | `additionalContext` | `systemMessage` |
|------|-------------------|-----------------|
| 位置 | `hookSpecificOutput` 内 | 顶层字段 |
| 作用域 | 附加到当前工具调用上下文 | 注入到对话流 |
| 持久性 | 随工具调用结束而消失 | 持续存在直到 context 压缩 |
| 适用场景 | 工具使用指南、操作提示 | 全局规则、角色约束 |
| 本项目 | GuidanceInjector 使用 | 未使用（可扩展） |

### 2.4 SDK 全部 Hook 事件

| 事件 | Python | TypeScript | 当前使用 | 潜在价值 |
|------|:------:|:----------:|:--------:|---------|
| `PreToolUse` | ✅ | ✅ | ✅ | — |
| `PostToolUse` | ✅ | ✅ | ✅ | — |
| `PostToolUseFailure` | ✅ | ✅ | ✅ | 已用于 endTool，可扩展错误引导 |
| `UserPromptSubmit` | ✅ | ✅ | ❌ | session 级引导注入 |
| `Stop` | ✅ | ✅ | ❌ | 完成度校验 |
| `SubagentStart` | ✅ | ✅ | ❌ | 子代理追踪 |
| `SubagentStop` | ✅ | ✅ | ❌ | 子代理结果聚合 |
| `PreCompact` | ✅ | ✅ | ❌ | 压缩前保留关键上下文 |
| `Notification` | ✅ | ✅ | ❌ | 外部通知 |
| `PermissionRequest` | ✅ | ✅ | ❌ | bypassPermissions 下不触发 |
| `SessionStart` | ❌ | ✅ | ❌ | 初始化上下文 |
| `SessionEnd` | ❌ | ✅ | ❌ | 清理/统计 |
| `Setup` | ❌ | ✅ | ❌ | 初始化任务 |
| `TeammateIdle` | ❌ | ✅ | ❌ | 重新分配任务 |
| `TaskCompleted` | ❌ | ✅ | ❌ | 并行任务聚合 |
| `ConfigChange` | ❌ | ✅ | ❌ | 动态重载配置 |

---

## 三、GuidanceInjector 实现讲解

### 3.1 核心思想

**配置驱动、按需注入、零代码修改即可扩展引导规则。**

通过 `guidance.json` 定义匹配规则，在 PreToolUse 阶段将提示文本通过 `additionalContext` 注入到模型上下文。

### 3.2 三级匹配流水线

```
工具调用 → matcher（正则匹配工具名）
              │ 不匹配 → 跳过
              ▼
         condition（字段值条件匹配）
              │ 不匹配 → 跳过
              ▼
         file + toolTips（内容提取）
              │
              ▼
         additionalContext 注入 → 模型接收
```

**第一级 matcher**：正则匹配 `input.tool_name`

```json
{ "matcher": "^mcp__playwright__" }
```

**第二级 condition**：按点分路径从 `input` 取值，正则匹配。支持 `{ any: [...] }` OR 组合。可省略。

```json
{
  "condition": {
    "field": "tool_input.command",
    "pattern": "\\b(kill|pkill|killall)\\b"
  }
}
```

**第三级 file + toolTips**：两种内容来源可同时生效

```json
{
  "file": { "path": "assets/playwright.md", "injectOnce": true },
  "toolTips": {
    "extractor": "browser_(\\w+)",
    "items": { "snapshot": "提示...", "click": "提示..." }
  }
}
```

### 3.3 配置格式完整参考

```json
{
  "rules": [
    {
      "name": "规则唯一标识",
      "matcher": "正则 — 匹配工具名",
      "condition": {
        "field": "input 对象的点分路径",
        "pattern": "正则 — 匹配字段值"
      },
      "file": {
        "path": "相对于 .claude-coder/ 的文件路径",
        "injectOnce": true
      },
      "toolTips": {
        "injectOnce": true,
        "extractor": "正则 — 从工具名提取 key，捕获组1",
        "items": { "key1": "提示", "key2": "提示" }
      }
    }
  ]
}
```

### 3.4 内置配置

当前 `templates/guidance.json` 包含两条规则：

- **Playwright 引导**：匹配 `mcp__playwright__*`，首次注入 `playwright.md` 全文，后续按子工具注入操作提示
- **Bash 进程管理**：仅当 Bash 命令含 `kill/pkill/killall` 时，注入 `bash-process.md`

---

## 四、实现细节

### 4.1 `injectOnce` — 避免重复注入

```
首次 mcp__playwright__browser_snapshot → 注入 playwright.md + snapshot tip  ✓
再次 mcp__playwright__browser_snapshot → 全部跳过                           ✗
首次 mcp__playwright__browser_click    → 跳过 playwright.md + 注入 click tip ✓
```

通过 `injectedRules` Set 追踪已注入的 key。

### 4.2 正则预编译

`load()` 时一次性编译所有 `matcher` 和 `condition.pattern` 到 Map。畸形正则用 `try/catch` 保护。

### 4.3 文件内容缓存

首次读取的文件存入 `this.cache`，同规则后续调用直接使用。`reset()` 时清理。

### 4.4 Session 隔离

`GuidanceInjector` 是模块级单例。`createGuidanceModule()` 每次创建 session 时调用 `reset()`：清理 `injectedRules` + `cache` + `loaded` 标志，确保跨 session 不泄漏，且 `guidance.json` 变更被重新加载。

### 4.5 editGuard — 滑动时间窗口

原设计使用简单计数器（永久 deny）。优化为滑动窗口（默认 60s），窗口内编辑超阈值才 deny。模型"冷静"后可恢复编辑权。

### 4.6 Hook 工厂组装

`createHooks()` 按 session 类型从 `FEATURE_MAP` 选取功能模块，组装为：

```
PreToolUse:          [loggingHook, editGuardHook?, guidanceHook?, interactionHook?]
PostToolUse:         [completionHook 或 fallback endTool]
PostToolUseFailure:  [failureHook (endTool)]
```

所有 hook 使用 `matcher: '*'`，细粒度过滤在回调内部完成。

### 4.7 Hook 交互规则

- **权限优先级**：`deny > ask > allow`。editGuard deny 后，guidance 返回的 `additionalContext` 被 SDK 忽略
- **`additionalContext` 合并**：多个 hook 返回时，SDK 取最后一个非空值。guidance hook 放在链末尾
- **配置文件查找**：先查 `.claude-coder/assets/`（用户自定义），再查 `templates/`（内置默认）

---

## 五、可行性与副作用评估

### 5.1 可行性判定

| 维度 | 判定 | 说明 |
|------|------|------|
| **方案可行性** | ✅ 可行 | Hook 是 SDK 官方支持的扩展点 |
| **实现正确性** | ✅ 正确 | 已修复所有已知 Bug（见下方清单） |
| **设计合理性** | ✅ 良好 | 模块化、配置驱动、类型区分 |
| **覆盖完整性** | 🔸 待扩展 | 已用 Pre/Post/Failure，其他事件可渐进引入 |

### 5.2 副作用

| 维度 | 影响 | 评估 |
|------|------|------|
| Hook 执行延迟 | <1ms / 调用 | 正则预编译 + 文件缓存 |
| Token 消耗 | 注入内容占上下文窗口 | `injectOnce` 缓解 |
| 终端输出 | `additionalContext` 不显示在终端 | 无影响 |
| 工具权限 | guidance hook 不设 `permissionDecision` | 无副作用 |
| 模型行为 | 注入提示改变决策 | 预期行为 |

### 5.3 已知风险

| 风险 | 严重度 | 说明 |
|------|--------|------|
| SDK Issue #19432 | 中 | `additionalContext` 偶发未生效，SDK 侧 bug |
| `injectOnce` 跨 compact 失效 | 低 | context 压缩后注入内容丢失 |

---

## 六、扩展方向

### 6.1 `UserPromptSubmit` — Session 级引导

在 prompt 提交时注入 session 级引导，替代 PreToolUse 中的重复注入。

### 6.2 `Stop` — 完成度校验

Agent 停止前校验 `session_result.json` 是否已写入，替代部分 stall 定时器逻辑。

### 6.3 `PreCompact` — 压缩前保留关键引导

context 压缩时用 `systemMessage` 重新注入关键约束。

### 6.4 `PostToolUseFailure` — 错误引导

当前仅用于 `endTool()`，可扩展为注入修复建议。

---

## 七、验证记录

- `test/test-hook-format.js` — 30/30 passed
- `test/flow.test.js` — 15/15 passed
