# 08 - MCP（Model Context Protocol）

> **一句话总结**：MCP 是 Claude Code 的**外部工具扩展协议**——通过 `@modelcontextprotocol/sdk` 连接外部服务器，将远端工具转换为内部 `Tool` 格式，与内置工具统一参与工具池、权限检查和模型调用。

---

## 为什么重要？

MCP 让 Claude Code 突破了内置工具的边界：
- IDE 扩展（VS Code、JetBrains）通过 MCP 提供代码操作能力
- 外部服务（数据库、CI/CD、Slack 等）通过 MCP 被 AI 调用
- 用户可以自定义 MCP 服务器，扩展 Claude 的能力范围
- MCP 工具与内置工具享有相同的权限系统保护

---

## 全景图

```
┌─────────────────────────────────────────────────────┐
│                    Claude Code                       │
│                                                     │
│  ┌──────────┐    ┌───────────┐    ┌──────────────┐ │
│  │ 工具池    │◄───│ 工具注册   │◄───│ MCP 工具转换  │ │
│  │(内置+MCP) │    │ tools.ts  │    │ client.ts    │ │
│  └──────────┘    └───────────┘    └──────┬───────┘ │
│       ▲                                  │         │
│       │                                  │         │
│  ┌────┴─────┐                    ┌───────▼───────┐ │
│  │ 权限检查  │                    │  MCP 连接管理  │ │
│  │permissions│                    │ useManagedMCP │ │
│  └──────────┘                    └───────┬───────┘ │
│                                          │         │
└──────────────────────────────────────────┼─────────┘
                                           │
                    ┌──────────────────────┼──────────────────────┐
                    │                      │                      │
              ┌─────▼─────┐        ┌──────▼──────┐       ┌──────▼──────┐
              │  Stdio     │        │   SSE       │       │ Streamable  │
              │  Transport │        │  Transport  │       │   HTTP      │
              └─────┬─────┘        └──────┬──────┘       └──────┬──────┘
                    │                      │                      │
              ┌─────▼─────┐        ┌──────▼──────┐       ┌──────▼──────┐
              │ 本地进程    │        │ 远程 SSE    │       │ 远程 HTTP   │
              │ MCP Server │        │ MCP Server  │       │ MCP Server  │
              └───────────┘        └─────────────┘       └─────────────┘
```

---

## 核心文件导航

| 文件 | 职责 | 深读价值 |
|------|------|---------|
| `services/mcp/client.ts` | MCP 连接、工具发现、工具转换，~3348 行 | ⭐⭐⭐ 核心（体量大） |
| `services/mcp/useManageMCPConnections.ts` | React Hook：连接生命周期管理，~1142 行 | ⭐⭐ 必读 |
| `services/mcp/MCPConnectionManager.tsx` | Context 包装（reconnect/toggle），~72 行 | ⭐ 了解 |
| `tools/MCPTool/MCPTool.ts` | MCP 工具的 buildTool 模板，~78 行 | ⭐⭐ 必读 |
| `services/mcp/types.ts` | 类型定义（MCPServerConnection 等） | ⭐ 参考 |
| `tools/ListMcpResourcesTool/` | 资源列表工具 | ⭐ 按需 |
| `tools/ReadMcpResourceTool/` | 资源读取工具 | ⭐ 按需 |
| `tools/McpAuthTool/` | OAuth 认证工具 | ⭐ 按需 |

---

## 逐层详解

### 1. 连接层：Transport + Client

MCP 支持三种传输方式：

| Transport | 用途 | 启动方式 |
|-----------|------|---------|
| `StdioClientTransport` | 本地进程 | `command` + `args` 启动子进程，通过 stdin/stdout 通信 |
| `SSEClientTransport` | 远程 SSE | HTTP 长连接，服务器推送 |
| `StreamableHTTPClientTransport` | 远程 HTTP | HTTP 请求/响应模式 |

连接流程（`client.ts`）：
```
配置加载 → Transport 创建 → Client.connect()
  → capabilities 协商 → listTools / listResources
  → 注册清理函数（registerCleanup）
```

### 2. 工具转换层：fetchToolsForClient

`fetchToolsForClient()` 是 MCP 到内部工具系统的桥梁：

```typescript
export const fetchToolsForClient = memoizeWithLRU(
  async (client: MCPServerConnection): Promise<Tool[]> => {
    // 1. 调用 MCP 协议的 tools/list
    const result = await client.client.request(
      { method: 'tools/list' }, ListToolsResultSchema
    )
    
    // 2. 清理 Unicode、转换为内部 Tool 格式
    return result.tools.map(tool => ({
      ...MCPTool,                              // 继承 MCPTool 模板
      name: buildMcpToolName(server, tool),    // mcp__serverName__toolName
      mcpInfo: { serverName, toolName },
      isMcp: true,
      
      // 从 MCP annotations 读取元数据
      isConcurrencySafe: () => tool.annotations?.readOnlyHint ?? false,
      isReadOnly: () => tool.annotations?.readOnlyHint ?? false,
      isDestructive: () => tool.annotations?.destructiveHint ?? false,
      
      // 使用远端的 inputSchema
      inputJSONSchema: tool.inputSchema,
      
      // checkPermissions 始终返回 passthrough → 走全局规则
      async checkPermissions() {
        return { behavior: 'passthrough', message: 'MCPTool requires permission.' }
      },
      
      // call 实际调用 MCP 协议的 tools/call
      async call(input) { ... }
    }))
  }
)
```

**关键设计**：
- 命名规则：`mcp__<serverName>__<toolName>`，避免与内置工具冲突
- SDK 模式可选跳过前缀：`CLAUDE_AGENT_SDK_MCP_NO_PREFIX`
- MCP 工具的 `checkPermissions` 固定返回 `passthrough`，权限完全由全局规则控制

### 3. 生命周期管理：useManageMCPConnections

这个 React Hook 管理所有 MCP 连接的生命周期：

```
useManageMCPConnections()
  │
  ├── 初始化连接
  │   ├── 读取配置（settings.json 的 mcpServers）
  │   ├── 并行连接所有配置的服务器
  │   └── 更新 AppState.mcpClients
  │
  ├── 重连机制
  │   ├── 监听连接断开事件
  │   ├── 指数退避重试
  │   └── reconnectMcpServer() 手动重连
  │
  ├── 启用/禁用
  │   └── toggleMcpServer() → 断开/重连 + 缓存清理
  │
  └── 清理
      ├── 组件卸载时断开所有连接
      └── 清除 fetchToolsForClient 缓存
```

### 4. 工具池集成：assembleToolPool

MCP 工具最终通过 `assembleToolPool()` 合并到主工具池：

```typescript
// tools.ts
export function assembleToolPool(
  baseTools: Tools,
  mcpClients: MCPServerConnection[]
): Tools {
  const mcpTools = mcpClients.flatMap(client => fetchToolsForClient(client))
  return [...baseTools, ...mcpTools]
}
```

### 5. 提示词集成

MCP 服务器的使用说明注入到系统提示词：

```typescript
// prompts.ts
function getMcpInstructionsSection(mcpClients): string | null {
  const clientsWithInstructions = connectedClients
    .filter(c => c.instructions)
  
  return `# MCP Server Instructions
  
  The following MCP servers have provided instructions:
  
  ## ${client.name}
  ${client.instructions}`
}
```

这是一个 `DANGEROUS_uncachedSystemPromptSection`（每回合重算），因为 MCP 服务器可能在回合间连接或断开。

---

## MCP 配置格式

```json
// settings.json 或 .claude/settings.json
{
  "mcpServers": {
    "my-server": {
      "type": "stdio",
      "command": "node",
      "args": ["./mcp-server.js"],
      "env": { "API_KEY": "..." }
    },
    "remote-server": {
      "type": "sse",
      "url": "https://api.example.com/mcp"
    }
  }
}
```

---

## MCP 相关工具

Claude Code 提供 4 个内置工具来辅助 MCP 使用：

| 工具 | 用途 |
|------|------|
| `MCPTool` | 调用 MCP 服务器的工具（模板，实际由 `fetchToolsForClient` 实例化） |
| `ListMcpResourcesTool` | 列出 MCP 服务器提供的资源 |
| `ReadMcpResourceTool` | 读取 MCP 服务器的资源内容 |
| `McpAuthTool` | 触发 MCP 服务器的 OAuth 认证流程 |

---

## 设计亮点

### 1. 统一工具抽象
MCP 工具转换后与内置工具类型完全一致（都是 `Tool`），共享权限系统、执行管线、并发调度。模型无需区分工具来源。

### 2. annotations 利用
MCP 协议的 `annotations`（`readOnlyHint`、`destructiveHint`、`openWorldHint`）被映射到工具元数据，影响并发调度和权限分类。

### 3. LRU 缓存
`fetchToolsForClient` 使用 LRU 缓存，避免每回合重复调用 `tools/list`。缓存在重连时清除。

### 4. MCP 指令增量
当 `mcpInstructionsDelta` 启用时，MCP 说明通过"附件增量"方式注入，而非整段替换提示词，减少 prompt cache 抖动。

### 5. Agent 级 MCP
Agent 定义支持 `mcpServers` 字段，子 Agent 启动时连接自己的 MCP 服务器，结束时自动清理。

---

## 深读建议

| 如果你想了解... | 读这里 |
|----------------|--------|
| OAuth 认证流程 | `client.ts` 的 OAuth 相关代码 + `McpAuthTool` |
| MCP 资源（非工具）系统 | `ListMcpResourcesTool` + `ReadMcpResourceTool` |
| 工具输出截断策略 | `utils/mcpValidation.ts` + `utils/mcpOutputStorage.ts` |
| MCP 配置加载 | `services/mcp/config.ts` |
| IDE 集成（SDK MCP） | `client.ts` 中 `config.type === 'sdk'` 的分支 |

---

## 下一步

→ [09-Agent.md](./09-Agent.md)：理解多智能体协作的实现
