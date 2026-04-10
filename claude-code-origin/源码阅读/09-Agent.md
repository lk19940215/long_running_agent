# 09 - Agent 与多智能体协作

> **一句话总结**：Claude Code 的 Agent 系统是一个**可扩展的子代理框架**——通过 `AgentTool` 工具在独立上下文中运行子会话，支持内置 Agent、自定义 Agent、Fork 子代理、Swarm 多智能体协作等多种模式。

---

## 为什么重要？

Agent 是 Claude Code 实现"分治"的核心机制：
- 复杂任务拆分为多个独立子任务并行执行
- 子 Agent 有独立的上下文窗口，不污染主对话
- 支持 worktree 隔离，避免文件冲突
- Swarm 模式实现多个 Agent 之间的消息通信

---

## 全景图

```
                       主会话 (Main Session)
                              │
                    AgentTool.call()
                              │
              ┌───────────────┼───────────────┐
              │               │               │
        subagent_type     subagent_type    无 subagent_type
        = "explore"       = 自定义          (Fork 模式)
              │               │               │
        ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐
        │ 内置 Agent │  │ 自定义 Agent│  │ Fork 子代理│
        │ (只读探索)  │  │ (.claude/) │  │ (继承上下文)│
        └─────┬─────┘  └─────┬─────┘  └─────┬─────┘
              │               │               │
              └───────┬───────┘               │
                      │                       │
                ┌─────▼─────┐          ┌─────▼─────┐
                │ runAgent() │          │ Fork 路径  │
                │ 独立会话    │          │ 继承 system│
                │ 独立上下文  │          │ prompt     │
                └─────┬─────┘          └─────┬─────┘
                      │                       │
                      └───────┬───────────────┘
                              │
                       query() 循环
                    （同主会话的核心循环）
```

---

## 核心文件导航

| 文件 | 职责 | 深读价值 |
|------|------|---------|
| `tools/AgentTool/AgentTool.tsx` | Agent 工具主逻辑（dispatch、生命周期），~1398 行 | ⭐⭐⭐ 核心 |
| `tools/AgentTool/runAgent.ts` | 运行 Agent 会话（上下文组装、query 循环），~974 行 | ⭐⭐⭐ 核心 |
| `tools/AgentTool/forkSubagent.ts` | Fork 子代理定义与消息构建，~211 行 | ⭐⭐ 必读 |
| `tools/AgentTool/loadAgentsDir.ts` | Agent 定义加载（内置 + 自定义），~756 行 | ⭐⭐ 必读 |
| `tools/AgentTool/builtInAgents.ts` | 内置 Agent 注册 | ⭐⭐ 必读 |
| `tools/AgentTool/built-in/*.ts` | 各内置 Agent 实现 | ⭐ 按需 |
| `utils/forkedAgent.ts` | Fork 会话的上下文创建 | ⭐⭐ 深入时读 |
| `coordinator/coordinatorMode.ts` | Coordinator 模式 | ⭐ 按需 |
| `utils/swarm/inProcessRunner.ts` | Swarm 进程内运行 | ⭐ 按需 |

---

## 逐层详解

### 1. Agent 定义（AgentDefinition）

Agent 可以通过三种方式定义：

#### a) 内置 Agent（built-in）

```typescript
// tools/AgentTool/built-in/exploreAgent.ts
export const EXPLORE_AGENT = {
  agentType: 'explore',
  whenToUse: 'Fast, readonly agent for exploring codebases...',
  tools: [FILE_READ_TOOL_NAME, GLOB_TOOL_NAME, GREP_TOOL_NAME, ...],
  maxTurns: 30,
  model: 'fast',
  getSystemPrompt: () => '...',
} satisfies BuiltInAgentDefinition
```

常见内置 Agent：

| Agent | 用途 | 工具限制 | 模型 |
|-------|------|---------|------|
| `explore` | 代码库探索（只读） | 只有读取/搜索工具 | fast |
| `generalPurpose` | 通用任务 | 全部工具 | inherit |
| `fork` | Fork 子代理 | 继承父工具池 | inherit |

#### b) 自定义 Agent（.claude/agents/）

用户可以在 `.claude/agents/` 目录下创建 Markdown 文件定义 Agent：

```markdown
---
description: "Review code changes"
tools: ["FileRead", "Grep", "Bash"]
model: "sonnet"
maxTurns: 50
permissionMode: "plan"
mcpServers:
  - "my-mcp-server"
---

You are a code reviewer. Review the given changes...
```

`loadAgentsDir.ts` 负责加载和解析这些定义。

#### c) Plugin Agent

通过 Plugin 系统注入的 Agent 定义。

### 2. AgentTool.call() —— 入口分发

`AgentTool` 是一个普通的 `Tool`，模型通过调用这个工具来创建子 Agent：

```
AgentTool.call(input)
  │
  ├── 解析 subagent_type
  │   ├── 指定了 → 查找匹配的 AgentDefinition
  │   ├── 未指定 + Fork 启用 → FORK_AGENT
  │   └── 未指定 + Fork 未启用 → GENERAL_PURPOSE_AGENT
  │
  ├── 权限检查
  │   └── getDenyRuleForAgent() → 是否被规则拒绝
  │
  ├── MCP 需求检查
  │   └── hasRequiredMcpServers() → Agent 需要的 MCP 服务器是否已连接
  │
  ├── 隔离模式处理
  │   ├── isolation: 'worktree' → createAgentWorktree()
  │   └── isolation: 'remote'  → teleportToRemote()
  │
  ├── 后台任务注册（可选）
  │   └── registerAsyncAgent() → 后台运行，不阻塞主会话
  │
  └── runAgent() 或 Fork 路径
```

### 3. runAgent() —— 独立会话运行

`runAgent.ts` 创建一个完整的子会话环境：

```
runAgent(agentDefinition, prompt, context)
  │
  ├── 创建子代理上下文
  │   ├── 独立 AbortController
  │   ├── 独立 FileStateCache
  │   ├── 独立 readFileState
  │   └── 隔离的 setAppState（子代理写入不影响主状态）
  │
  ├── 组装系统提示词
  │   ├── Agent 自定义提示词 或 DEFAULT_AGENT_PROMPT
  │   └── enhanceSystemPromptWithEnvDetails() → 追加环境信息
  │
  ├── 组装工具池
  │   ├── 按 Agent 定义过滤工具
  │   ├── 初始化 Agent 专属 MCP 服务器
  │   └── assembleToolPool() 合并
  │
  ├── 组装初始消息
  │   ├── Fork 模式：buildForkedMessages() → 继承父对话上下文
  │   └── 普通模式：createUserMessage(prompt)
  │
  └── query() 循环
      ├── 与主会话使用完全相同的 query() 函数
      ├── 独立的 maxTurns 限制
      ├── 独立的 token 计数
      └── 产生 StreamEvent 流 → 汇报给父会话
```

### 4. Fork 子代理 —— 上下文继承

Fork 是一种特殊的 Agent 模式，子代理继承父会话的完整上下文：

```typescript
export const FORK_AGENT = {
  agentType: 'fork',
  tools: ['*'],           // 继承父工具池
  model: 'inherit',       // 继承父模型
  permissionMode: 'bubble', // 权限冒泡到父终端
  maxTurns: 200,
}
```

**Fork 消息构建**（`buildForkedMessages()`）：

```
目标：让所有 Fork 子代理共享 prompt cache

父助手消息（完整保留所有 tool_use）
  + 用户消息：
    ├── 所有 tool_use 的占位符 tool_result（固定文本 "Fork started"）
    └── 子代理指令文本（唯一不同的部分）

结果：只有最后一个 text block 不同 → 最大化 cache 命中
```

Fork 子代理收到的指令是一个严格的模板：

```
STOP. READ THIS FIRST.
You are a forked worker process. You are NOT the main agent.
RULES:
1. Do NOT spawn sub-agents (你是 fork，不要再 fork)
2. Do NOT converse (不要对话，直接执行)
3. USE your tools directly
...
Output format:
  Scope: <回显你的任务范围>
  Result: <核心发现>
  Key files: <相关文件>
```

### 5. 后台 Agent

Agent 可以在后台运行，不阻塞主对话：

```
前台 Agent（默认）:
  主会话等待 → Agent 完成 → 返回结果到主对话

后台 Agent (run_in_background: true):
  注册到 LocalAgentTask → 立即返回 → 进度通知
  → 完成时通过 <task-notification> 通知主会话
```

自动后台化：超过 120 秒的 Agent 任务自动转入后台（可配置）。

### 6. Swarm 多智能体协作

Swarm 模式允许多个 Agent 之间互相通信：

```
┌────────────┐    SendMessage     ┌────────────┐
│  Agent A   │◄──────────────────►│  Agent B   │
│  (leader)  │                    │  (worker)  │
└──────┬─────┘                    └──────┬─────┘
       │                                 │
       │        SendMessage              │
       │◄────────────────────────────────┘
       │
  ┌────▼────────┐
  │  Agent C    │
  │  (worker)   │
  └─────────────┘

关键文件：
  utils/swarm/inProcessRunner.ts   → 进程内运行 + canUseTool 创建
  utils/swarm/permissionSync.ts    → 权限同步
  utils/swarm/leaderPermissionBridge.ts → Leader 权限桥接
  tools/SendMessageTool/           → 消息发送工具
```

### 7. Coordinator 模式

Coordinator 是一种特殊的运行模式（`CLAUDE_CODE_COORDINATOR_MODE`），将主会话变为"协调者"：

- 使用专用的 Coordinator 系统提示词
- 不直接执行任务，而是分派给 Worker Agent
- Worker Agent 通过 `workerAgent.ts` 定义

---

## 权限模式隔离

每个 Agent 可以有独立的权限模式：

| 模式 | 效果 |
|------|------|
| `inherit` | 继承父会话的权限模式 |
| `plan` | 需要用户批准计划 |
| `bubble` | 权限请求冒泡到父终端（Fork 默认） |
| 其他标准模式 | 独立使用该模式 |

---

## 工具池过滤

Agent 定义中的 `tools` 字段控制可用工具：

```typescript
tools: ['*']                    // 所有工具
tools: ['FileRead', 'Grep']    // 仅指定工具
tools: ['*', '-Bash']           // 所有工具排除 Bash

// 加上 useExactTools: true
tools: ['*']                    // 使用父的精确工具池（缓存友好）
```

`resolveAgentTools()` 负责根据定义过滤工具列表。

---

## 设计亮点

### 1. 上下文隔离
每个 Agent 有独立的 `AbortController`、`FileStateCache`、`setAppState`（noop），确保子代理的操作不影响主会话状态。

### 2. Fork 的 cache 优化
所有 Fork 子代理的 API 请求前缀（system prompt + 历史消息 + 占位符 tool_result）完全相同，只有最后的指令文本不同。这意味着并行 Fork 可以共享同一份 prompt cache。

### 3. 递归 Fork 防护
`isInForkChild()` 检测对话历史中的 `<fork_boilerplate>` 标签，防止 Fork 子代理再次 Fork（无限递归）。

### 4. Worktree 隔离
`isolation: 'worktree'` 创建 Git worktree，子代理在独立的工作副本中操作，修改不影响主分支。完成后可以合并或丢弃。

### 5. 渐进式后台化
Agent 先在前台运行，如果超时（120s）自动转入后台。用户可以继续对话，Agent 完成后通过通知汇报。

### 6. Agent 记忆
Agent 可以配置 `memory: 'user' | 'project' | 'local'`，在不同范围持久化学到的知识，下次同类任务时自动加载。

---

## 深读建议

| 如果你想了解... | 读这里 |
|----------------|--------|
| Agent 进度追踪和 UI | `tasks/LocalAgentTask/LocalAgentTask.ts` |
| 自定义 Agent 的 frontmatter 解析 | `loadAgentsDir.ts` 的 `AgentJsonSchema` |
| Swarm 消息传递机制 | `utils/swarm/inProcessRunner.ts` |
| Coordinator 的系统提示词 | `coordinator/coordinatorMode.ts` |
| 远程 Agent（CCR） | `tasks/RemoteAgentTask/RemoteAgentTask.ts` |
| Agent 颜色管理（UI 区分） | `tools/AgentTool/agentColorManager.ts` |

---

## 下一步

→ [10-Ink-UI.md](./10-Ink-UI.md)：理解终端 UI 的渲染机制
