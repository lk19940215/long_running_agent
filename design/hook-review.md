# Hook 机制复审报告

> 复审对象：`src/core/hooks.js`
> SDK：`@anthropic-ai/claude-agent-sdk` (>=0.2.71)
> 复审日期：2026-03-11（第二轮深度审查更新）
> 状态：**已修复** — 所有已知 Bug 已修复并通过测试验证（30/30 测试通过）

---

## 一、当前实现概览

### 1.1 架构设计

```
SessionContext.initHooks(type)
        │
        ▼
  createHooks(type, indicator, logStream, options)
        │
        ├─ createStallModule()        → 超时/停顿检测 + 完成超时
        ├─ createEditGuardModule()    → 编辑次数防护
        ├─ createCompletionModule()   → session_result 写入检测
        ├─ createGuidanceModule()     → JSON 配置驱动的提示注入
        └─ createLoggingHook()        → 工具调用日志记录
        │
        ▼
  hooks = {
    PreToolUse:  [{ matcher: '*', hooks: [logging, editGuard, guidance] }]
    PostToolUse: [{ matcher: '*', hooks: [completion] }]
  }
        │
        ▼
  sdk.query({ prompt, options: { hooks, ... } })
```

### 1.2 功能矩阵

| 模块 | Hook 事件 | 功能 | Session 类型 |
|------|-----------|------|-------------|
| `guidance` | PreToolUse | 按规则注入提示文本 | coding |
| `editGuard` | PreToolUse | 同一文件编辑超阈值则 deny | coding |
| `completion` | PostToolUse | 检测 session_result 写入 | coding |
| `stall` | 定时器 (非 hook) | 无活动/完成超时中断 | all |
| `logging` | PreToolUse | 记录工具调用到日志 | all |

### 1.3 GuidanceInjector 配置格式 (`guidance.json`)

```json
{
  "rules": [
    {
      "name": "playwright",
      "matcher": "^mcp__playwright__",
      "file": { "path": "assets/playwright.md", "injectOnce": true },
      "toolTips": {
        "injectOnce": false,
        "extractor": "browser_(\\w+)",
        "items": { "snapshot": "...", "click": "..." }
      }
    }
  ]
}
```

---

## 二、与官方 SDK 文档的对照

### 2.1 官方 Hooks API 结构 (TypeScript SDK)

```typescript
options: {
  hooks: {
    PreToolUse: [
      {
        matcher: "Write|Edit",       // 正则匹配工具名
        hooks: [callbackFn]          // 回调数组
      }
    ]
  }
}

// 回调签名
type HookCallback = (
  input: HookInput,
  toolUseID: string | undefined,
  context: { signal: AbortSignal }
) => Promise<HookOutput>;

// PreToolUse 输出
interface HookOutput {
  // 顶层字段 (所有事件通用)
  systemMessage?: string;     // 注入到对话中，模型可见
  continue?: boolean;         // false 则终止整个 session
  stopReason?: string;        // continue=false 时的提示

  // 事件特定字段
  hookSpecificOutput?: {
    hookEventName: 'PreToolUse';
    permissionDecision?: 'allow' | 'deny' | 'ask';
    permissionDecisionReason?: string;
    updatedInput?: Record<string, unknown>;
    additionalContext?: string;    // v2.1.9+ 新增
  };
}
```

### 2.2 `additionalContext` 在 PreToolUse 中的支持时间线

| 时间 | 事件 |
|------|------|
| 2025-09 | GitHub Issue #6965: 首次 Feature Request |
| 2025-12-25 | Issue #15345: 正式提案 |
| 2025-12-29 | Issue #15664: 详细描述用例 |
| **2026-01-16** | **Claude Code v2.1.9 实现** |
| 2026-01-20 | Issue #19432: 发现注入 bug（收到但未生效） |

**结论**：`PreToolUse` 的 `additionalContext` 在 v2.1.9 后正式可用，但曾有 bug 报告。

### 2.3 SDK 支持的全部 Hook 事件

| 事件 | 可用 | 当前使用 | 潜在价值 |
|------|:----:|:--------:|:--------:|
| `PreToolUse` | ✅ | ✅ | — |
| `PostToolUse` | ✅ | ✅ | — |
| `PostToolUseFailure` | ✅ | ❌ | 🔸 错误重试引导 |
| `UserPromptSubmit` | ✅ | ❌ | 🔶 session 级别引导注入 |
| `Stop` | ✅ | ❌ | 🔶 完成度校验 |
| `SubagentStart` | ✅ | ❌ | 🔸 子代理追踪 |
| `SubagentStop` | ✅ | ❌ | 🔸 子代理结果聚合 |
| `SessionStart` | TS only | ❌ | 🔶 初始化上下文 |
| `SessionEnd` | TS only | ❌ | 🔸 清理/统计 |
| `PreCompact` | ✅ | ❌ | 🔸 压缩前保存关键上下文 |
| `Notification` | ✅ | ❌ | 🔸 外部通知 |
| `PermissionRequest` | ✅ | ❌ | ⬜ bypassPermissions 下不触发 |

---

## 三、问题分析

### 3.1 ~~🔴 严重：`additionalContext` 返回层级错误~~ ✅ 已修复

**问题**：`GuidanceInjector.createHook` 将 `additionalContext` 放在顶层而非 `hookSpecificOutput` 内部。

**验证方式**：通过 SDK 类型定义 `sdk.d.ts` 确认——`SyncHookJSONOutput` 的顶层字段只有 `continue`、`suppressOutput`、`stopReason`、`decision`、`systemMessage`、`reason`、`hookSpecificOutput`。`additionalContext` 必须在 `hookSpecificOutput` 内部（`PreToolUseHookSpecificOutput` 类型）。

**修复内容**：

```javascript
// 修复前
return { additionalContext: allParts.join('\n\n') };

// 修复后
return {
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    additionalContext: allParts.join('\n\n'),
  }
};
```

**测试验证**：`test/test-hook-format.js` — 16/16 通过

### 3.2 ~~🟡 中等：回调函数签名不完整~~ ✅ 已修复

**修复内容**：所有 4 个回调函数（guidance、editGuard、completion、logging）签名已补全为 `(input, _toolUseID, _context)`。

### 3.3 🟡 中等：stall 检测未使用 Hook 机制

`createStallModule` 使用 `setInterval` 定时轮询而非 SDK Hook。这意味着：

- 需要手动管理 `clearInterval` 清理
- 不能利用 SDK 的 `Stop` hook 做精确的完成检测
- 完成检测依赖 PostToolUse 中手动判断 `session_result.json` 写入，而非使用 SDK 原生能力

### 3.4 ~~🟢 轻微：GuidanceInjector 单例 + 延迟加载的隐患~~ ✅ 已修复

**修复内容**：新增 `GuidanceInjector.reset()` 方法，在 `createGuidanceModule()` 中每次创建模块时调用，清除 `injectedRules` 和 `cache`，确保每个 session 有干净的状态。

### 3.6 ~~🔴 严重：`reset()` 遗漏 `loaded` 标志~~ ✅ 已修复（第二轮发现）

**问题**：第一轮修复中新增的 `reset()` 方法只清理了 `injectedRules` 和 `cache`，但**遗漏了 `this.loaded = false`**。

**影响**：`load()` 方法在首次调用后设置 `loaded = true` 并永不再执行。`reset()` 不重置该标志意味着：
- 如果用户在 session 间修改了 `guidance.json`，变更永远不会被重新加载
- 如果 harness 在运行中更新了引导配置，后续 session 仍使用旧规则

**修复**：`reset()` 中增加 `this.loaded = false`。

### 3.7 ~~🟡 中等：`isSessionResultWrite` 不处理 `Shell` 工具名~~ ✅ 已修复（第二轮发现）

**问题**：函数只检查 `toolName === 'Bash'`，但 `indicator.js` 正确处理了 `'bash'` 和 `'shell'` 两种工具名。如果 SDK 使用 `Shell` 作为工具名，完成检测会失效，导致使用完整的 stall timeout（20 分钟）而非更短的 completion timeout（5 分钟）。

**修复**：条件改为 `toolName === 'Bash' || toolName === 'Shell'`。

### 3.8 🟢 轻微：RegExp 每次 hook 调用重复创建（第二轮发现，已优化）

**问题**：`processRule` 中每次调用都 `new RegExp(rule.matcher)` 创建新正则对象，`matchCondition` 中同理。在高频工具调用场景下会产生不必要的 GC 压力。

**优化**：`load()` 时预编译所有正则到 `_compiledMatchers` 和 `_compiledConditions` Map 中，`processRule` 优先使用预编译版本，无预编译时 fallback 到 `new RegExp()`。同时也增加了对畸形正则的 `try/catch` 保护。

### 3.9 🟢 轻微：editGuard 计数器永不恢复（第二轮发现，已优化）

**问题**：原实现使用简单计数器，一旦某文件编辑次数超过阈值就**永久**被 deny，即使模型在中间做了大量思考和读取操作。

**优化**：改为滑动时间窗口机制（默认 60 秒），只计算窗口内的编辑次数。超过阈值被 deny 后，模型可以通过"冷静"一段时间后恢复对该文件的编辑权。

### 3.5 🟢 轻微：未利用 `systemMessage` 顶层字段

SDK 提供了 `systemMessage` 作为顶层输出字段，可以在任何 hook 事件中向对话注入系统消息。当前的 guidance 注入只用了 `additionalContext`（事件级别的上下文追加），没有利用 `systemMessage`（对话级别的系统消息注入）。两者有不同的适用场景：

| 字段 | 作用域 | 适用场景 |
|------|--------|---------|
| `additionalContext` | 附加到当前工具调用 | 工具使用指南、API 文档片段 |
| `systemMessage` | 注入到对话流 | 全局规则提醒、角色约束 |

---

## 四、优势总结

### 4.1 架构层面

1. **模块化工厂模式**：每个 hook 功能独立为 module factory（`createGuidanceModule`、`createEditGuardModule`），职责清晰，便于开关和组合
2. **类型驱动的功能选择**：`FEATURE_MAP` 根据 session 类型自动选择启用的功能组合，避免了 coding/plan/scan 等不同场景的 hook 冲突
3. **配置驱动的引导系统**：`GuidanceInjector` 使用 JSON 配置文件驱动，用户无需修改代码即可添加/修改引导规则
4. **向后兼容**：保留了 `createSessionHooks` 作为兼容入口

### 4.2 GuidanceInjector 设计

1. **多级匹配**：`matcher`（正则匹配工具名）→ `condition`（字段值条件匹配）→ `toolTips`（子工具提取）
2. **注入控制**：`injectOnce` 避免重复注入同一引导内容，减少 token 浪费
3. **文件缓存**：引导文件内容只读取一次后缓存
4. **灵活的条件系统**：支持 `field + pattern` 单条件和 `any: [...]` OR 组合

### 4.3 防护机制

1. **editGuard**：检测同一文件编辑过多次（可能陷入死循环），自动 deny 并给出修复建议
2. **stall 检测 + completion 超时**：两级超时保护，防止 session 无限运行
3. **AbortController 集成**：超时后通过 abort 信号中断 SDK 调用

---

## 五、优化建议

### 5.1 ~~🔴 P0：修复 `additionalContext` 返回格式~~ ✅ 已完成

已修复并通过 `test/test-hook-format.js` 验证。

### 5.2 🟡 P1：利用 `UserPromptSubmit` 注入 session 级引导

当前所有引导都通过 `PreToolUse` 注入，这意味着引导内容在每次工具调用时才有机会触发。可以增加 `UserPromptSubmit` hook 在 prompt 提交时注入 session 级别的引导（如项目规范、角色定义），减少对 PreToolUse 的依赖。

```javascript
hooks.UserPromptSubmit = [{
  hooks: [async (input) => {
    return { additionalContext: sessionLevelGuidance };
  }]
}];
```

### 5.3 🟡 P1：利用 `Stop` hook 替代 stall 定时器

用 `Stop` hook 做完成度校验，替代或补充当前的 `setInterval` 方案：

```javascript
hooks.Stop = [{
  hooks: [async (input) => {
    if (!sessionResultWritten) {
      return {
        decision: 'block',
        reason: 'session_result.json 尚未写入，请完成任务后再停止'
      };
    }
    return {};
  }]
}];
```

### 5.4 ~~🟡 P1：跨 session 重置 `injectedRules`~~ ✅ 已完成

采用方案 A：新增 `GuidanceInjector.reset()` 方法，在 `createGuidanceModule()` 中调用。

### 5.5 ~~🟢 P2：补充回调签名~~ ✅ 已完成

所有回调函数签名已补全为 `(input, _toolUseID, _context)`。

### 5.6 🟢 P2：增加 `PostToolUseFailure` 错误引导

当工具执行失败时，注入针对性的修复建议：

```javascript
hooks.PostToolUseFailure = [{
  matcher: 'Bash',
  hooks: [async (input) => {
    return {
      hookSpecificOutput: {
        hookEventName: 'PostToolUseFailure',
        additionalContext: '命令执行失败，请检查：1) 命令语法 2) 依赖是否安装 3) 权限是否足够'
      }
    };
  }]
}];
```

### 5.7 🟢 P2：区分 `additionalContext` 与 `systemMessage` 的使用

| 引导类型 | 推荐字段 | 原因 |
|---------|---------|------|
| Playwright 使用指南 | `additionalContext` | 工具级别上下文，只在使用该工具时需要 |
| 进程管理规则 | `additionalContext` | 只在执行 bash kill 命令时需要 |
| 项目编码规范 | `systemMessage` | 全局规则，应持续可见 |
| 安全限制提醒 | `systemMessage` | 不应因上下文压缩而丢失 |

### 5.8 🟢 P3：考虑使用 `PreCompact` 保留关键引导

当 context 被压缩时，之前注入的引导内容会丢失。可以利用 `PreCompact` hook 在压缩前标记需要保留的关键引导：

```javascript
hooks.PreCompact = [{
  hooks: [async (input) => {
    return {
      systemMessage: '压缩提醒：请保留以下关键约束...'
    };
  }]
}];
```

---

## 六、总结

### 可行性判定

| 维度 | 判定 | 说明 |
|------|------|------|
| **方案可行性** | ✅ 可行 | Hook 机制是 SDK 官方支持的扩展点，使用方向正确 |
| **实现正确性** | ✅ 正确 | 所有已知格式/逻辑 Bug 已修复 |
| **设计合理性** | ✅ 良好 | 模块化、配置驱动、类型区分的设计合理 |
| **覆盖完整性** | 🔸 不足 | 只用了 Pre/PostToolUse，未利用其他 hook 事件 |
| **健壮性** | ✅ 已改进 | 单例重置、正则预编译、时间窗口衰减 |

### 修复清单

| 优先级 | 问题 | 状态 | 发现轮次 |
|--------|------|------|---------|
| **P0** | `additionalContext` 包裹到 `hookSpecificOutput` | ✅ 已修复 | 第一轮 |
| **P0** | `reset()` 遗漏 `loaded` 标志 → 配置变更不生效 | ✅ 已修复 | 第二轮 |
| **P1** | 跨 session 单例状态泄漏（`reset()` 方法） | ✅ 已修复 | 第一轮 |
| **P1** | `isSessionResultWrite` 不处理 `Shell` 工具名 | ✅ 已修复 | 第二轮 |
| **P2** | 回调函数签名补全为 3 参数 | ✅ 已修复 | 第一轮 |
| **P2** | RegExp 预编译缓存 + 畸形正则防护 | ✅ 已优化 | 第二轮 |
| **P2** | editGuard 改为滑动时间窗口衰减 | ✅ 已优化 | 第二轮 |
| **P2** | guidance module 嵌套结构简化 | ✅ 已优化 | 第二轮 |
| **P1** | 评估引入 `UserPromptSubmit` / `Stop` hook | 📋 待评估 | — |
| **P2** | 增加 `PostToolUseFailure` 支持 | 📋 待评估 | — |
| **P3** | `PreCompact` 保留关键引导 | 📋 待评估 | — |

### 验证记录

- 测试脚本：`test/test-hook-format.js` — **30/30 passed**（含第二轮新增的 14 个测试用例）
- 回归测试：`test/flow.test.js` — **15/15 passed**
