这是 **Agent Harness 设计里最关键的工程问题之一**。
如果处理不好，就会出现：

* agent之间 **上下文爆炸**
* agent之间 **语义丢失**
* orchestration **难以维护**

工业级系统（如 Cursor / Devin / Claude Code）通常不会让 **Agent直接“对话”**，而是通过 **结构化数据 Contract** 传递。

核心原则：

```
Agent → 返回结构化对象
Orchestrator → 解析
Orchestrator → 传给下一个 Agent
```

而不是：

```
AgentA → 文本 → AgentB
```

因为文本会导致：

* 不稳定
* 难解析
* token 浪费

---

# 一、标准设计：Agent Contract

每个 Agent 必须有 **明确的返回 Schema**。

例如：

```
Context Agent
↓
ContextPackage

Planner Agent
↓
Plan

Executor Agent
↓
Patch

Reviewer Agent
↓
ReviewResult
```

数据流：

```
User Task
   │
   ▼
Context Agent
   │
   ▼
ContextPackage
   │
   ▼
Planner Agent
   │
   ▼
Plan
   │
   ▼
Executor Agent
   │
   ▼
Patch
   │
   ▼
Reviewer Agent
```

---

# 二、Context Agent → Planner Agent

Context Agent 输出：

```json
{
  "task_summary": "Add caching to user profile endpoint",

  "primary_files": [
    {
      "file": "services/userService.ts",
      "lines": "80-140",
      "reason": "user profile retrieval logic"
    }
  ],

  "supporting_files": [
    {
      "file": "utils/cache.ts",
      "lines": "1-120",
      "reason": "existing cache utility"
    }
  ],

  "related_symbols": [
    "UserService.getProfile",
    "CacheManager.get"
  ]
}
```

Orchestrator 读取后：

构造 Planner 输入：

```
TASK
Add caching to user profile endpoint

CONTEXT
services/userService.ts lines 80-140
utils/cache.ts lines 1-120

SYMBOLS
UserService.getProfile
CacheManager.get
```

然后调用 Planner。

---

# 三、Planner → Executor

Planner 输出：

```json
{
  "plan_summary": "Add caching layer",

  "steps": [
    {
      "step_id": 1,
      "title": "Add cache lookup",
      "files": ["services/userService.ts"],
      "description": "Check cache before querying database"
    },
    {
      "step_id": 2,
      "title": "Update cache after DB fetch",
      "files": ["services/userService.ts"],
      "description": "Store retrieved profile in cache"
    }
  ]
}
```

Orchestrator 执行：

```
for step in plan.steps
```

调用 Executor。

Executor 输入：

```
STEP
Add cache lookup

FILES
services/userService.ts

CONTEXT
<代码片段>
```

---

# 四、Executor → Reviewer

Executor 返回：

```json
{
  "step_id": 1,
  "files_modified": [
    "services/userService.ts"
  ],

  "changes_summary": "Add cache lookup before DB query",

  "diff": "git patch"
}
```

Reviewer 输入：

```
PLAN STEP
Add cache lookup

PATCH
<git diff>

CONTEXT
<代码>
```

Reviewer 返回：

```json
{
  "status": "PASS",
  "issues": []
}
```

---

# 五、为什么要通过 Orchestrator

Agent之间 **不应该直接互相调用**。

正确结构：

```
Agent A
  ↓
Orchestrator
  ↓
Agent B
```

原因：

### 1 可控

Orchestrator 可以：

```
验证 schema
裁剪 context
记录日志
```

---

### 2 防止 token 爆炸

Agent A 可能返回：

```
20k tokens
```

Orchestrator 可以：

```
压缩
筛选
```

再给 Agent B。

---

### 3 易调试

日志结构：

```
task/
   context.json
   plan.json
   patch.json
   review.json
```

Cursor / Devin 都会保存这些。

---

# 六、Harness里的典型实现

伪代码：

```ts
async function agentLoop(task) {

  const context = await contextAgent(task)

  const plan = await plannerAgent({
    task,
    context
  })

  for (const step of plan.steps) {

    const patch = await executorAgent({
      step,
      context
    })

    const review = await reviewerAgent({
      step,
      patch
    })

    if (review.status === "REVISE") {
      // retry
    }
  }
}
```

---

# 七、一个非常重要的工程技巧

**不要把完整 JSON 直接喂给下一个 Agent。**

因为：

```
JSON = token很多
```

正确方式：

Orchestrator 转换成：

```
PLAN STEP
Add cache lookup

FILES
services/userService.ts

DESCRIPTION
Check cache before DB query
```

token 会减少 **30-50%**。

---

# 八、一个更高级的设计（Cursor在用）

使用 **Task State**。

系统维护一个：

```
TaskState
```

例如：

```json
{
  "task": "...",
  "context": {...},
  "plan": {...},
  "completed_steps": [1],
  "pending_steps": [2,3]
}
```

每个 Agent：

只读取需要的部分。

---

# 九、Claude Agent SDK 的推荐模式

如果你用
Anthropic Claude Agent SDK

推荐结构：

```
agents/
   context.ts
   planner.ts
   executor.ts
   reviewer.ts

core/
   orchestrator.ts

types/
   context.ts
   plan.ts
   patch.ts
   review.ts
```

Orchestrator：

```
state machine
```

而不是 chat。

---

# 十、一个关键建议（很多 Agent 作者会忽略）

Agent 之间传递：

```
结构化数据
```

但 **LLM 输入必须是自然语言结构**。

例如：

内部：

```
plan.steps[0]
```

输入给 LLM：

```
PLAN STEP

Title:
Add cache lookup

Files:
services/userService.ts

Goal:
Avoid repeated DB queries
```

LLM理解会好很多。

---

# 十一、最推荐的 Agent 通信架构

最终结构：

```
Agents
  ↓
Structured JSON
  ↓
Orchestrator
  ↓
Prompt Builder
  ↓
Next Agent
```

而不是：

```
Agent → Agent
```

---

如果你愿意，我可以再给你一个 **真正接近 Cursor / Devin 的 Harness 架构升级版**：

里面有一个非常关键的东西：

**Agent Event Bus**

它能让你的 Agent 系统：

* 可并行
* 可回溯
* 可恢复任务

这是很多先进 agent 系统的核心设计。
