# Claude Agent SDK 使用指南

> 本文档从浅入深介绍 `@anthropic-ai/claude-agent-sdk`，帮助开发者理解其核心机制并构建自己的 AI Agent 工具。

## 目录

1. [快速开始](#快速开始)
2. [核心概念](#核心概念)
3. [Query 详解](#query-详解)
4. [Hooks 系统](#hooks-系统)
5. [中断与超时](#中断与超时)
6. [Agent 定义](#agent-定义)
7. [MCP 集成](#mcp-集成)
8. [权限控制](#权限控制)
9. [进阶技巧](#进阶技巧)

---

## 快速开始

### 安装

```bash
npm install @anthropic-ai/claude-agent-sdk
```

### 最简示例

```javascript
const sdk = require('@anthropic-ai/claude-agent-sdk');

async function main() {
  const session = sdk.query({
    prompt: '读取 package.json 并告诉我项目名称',
  });

  for await (const message of session) {
    if (message.type === 'assistant') {
      console.log(message.content);
    }
  }
}

main();
```

### 带选项的示例

```javascript
const session = sdk.query({
  prompt: '实现一个 hello world 程序',
  options: {
    allowedTools: ['Read', 'Write', 'Bash'],
    systemPrompt: '你是一个专业的程序员',
  },
});

for await (const message of session) {
  console.log(message.type, message);
}
```

---

## 核心概念

### 1. Query

`query` 是 SDK 的核心入口，启动一个 Agent 会话：

```typescript
function query(params: {
  prompt: string | AsyncIterable<SDKUserMessage>;
  options?: Options;
}): Query;
```

返回的 `Query` 是一个异步可迭代对象，可以通过 `for await...of` 遍历消息流。

### 2. 消息类型

会话过程中会产生多种消息：

| 类型 | 说明 |
|------|------|
| `assistant` | AI 的响应内容 |
| `tool_use` | AI 请求调用工具 |
| `tool_result` | 工具执行结果 |
| `result` | 会话最终结果（含成本统计） |

### 3. 工具系统

SDK 内置了丰富的工具：

```javascript
// 常用工具
['Read', 'Edit', 'MultiEdit', 'Write',  // 文件操作
 'Bash', 'Glob', 'Grep', 'LS',           // 系统操作
 'Task',                                  // 子任务
 'WebSearch', 'WebFetch']                // 网络操作
```

---

## Query 详解

### Options 完整配置

```javascript
const options = {
  // === 核心配置 ===
  systemPrompt: '...',           // 系统提示词

  // === 工具配置 ===
  allowedTools: ['Read', 'Write', 'Bash'],  // 允许的工具列表
  mcpServers: { ... },                      // MCP 服务器配置

  // === 控制配置 ===
  abortController: new AbortController(),   // 中断控制器
  maxTurns: 10,                             // 最大对话轮次

  // === Hooks ===
  hooks: {
    PreToolUse: [...],
    PostToolUse: [...],
    // ...
  },

  // === Agent 配置 ===
  agent: 'my-agent',            // 使用预定义的 agent
  agents: { ... },              // 自定义 agent 定义

  // === 其他 ===
  additionalDirectories: ['/path/to/access'],  // 额外可访问目录
  permissionMode: 'auto',                       // 权限模式
};
```

### 流式处理

```javascript
const session = sdk.query({ prompt, options });

for await (const message of session) {
  switch (message.type) {
    case 'assistant':
      // 处理 AI 响应
      process.stdout.write(message.content);
      break;

    case 'tool_use':
      console.log(`调用工具: ${message.name}`);
      break;

    case 'result':
      // 会话结束，获取统计
      console.log('成本:', message.total_cost_usd);
      console.log('Token:', message.usage);
      break;
  }
}
```

---

## Hooks 系统

Hooks 允许在 Agent 执行过程中注入自定义逻辑。

### Hook 类型

| Hook | 触发时机 |
|------|---------|
| `PreToolUse` | 工具调用前（可阻止或修改输入） |
| `PostToolUse` | 工具调用后（可追加上下文） |
| `PostToolUseFailure` | 工具执行失败时 |
| `Stop` | Agent 执行停止时 |
| `Notification` | 通知事件（权限提示、空闲等） |
| `SubagentStart` | 子 Agent 启动时 |
| `SubagentStop` | 子 Agent 完成时 |
| `UserPromptSubmit` | 用户提交 prompt 时 |
| `PreCompact` | 对话压缩前 |

### 基本结构

```javascript
const hooks = {
  PreToolUse: [{
    matcher: '*',  // 匹配所有工具，或指定工具名如 'Bash'
    hooks: [async (input, toolUseID, context) => {
      // input: 包含 tool_name, tool_input, session_id, hook_event_name 等
      // toolUseID: 工具调用 ID，可关联 PreToolUse 和 PostToolUse
      // context: { signal: AbortSignal }
      console.log('即将调用:', input.tool_name);
      console.log('参数:', input.tool_input);

      // 返回 {} 允许执行
      return {};
    }]
  }],

  PostToolUse: [{
    matcher: '*',
    hooks: [async (input, toolUseID, context) => {
      console.log('工具执行完成');
      return {};
    }]
  }],
};
```

### PreToolUse 详细说明

```javascript
async function preToolUseHandler(input, toolUseID, context) {
  // input 包含: tool_name, tool_input, session_id, hook_event_name, cwd 等
  // toolUseID: 关联 PreToolUse/PostToolUse 的唯一标识
  // context: { signal: AbortSignal }

  const { tool_name, tool_input } = input;

  // 示例1: 记录文件操作
  if (tool_name === 'Write' || tool_name === 'Edit') {
    console.log(`编辑文件: ${tool_input.file_path}`);
  }

  // 示例2: 阻止危险操作
  if (tool_name === 'Bash') {
    if (tool_input.command.includes('rm -rf')) {
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: '禁止执行危险命令',
        },
      };
    }
  }

  // 示例3: 限制编辑次数（防止死循环）
  const editCounts = {};
  if (['Write', 'Edit', 'MultiEdit'].includes(tool_name)) {
    const target = tool_input.file_path;
    editCounts[target] = (editCounts[target] || 0) + 1;
    if (editCounts[target] > 30) {
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `已对 ${target} 编辑过多，疑似死循环`,
        },
      };
    }
  }

  return {};  // 允许执行
}
```

### Hook 返回值

官方文档验证的返回格式：

```typescript
// PreToolUse 返回值（TypeScript）
{
  // 顶层字段：注入对话内容（可选）
  systemMessage?: string;

  // hookSpecificOutput：控制工具行为
  hookSpecificOutput?: {
    hookEventName: 'PreToolUse';
    permissionDecision?: 'allow' | 'deny' | 'ask';
    permissionDecisionReason?: string;
    updatedInput?: Record<string, unknown>;  // 修改后的工具输入
    additionalContext?: string;
  };
}

// PostToolUse 返回值
{
  hookSpecificOutput?: {
    hookEventName: 'PostToolUse';
    additionalContext?: string;
    updatedMCPToolOutput?: unknown;  // 修改 MCP 工具输出
  };
}
```

> **注意**: 使用 `updatedInput` 时必须同时设置 `permissionDecision: 'allow'`。`deny` 优先级高于 `ask`，`ask` 高于 `allow`。

### PreToolUse 阻止示例

```javascript
async function protectEnvFiles(input, toolUseID, context) {
  const filePath = input.tool_input?.file_path || '';

  if (filePath.startsWith('/etc')) {
    return {
      systemMessage: 'Remember: system directories like /etc are protected.',
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: 'Writing to /etc is not allowed',
      },
    };
  }

  return {};
}
```

> **官方文档参考**: [Agent SDK Hooks](https://platform.claude.com/docs/en/agent-sdk/hooks)

### PostToolUse 详细说明

```javascript
async function postToolUseHandler(input, toolUseID, context) {
  // 在工具执行后触发，toolUseID 与对应的 PreToolUse 一致
  // 可以进行状态清理、日志记录等

  console.log(`${input.tool_name} 执行完成`);

  return {};
}
```

### Matcher 规则

`matcher` 是一个正则字符串（regex string），用于匹配工具名称：

```javascript
matcher: '*'                   // 匹配所有工具（省略 matcher 也等同于匹配全部）
matcher: 'Bash'                // 只匹配 Bash
matcher: 'Read|Write|Edit'    // 用 | 分隔匹配多个工具
matcher: '^mcp__'              // 正则匹配所有 MCP 工具
matcher: 'Write|Edit|Delete'  // 匹配文件修改类工具
```

---

## 中断与超时

### AbortController

SDK 支持通过 `AbortController` 中断正在运行的会话：

```javascript
const abortController = new AbortController();

const session = sdk.query({
  prompt: '长时间任务...',
  options: {
    abortController,
  }
});

// 在需要时中断
setTimeout(() => {
  abortController.abort();
  console.log('已中断会话');
}, 60000);  // 60秒后中断

// 处理消息
try {
  for await (const message of session) {
    // 处理消息
  }
} catch (err) {
  if (err.name === 'AbortError') {
    console.log('会话被中断');
  }
}
```

### 超时检测模式

结合 Hooks 实现自动超时检测：

```javascript
function createTimeoutHook(timeoutMs, abortController) {
  let lastActivity = Date.now();

  // PreToolUse 更新活动时间
  const preHook = async () => {
    lastActivity = Date.now();
    return {};
  };

  // 定时器检测超时
  const checker = setInterval(() => {
    const idle = Date.now() - lastActivity;
    if (idle > timeoutMs) {
      console.log(`超时 ${Math.floor(idle / 60000)} 分钟，中断会话`);
      abortController.abort();
    }
  }, 30000);

  return {
    hooks: {
      PreToolUse: [{ matcher: '*', hooks: [preHook] }],
    },
    cleanup: () => clearInterval(checker),
  };
}

// 使用
const abortController = new AbortController();
const { hooks, cleanup } = createTimeoutHook(30 * 60 * 1000, abortController);

const session = sdk.query({
  prompt,
  options: { abortController, hooks },
});

try {
  for await (const msg of session) { /* ... */ }
} finally {
  cleanup();
}
```

---

## Agent 定义

### 什么是 Agent

Agent 是预配置的 AI 行为模板，可以定义专属的系统提示词、工具限制和模型选择。

### 定义 Agent

```javascript
const myAgent = {
  description: '专门用于代码审查的 Agent',
  prompt: `你是一个专业的代码审查员。
请关注：
1. 代码质量
2. 潜在 bug
3. 安全问题
4. 性能优化`,
  tools: ['Read', 'Glob', 'Grep'],  // 只读工具
  model: 'sonnet',  // 使用 sonnet 模型
  maxTurns: 5,      // 限制轮次
};
```

### 使用 Agent

```javascript
const session = sdk.query({
  prompt: '审查 src/ 目录下的代码',
  options: {
    agent: 'code-reviewer',
    agents: {
      'code-reviewer': myAgent,
    },
  },
});
```

### Agent 配置项

```typescript
type AgentDefinition = {
  description: string;      // 描述
  prompt: string;           // 系统提示词
  tools?: string[];         // 允许的工具
  disallowedTools?: string[]; // 禁用的工具
  model?: 'sonnet' | 'opus' | 'haiku' | 'inherit';
  maxTurns?: number;        // 最大轮次
  mcpServers?: AgentMcpServerSpec; // MCP 配置
};
```

---

## MCP 集成

### 什么是 MCP

MCP (Model Context Protocol) 允许 Agent 连接外部工具和服务，如浏览器自动化、数据库操作等。

### 配置 MCP 服务器

```javascript
const options = {
  mcpServers: {
    // Playwright 浏览器自动化
    'playwright': {
      command: 'npx',
      args: ['-y', '@anthropic-ai/mcp-server-playwright'],
    },

    // 自定义 MCP 服务器
    'my-server': {
      command: 'node',
      args: ['mcp-server.js'],
      env: { API_KEY: 'xxx' },
    },
  },
};
```

### MCP 工具命名

MCP 工具以 `mcp__<server>__<tool>` 格式命名：

```
mcp__playwright__browser_click
mcp__playwright__browser_snapshot
mcp__my-server__custom_tool
```

### 允许 MCP 工具

```javascript
allowedTools: [
  'Read', 'Write', 'Bash',  // 内置工具
  'mcp__playwright__*',      // 允许某个 MCP 服务器的所有工具
  'mcp__my-server__tool1',   // 允许特定工具
],
```

---

## 权限控制

### 权限回调

```javascript
async function canUseTool(toolName, input, options) {
  // options 包含:
  // - signal: AbortSignal
  // - toolUseID: string
  // - suggestions: PermissionUpdate[]
  // - blockedPath: string (如果有)

  // 返回值:
  // { behavior: 'allow' } - 允许
  // { behavior: 'deny', message: '...' } - 拒绝
  // { behavior: 'ask', message: '...' } - 需要用户确认

  if (toolName === 'Bash') {
    const cmd = input.command;
    if (cmd.includes('rm ')) {
      return {
        behavior: 'deny',
        message: '禁止删除文件',
      };
    }
  }

  return { behavior: 'allow' };
}

const options = {
  canUseTool,
};
```

---

## 进阶技巧

### 1. 消息过滤与提取

```javascript
function extractResult(messages) {
  for (const msg of messages) {
    if (msg.type === 'result') {
      return {
        cost: msg.total_cost_usd,
        usage: msg.usage,
        output: msg.result,
      };
    }
  }
  return null;
}
```

### 2. 多轮对话

```javascript
// 方式1: 使用 AsyncIterable 作为 prompt
async function* conversation() {
  yield { type: 'user', content: '第一个问题' };
  // 可以在 yield 之间插入逻辑
  yield { type: 'user', content: '第二个问题' };
}

const session = sdk.query({
  prompt: conversation(),
  options: { ... },
});
```

### 3. 错误处理

```javascript
try {
  for await (const msg of session) {
    // 处理消息
  }
} catch (err) {
  if (err.name === 'AbortError') {
    console.log('用户中断');
  } else {
    console.error('SDK 错误:', err.message);
  }
} finally {
  // 清理资源
}
```

### 4. 会话状态管理

```javascript
class SessionManager {
  constructor() {
    this.abortController = null;
    this.messages = [];
    this.isRunning = false;
  }

  async start(prompt, options) {
    this.abortController = new AbortController();
    this.messages = [];
    this.isRunning = true;

    const session = sdk.query({
      prompt,
      options: {
        ...options,
        abortController: this.abortController,
      },
    });

    try {
      for await (const msg of session) {
        this.messages.push(msg);
      }
    } finally {
      this.isRunning = false;
    }
  }

  abort() {
    if (this.abortController) {
      this.abortController.abort();
    }
  }
}
```

### 5. 成本追踪

```javascript
let totalCost = 0;

const hooks = {
  PostToolUse: [{
    matcher: '*',
    hooks: [async () => {
      // 从最后一条消息提取成本
      // 注意: 实际成本在 result 消息中
      return {};
    }]
  }],
};

// 会话结束后
if (msg.type === 'result') {
  totalCost += msg.total_cost_usd || 0;
  console.log(`本次: $${msg.total_cost_usd}, 累计: $${totalCost}`);
}
```

---

## 参考资源

- [GitHub: anthropics/claude-agent-sdk-typescript](https://github.com/anthropics/claude-agent-sdk-typescript)
- [npm: @anthropic-ai/claude-agent-sdk](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)
- [MCP 协议文档](https://modelcontextprotocol.io/)

---

## 附录: 常用工具列表

| 工具 | 功能 |
|------|------|
| `Read` | 读取文件 |
| `Write` | 写入文件 |
| `Edit` | 编辑文件（字符串替换） |
| `MultiEdit` | 多处编辑 |
| `Bash` | 执行 shell 命令 |
| `Glob` | 文件模式匹配 |
| `Grep` | 内容搜索 |
| `LS` | 列出目录 |
| `Task` | 启动子 Agent |
| `WebSearch` | 网络搜索 |
| `WebFetch` | 获取网页内容 |