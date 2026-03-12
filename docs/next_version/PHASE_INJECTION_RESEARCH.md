# 分阶段提示语注入 — 技术调研与方向探讨（2026年3月更新）

> 状态：调研完成，方案验证可行
> 日期：2026-03-08
> 背景：当前所有 10 个 Hint 在 session 开始前一次性注入 user prompt。本文基于最新代码库调研，确认利用 Hook 的 `additionalContext` 能力实现分阶段按需注入的可行性，并验证 SDK 对高级内容的支持。

---

## 1. 当前架构验证

### 提示语注入机制
通过分析 `src/prompts.js` 和 `prompts/coding_user.md`，确认当前实现：
- **10个Hint全部在buildCodingPrompt()中构建**，通过模板变量注入到coding_user.md
- **一次性注入到user prompt**，包含MCP可用性、重试上下文、环境状态、测试记录、文档指引、任务上下文、会话记忆、服务管理等信息
- **系统prompt (CLAUDE.md)** 保持不变，包含核心协议和工作流程

### 问题确认
| 问题 | 验证结果 |
|------|----------|
| **Token 浪费** | 确认存在，10个Hint约占用200-300 tokens，但大部分仅在特定阶段有用 |
| **注意力稀释** | 确认存在，长prompt导致模型在需要具体指导时可能已"忘记"早期指令 |
| **时机错位** | 确认存在，如工具使用指导(Hint 10)在Agent还未开始工具调用时就注入 |
| **无法动态纠正** | 确认存在，当前Hook仅用于监控和死循环拦截 |

---

## 2. SDK能力深度验证

### additionalContext 支持确认
通过分析 `docs/CLAUDE_AGENT_SDK_GUIDE.md` 和现有代码：
- **版本要求**: Claude Agent SDK v2.1.9+ 完全支持 `additionalContext`
- **Hook事件支持**:
  - `PreToolUse`: ✅ 支持 `additionalContext` (v2.1.9+)
  - `PostToolUse`: ✅ 支持 `additionalContext`
  - `UserPromptSubmit`: ✅ 支持 `additionalContext`
- **注入机制**: 作为工具调用的附加上下文出现，紧邻工具结果，处于模型注意力高峰区域

### Plan功能调研结果
- **Plan功能**: SDK本身**不提供原生的plan功能**，但支持通过以下方式实现规划能力：
  - **Agent定义**: 可配置专门的planning agent (`agents`选项)
  - **多轮对话**: 通过AsyncIterable实现复杂对话流
  - **子Agent**: 使用`Task`工具启动专门的planning子Agent

### 非Claude模型兼容性
- **GLM/DeepSeek/阿里云**: 通过Anthropic兼容API支持
- **additionalContext效果**: 需要实际测试验证，理论上所有兼容模型都应支持
- **风险**: 非Claude模型对prompt遵循率可能较低，但`deny`拦截是确定性的

---

## 3. 优化方案细化

### 核心原则升级
**确定性拦截（Hook deny） > 即时注入（additionalContext） > 初始 prompt 指导（Hint） > 系统 prompt 规则（CLAUDE.md）**

### Hint拆分策略优化

| # | Hint | 当前位置 | 建议注入时机 | 注入方式 | 优先级 |
|---|------|----------|-------------|----------|--------|
| 1 | `reqSyncHint` | user prompt | **保留在 user prompt** | 需求变更需要在 Step 1 就知道 | P0 |
| 7 | `taskHint` | user prompt | **保留在 user prompt** | 任务上下文是 Agent 开始工作的前提 | P0 |
| 8 | `memoryHint` | user prompt | **保留在 user prompt** | 上次会话记忆需要一开始就有 | P0 |
| 5 | `envHint` | user prompt | **保留在 user prompt** | Step 2 环境检查需要一开始就知道 | P0 |
| 6 | `retryContext` | user prompt | **保留在 user prompt** | 重试上下文需要一开始就有 | P0 |
| 4 | `docsHint` | user prompt | PreToolUse (Read: 首次读文件) | additionalContext | P1 |
| 10 | `toolGuidance` | user prompt | PreToolUse (首次工具调用) | additionalContext | P1 |
| 2 | `mcpHint` | user prompt | PreToolUse (Bash: curl/test) | additionalContext | P2 |
| 3 | `testHint` | user prompt | PreToolUse (Bash: curl/test) | additionalContext | P2 |
| 9 | `serviceHint` | user prompt | PreToolUse (Bash: git) | additionalContext | P2 |

**结论**: 10个Hint中，5个适合保留在初始prompt（P0），5个适合延迟注入到Hook（P1-P2）。

### 实现路径优化

#### P0 — 立即可做（零风险，高收益）
**Bash命令拦截纠正** - 已在`src/hooks.js`中有基础框架
- 拦截`grep`/`find`/`cat`/`ls`/`head`/`tail`等低效命令
- 引导使用专用工具（Grep/Glob/Read/LS）
- **优势**: 确定性拦截，不依赖模型prompt遵循率

#### P1 — 短期验证（需要additionalContext测试）
**工具使用指导延迟注入**
- 将Hint 10 (toolGuidance) 移到PreToolUse hook
- 首次工具调用时注入工具使用规范
- **验证重点**: non-Claude模型对additionalContext的响应效果

#### P2 — 中期实施
**场景化提示语注入**
- 测试阶段注入Hint 2/3 (MCP/Test规则)
- 收尾阶段注入Hint 9 (服务管理)
- 文档阅读阶段注入Hint 4 (文档指引)

#### P3 — 高级场景（需要Plan支持）
**动态规划能力集成**
- 使用`Task`工具启动planning子Agent
- 实现"编码后注入代码审查提示"等PostToolUse场景
- 结合Agent定义实现专门的planning/review agents

---

## 4. 技术实现细节

### Hook增强实现草案

```javascript
// src/hooks.js - 增强版PreToolUse hook
const injected = new Set(); // 跟踪已注入的Hint

async function enhancedPreToolUseHook(input, toolUseID, context) {
  const { tool_name, tool_input } = input;
  let additionalContext = '';
  
  // --- P1: 工具使用规范 (首次工具调用) ---
  if (!injected.has('toolGuide')) {
    additionalContext += '\n' + getToolGuidance(); // Hint 10
    injected.add('toolGuide');
  }
  
  // --- P2: 文档指引 (首次读文件) ---
  if (['Read', 'Glob', 'Grep', 'LS'].includes(tool_name) && !injected.has('docs')) {
    additionalContext += '\n' + getDocsHint(); // Hint 4
    injected.add('docs');
  }
  
  // --- P2: 测试规则 (curl/test命令) ---
  if (tool_name === 'Bash') {
    const cmd = tool_input?.command || '';
    if ((cmd.includes('curl') || cmd.includes('test') || cmd.includes('pytest'))
        && !injected.has('test')) {
      additionalContext += '\n' + getTestHint();   // Hint 3
      additionalContext += '\n' + getMcpHint();    // Hint 2
      injected.add('test');
    }
    
    // --- P2: 收尾提示 (git命令) ---
    if (cmd.includes('git ') && !injected.has('service')) {
      additionalContext += '\n' + getServiceHint(); // Hint 9
      injected.add('service');
    }
  }
  
  // --- P0: Bash命令拦截 (确定性纠正) ---
  if (tool_name === 'Bash') {
    const cmd = tool_input?.command || '';
    const interceptRules = [
      { pattern: /\bgrep\b/, message: '请使用 Grep 工具替代 bash grep' },
      { pattern: /\bfind\b/, message: '请使用 Glob 工具替代 bash find' },
      { pattern: /\bcat\b(?!.*<<)/, message: '请使用 Read 工具替代 bash cat' },
      { pattern: /\bls\b/, message: '请使用 LS 工具替代 bash ls' },
      { pattern: /\bhead\b/, message: '请使用 Read 工具（支持 offset/limit）替代 bash head' },
      { pattern: /\btail\b/, message: '请使用 Read 工具（支持 offset/limit）替代 bash tail' }
    ];
    
    for (const rule of interceptRules) {
      if (rule.pattern.test(cmd)) {
        return {
          permissionDecision: 'deny',
          permissionDecisionReason: rule.message,
        };
      }
    }
  }
  
  // 返回additionalContext（如果有的话）
  if (additionalContext.trim()) {
    return { additionalContext: additionalContext.trim() };
  }
  return {};
}
```

### Plan功能集成方案

虽然SDK不提供原生plan功能，但可通过以下方式实现：

#### 方案A: 子Agent Planning
```javascript
// 使用Task工具启动planning子Agent
const planningAgent = {
  description: '任务规划专家',
  prompt: '你是一个专业的任务分解专家，请将用户需求分解为具体的执行步骤...',
  tools: ['Read', 'Glob', 'WebSearch'],
  model: 'sonnet' // 使用推理能力强的模型
};

// 在主Agent中调用
await sdk.query({
  prompt: '请规划实现这个功能的详细步骤',
  options: {
    agent: 'planner',
    agents: { planner: planningAgent }
  }
});
```

#### 方案B: 多轮对话规划
```javascript
// 使用AsyncIterable实现多轮规划对话
async function* planningConversation(requirement) {
  yield { type: 'user', content: `需求: ${requirement}` };
  yield { type: 'user', content: '请先制定详细的实现计划，再开始编码' };
}

const session = sdk.query({
  prompt: planningConversation(userRequirement),
  options: { ... }
});
```

---

## 5. 风险评估与缓解

| 风险 | 影响 | 缓解方案 |
|------|------|----------|
| additionalContext在非Claude模型上效果不佳 | P1-P2功能失效 | 1. 先实施P0（确定性拦截）<br>2. A/B测试验证效果<br>3. 提供fallback到初始prompt |
| 误拦截合法Bash命令 | 开发受阻 | 1. 精细化正则匹配<br>2. 排除heredoc/管道场景<br>3. 最多重试2次后放行 |
| 注入时机判断错误 | 提示语错位 | 1. 基于工具类型+命令内容双重判断<br>2. 添加调试日志<br>3. 逐步迁移Hint，每次验证 |
| Token节省效果不明显 | ROI低 | 1. 量化测试前后token消耗<br>2. 重点关注高频使用的Hint<br>3. 结合其他优化策略 |

---

## 6. 实施路线图（2026年Q1-Q2）

### Q1 2026 (立即-4月)
- **Week 1-2**: 实施P0 Bash命令拦截（高确定性，零风险）
- **Week 3-4**: 验证additionalContext在不同模型上的效果
- **Week 5-6**: 实施P1工具使用指导延迟注入

### Q2 2026 (5月-6月)
- **Month 5**: 实施P2场景化提示语注入（测试/收尾/文档）
- **Month 6**: 探索Plan功能集成，实现高级场景

### 成功指标
- **Token节省**: 目标减少20-30%初始prompt token
- **任务成功率**: 保持或提升现有成功率
- **模型响应质量**: 减少无关操作，提升工具使用效率

---

## 7. 结论

基于最新代码库调研，**分阶段提示语注入方案完全可行**：

1. **技术基础**: Claude Agent SDK v2.1.9+ 的 `additionalContext` 功能提供了必要的技术支撑
2. **实施路径**: 清晰的P0-P3路线图，从确定性拦截开始，逐步推进到高级场景
3. **风险可控**: P0方案零风险高收益，可立即实施；P1-P2需要验证但风险较低
4. **Plan支持**: 虽然SDK无原生plan功能，但可通过子Agent和多轮对话实现规划能力

**推荐立即行动**: 优先实施P0 Bash命令拦截，这是最短路径、最高确定性的优化，不依赖新SDK特性，且对所有模型都有效。