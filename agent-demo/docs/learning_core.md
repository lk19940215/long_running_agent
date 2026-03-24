# AI Coding Agent 学习路线

> 从底层吃透核心，再按需扩展。

---

## 学习阶段

```
阶段 1（你在这里）: 底层实现
  @anthropic-ai/sdk + Node.js 内置模块（fs/promises, child_process）
  手写 Agent Loop、工具调用、上下文管理
  目标：理解每一行代码在做什么

      ↓ 学透后

阶段 2: 框架加速
  Vercel AI SDK（Node.js 世界的轻量版 LangChain）
  统一多模型、预制工具包、简化 Agent 循环
  目标：提升开发效率，快速搭原型

      ↓ 如果需要复杂编排

阶段 3: 编排进阶
  LangGraph 的状态图 / 检查点 / 多代理协作概念
  目标：处理需要暂停恢复、多代理协作的场景

      ↓ 如果要做产品

阶段 4: 产品化
  CLI 工具 → VS Code 插件 → VS Code Fork（Cursor/Trae 路线）
  IDE 集成层（Extension API / LSP / Tree-sitter）
```

---

## 阶段 1 的核心知识点

### 1. Agent Loop 骨架

所有 AI Coding Agent（Claude Code、Cursor、Trae）的核心都是同一个循环：

```
while (true) {
  获取用户输入 → 加入 messages
  调用 LLM（messages + tools）
  if stop_reason === 'tool_use' → 执行工具 → 结果加入 messages → 继续循环
  if stop_reason === 'end_turn'  → 输出结果 → 等待用户
}
```

参考代码：`agent-demo/agent.mjs`

### 2. 工具 = 函数 + JSON Schema

LLM 通过 JSON Schema 知道工具"是什么、怎么调用"，你写 execute 函数决定"怎么执行"。

参考代码：`agent-demo/tools.mjs`

### 3. 消息协议

messages 数组是 Agent 的全部记忆。规则：
- user/assistant 交替出现
- tool_use 出现在 assistant 消息中
- tool_result 必须在下一条 user 消息中
- 每个 tool_use.id 必须有对应 tool_result

### 4. 上下文管理

最小方案：messages 数组就是上下文。
进阶：token 裁剪（删旧消息）、结果截断（限制工具输出长度）、子代理隔离。

### 5. SDK 选择

只用 `@anthropic-ai/sdk`。换模型改 `baseURL`。不需要其它 SDK。

---

## 阶段 1 的动手清单

- [ ] 阅读 `agent-demo/agent.mjs` 和 `tools.mjs`，理解每一行
- [ ] 运行 `node agent.mjs`，用自然语言让它读文件、写文件、执行命令
- [ ] 观察 console 输出的 `[工具]` 和 `[结果]`，理解工具调用的流转
- [ ] 尝试添加一个新工具（如 grep_search），理解工具注册模式
- [ ] 故意让对话变长，观察 token 使用量增长，思考裁剪策略

---

## 工具技术栈

| 你用什么 | 它是什么 |
|---------|---------|
| `@anthropic-ai/sdk` | Anthropic 官方 HTTP 客户端（发请求、拿响应） |
| `fs/promises` | Node.js 内置，文件读写（readFile, writeFile, mkdir） |
| `child_process` | Node.js 内置，执行 bash 命令（execSync） |

不需要安装其它依赖。

---

## 架构参考

`agent_architecture.md` 包含 Claude Code 和 Cursor 的详细架构图（Mermaid 时序图、分层结构图），可作为深入学习的参考。

---

## 关键认知

- Claude Code / Cursor / Trae 都没有用 LangChain 或任何框架，它们直接调 LLM API
- 整个 Agent 就是一个 while 循环，没有魔法
- 复杂性来自**工程化**：更多工具、更好的上下文管理、更完善的错误恢复、权限控制
- 先 CLI 吃透核心 → 后加 IDE 集成层，路径完全可行
