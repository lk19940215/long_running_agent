# Agent Loop + 消息协议 + SDK

---

## Agent Loop

```
while (true) {
  获取用户输入 → 加入 messages
  调用 LLM（messages + tools）
  if stop_reason === 'tool_use' → 执行工具 → 结果加入 messages → 继续循环
  if stop_reason === 'end_turn'  → 输出结果 → 等待用户
}
```

参考：`src/agent.mjs`

---

## stop_reason

| stop_reason | 含义 | Agent 处理 |
|-------------|------|-----------|
| `end_turn` | 回答完毕 | 等用户输入 |
| `tool_use` | 请求调工具 | 执行 → 结果送回 → 继续循环 |
| `max_tokens` | 输出截断 | 已有内容加入 messages，继续调用 |
| `stop_sequence` | 命中停止序列 | 按业务处理（少用） |

---

## 消息协议

```
messages: [
  { role: 'user', content: '...' },
  { role: 'assistant', content: [text, tool_use, tool_use] },
  { role: 'user', content: [tool_result, tool_result] },
]
```

- user/assistant 严格交替，首条必须是 user
- system prompt 是 `create()` 的独立参数，不在 messages 中
- tool_use.id 与 tool_result.tool_use_id 必须一一对应，不匹配则 400
- 错误用 `is_error: true` 标记，模型换策略重试

---

## SDK（@anthropic-ai/sdk）

```javascript
import Anthropic from '@anthropic-ai/sdk';
const client = new Anthropic({ apiKey: '...', baseURL: '...' });

const response = await client.messages.create({
  model, max_tokens, system, tools, messages,
});
// response.stop_reason, response.content, response.usage
```

```javascript
// 流式
const stream = client.messages.stream({ model, max_tokens, tools, messages });
stream.on('text', (text) => process.stdout.write(text));
```

```javascript
// 自动重试 429/5xx
const client = new Anthropic({ maxRetries: 3, timeout: 60_000 });
```

```javascript
// toolRunner（SDK 内置 Agent Loop，自己写循环控制力更强）
const result = await client.beta.messages.toolRunner({ model, tools, messages });
```

换模型提供商改 `baseURL`（DeepSeek、阿里云等兼容 Anthropic 协议）。

---

## 常见 API 错误码

| 状态码 | 含义 | 处理 |
|--------|------|------|
| 400 | 请求格式错误（tool_use_id 不匹配等） | 检查消息结构 |
| 401 | API Key 无效 | 检查 .env |
| 429 | 速率限制 | SDK 自动重试 |
| 500/529 | 服务端错误 | SDK 自动重试 |

---

## 项目结构

```
src/
  agent.mjs              # 主循环（Agent Loop）
  config.mjs             # 配置 + SYSTEM_PROMPT
  core/                  # 运行时基础设施
    ink.mjs              # 终端 UI（Ink / React for CLI）
    logger.mjs           # 文件日志
    messages.mjs         # 对话历史存储
  tools/                 # 工具系统
    registry.mjs         # define() + 注册表（共享基础设施）
    index.mjs            # 聚合所有工具 + 导出 toolSchemas / executeTool
    file.mjs             # read_file / write_file / edit_file
    search.mjs           # grep_search / list_files（@vscode/ripgrep）
    ast.mjs              # code_symbols（web-tree-sitter AST）
    bash.mjs             # execute_bash
```

## 技术栈

| 库 | 用途 |
|---|------|
| `@anthropic-ai/sdk` | LLM API 客户端 |
| `ink` + `react` | 终端 UI 框架 |
| `@vscode/ripgrep` | 代码搜索 / 文件列举 |
| `web-tree-sitter` | AST 代码分析 |
| `@repomix/tree-sitter-wasms` | 预构建语法 wasm 文件 |
| `fs/promises` | 文件读写 |
| `child_process` | bash 命令执行 |
