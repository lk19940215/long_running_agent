# @anthropic-ai/sdk 快速入门

> Anthropic 官方 TypeScript/JavaScript 客户端 SDK 速查手册。直接调用 Claude Messages API，你来控制一切。

---

## 安装

```bash
npm install @anthropic-ai/sdk
```

## 基本用法

### 1. 最简调用

```javascript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();
// 默认读取 ANTHROPIC_API_KEY 环境变量，也可以显式传入:
// const client = new Anthropic({ apiKey: 'sk-ant-...' });

const message = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  messages: [{ role: 'user', content: '你好，用一句话介绍自己' }],
});

console.log(message.content);
// [{ type: 'text', text: '...' }]
```

### 2. messages.create 的完整参数

```javascript
const response = await client.messages.create({
  // ── 必填 ──
  model: 'claude-sonnet-4-20250514',  // 模型名称
  max_tokens: 4096,                    // 最大输出 token
  messages: [                          // 对话历史
    { role: 'user', content: '...' },
    { role: 'assistant', content: '...' },
    { role: 'user', content: '...' },
  ],

  // ── 可选 ──
  system: '你是一个编程助手',          // System Prompt（字符串或 content blocks）
  tools: [...],                        // 工具定义（下面详解）
  temperature: 0.7,                    // 随机性 0-1
  top_p: 0.9,                         // nucleus 采样
  stop_sequences: ['---'],             // 停止序列

  // ── 流式 ──
  stream: true,                        // 启用流式响应
});
```

### 3. 响应结构

```javascript
// response 的结构:
{
  id: 'msg_01XFDUDYJgAACzvnptvVoYEL',
  type: 'message',
  role: 'assistant',
  model: 'claude-sonnet-4-20250514',
  stop_reason: 'end_turn',  // 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence'
  content: [
    { type: 'text', text: '你好！我是 Claude...' }
  ],
  usage: {
    input_tokens: 25,
    output_tokens: 150
  }
}
```

**stop_reason 是 Agent Loop 的核心信号**：
- `end_turn` — LLM 认为回答完毕，该等用户输入了
- `tool_use` — LLM 想调用工具，你需要执行工具并把结果送回
- `max_tokens` — 输出被截断（增大 max_tokens 或分段处理）

---

## 工具调用（Tool Use）

这是构建 Agent 的核心 API。完整流程：

### 1. 定义工具

```javascript
const tools = [
  {
    name: 'read_file',
    description: '读取指定路径的文件内容',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '文件路径'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'execute_bash',
    description: '执行 bash 命令并返回输出',
    input_schema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: '要执行的命令'
        }
      },
      required: ['command']
    }
  }
];
```

`input_schema` 就是标准的 JSON Schema。LLM 根据 `description` 决定何时调用、根据 `input_schema` 决定传什么参数。

### 2. 发起带工具的请求

```javascript
const response = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 4096,
  tools,  // 传入工具定义
  messages: [
    { role: 'user', content: '读取 package.json 并告诉我项目名称' }
  ],
});

// response.stop_reason === 'tool_use'
// response.content 包含：
// [
//   { type: 'text', text: '我来读取这个文件。' },
//   { type: 'tool_use', id: 'toolu_xxx', name: 'read_file', input: { path: 'package.json' } }
// ]
```

### 3. 执行工具并返回结果

```javascript
// 从响应中提取 tool_use blocks
const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');

// 执行每个工具（这里简化为 read_file）
const toolResults = [];
for (const block of toolUseBlocks) {
  let result;
  if (block.name === 'read_file') {
    result = fs.readFileSync(block.input.path, 'utf-8');
  }

  toolResults.push({
    type: 'tool_result',
    tool_use_id: block.id,  // 必须匹配 tool_use 的 id
    content: result,
  });
}

// 将工具结果送回 LLM
const followUp = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 4096,
  tools,
  messages: [
    { role: 'user', content: '读取 package.json 并告诉我项目名称' },
    { role: 'assistant', content: response.content },  // 包含 tool_use 的完整 content
    { role: 'user', content: toolResults },             // tool_result 在 user 角色下
  ],
});

// followUp.stop_reason === 'end_turn'
// followUp.content[0].text === '项目名称是 "my-app"，版本 1.0.0...'
```

### 4. 消息协议规则（必须遵守）

```
messages 数组的结构规则:

1. 必须 user/assistant 交替出现
2. 第一条必须是 user
3. tool_use 出现在 assistant 消息中
4. tool_result 必须出现在下一条 user 消息中
5. 每个 tool_use 的 id 必须有对应的 tool_result
6. 一个 assistant 消息可以包含多个 tool_use（LLM 想同时调多个工具）
7. 对应的 user 消息也要包含所有 tool_result

正确的消息序列:

[user]      "读取 a.js 和 b.js"
[assistant] [text: "我来读取两个文件", tool_use(id1, read_file, a.js), tool_use(id2, read_file, b.js)]
[user]      [tool_result(id1, "内容A"), tool_result(id2, "内容B")]
[assistant] [text: "a.js 是一个工具类，b.js 是入口文件..."]
```

---

## Zod 工具（简化写法）

SDK 内置了 Zod 集成，可以用 Zod Schema 代替手写 JSON Schema：

```javascript
import Anthropic from '@anthropic-ai/sdk';
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

const client = new Anthropic();

const readFile = betaZodTool({
  name: 'read_file',
  description: '读取文件内容',
  inputSchema: z.object({
    path: z.string().describe('文件路径'),
  }),
  run: async (input) => {
    return fs.readFileSync(input.path, 'utf-8');
    // Zod 自动验证 input 类型
  },
});

// toolRunner 自动处理工具调用循环！
const result = await client.beta.messages.toolRunner({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 4096,
  messages: [{ role: 'user', content: '读取 package.json' }],
  tools: [readFile],
});

// result 是最终的 Message（所有工具调用已自动完成）
```

**toolRunner 的重要意义**：它帮你实现了 Agent Loop！内部就是一个 while 循环：
1. 调用 LLM
2. 如果 stop_reason 是 tool_use → 执行 run 函数 → 把结果送回 LLM → 重复
3. 如果 stop_reason 是 end_turn → 返回最终 Message

如果你用 `toolRunner`，你甚至不需要自己写 while 循环。但自己写循环给你更多控制权（自定义日志、权限检查、上下文裁剪等）。

---

## 流式响应（Streaming）

### 基础流式

```javascript
const stream = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 4096,
  messages: [{ role: 'user', content: '写一首诗' }],
  stream: true,
});

for await (const event of stream) {
  if (event.type === 'content_block_delta') {
    if (event.delta.type === 'text_delta') {
      process.stdout.write(event.delta.text);  // 实时打印
    }
  }
}
```

### 流式 + 工具调用

```javascript
const stream = client.messages.stream({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 4096,
  tools,
  messages,
});

// 事件驱动方式
stream.on('text', (text) => {
  process.stdout.write(text);
});

stream.on('inputJSON', (json) => {
  // 工具输入参数的增量 JSON
});

const finalMessage = await stream.finalMessage();
// finalMessage.stop_reason, finalMessage.content 等
```

### 流式事件类型速查

| 事件 | 含义 |
|------|------|
| `message_start` | 新消息开始 |
| `content_block_start` | 新内容块开始（text 或 tool_use） |
| `content_block_delta` | 增量内容（text_delta 或 input_json_delta） |
| `content_block_stop` | 内容块结束 |
| `message_delta` | 消息级别的增量更新（含 stop_reason） |
| `message_stop` | 消息结束 |

---

## 错误处理

```javascript
import Anthropic from '@anthropic-ai/sdk';

try {
  const message = await client.messages.create({...});
} catch (err) {
  if (err instanceof Anthropic.APIError) {
    console.log(err.status);   // HTTP 状态码
    console.log(err.message);  // 错误描述

    // 常见错误码:
    // 400 — 请求格式错误（检查 messages 结构）
    // 401 — API Key 无效
    // 429 — 速率限制（需要等待重试）
    // 500 — 服务端错误
    // 529 — API 过载
  }
}
```

SDK 内置了自动重试（429 和 5xx 错误，默认重试 2 次）：

```javascript
const client = new Anthropic({
  maxRetries: 3,      // 最大重试次数
  timeout: 60_000,    // 请求超时 ms
});
```

---

## Token 使用和成本

每次调用返回 `usage` 字段：

```javascript
const msg = await client.messages.create({...});
console.log(msg.usage);
// { input_tokens: 1200, output_tokens: 350 }
```

input_tokens 包括：system prompt + messages 历史 + tools 定义。这就是为什么上下文管理很重要——messages 越长，每次调用消耗的 input_tokens 越多。

---

## 可用模型

| 模型 | 适合场景 | 成本 |
|------|----------|------|
| claude-opus-4-6 | 最强推理，复杂任务 | 最高 |
| claude-sonnet-4-20250514 | 均衡选择，适合大多数 Agent | 中等 |
| claude-haiku-3-5-20241022 | 快速响应，简单任务 | 最低 |

Agent 场景推荐 **claude-sonnet-4**：足够智能处理工具调用，成本可控。

---

## 与 agent-demo 的关系

agent-demo 的 `agent.mjs` 做了什么：

```
1. new Anthropic()                              ← 创建客户端
2. client.messages.create({ tools, messages })  ← 发送请求
3. 检查 response.stop_reason                    ← 判断下一步
4. 如果 tool_use → 执行工具 → 结果加入 messages ← 手动循环
5. 回到步骤 2                                    ← 继续
```

这就是整个 SDK 在 Agent 场景中的使用方式。SDK 本身只负责"发请求、拿响应"，所有的编排逻辑（循环、工具执行、上下文管理）都是你的代码。

---

## 参考链接

- [npm 包](https://www.npmjs.com/package/@anthropic-ai/sdk)（v0.80.0, MIT）
- [GitHub 仓库](https://github.com/anthropics/anthropic-sdk-typescript)
- [官方 TypeScript SDK 文档](https://platform.claude.com/docs/en/api/sdks/typescript)
- [Tool Use 官方指南](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview)
- [API 参考](https://platform.claude.com/docs/en/api/overview)
