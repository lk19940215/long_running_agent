# Agent Demo

最小 AI Coding Agent 示例。学习 Agent Loop、Tool Calling、Context Management 的底层实现。

## 运行

```bash
cd agent-demo
npm install
```

在 `.env` 中配置：

```
ANTHROPIC_API_KEY=你的key
BASE_URL=https://api.anthropic.com    # 或兼容服务
DEFAULT_MODEL=claude-sonnet-4-20250514
AGENT_DEBUG=true                      # 启用日志
```

启动：

```bash
npm start
```

## 项目结构

```
src/
  agent.mjs              # 主循环（Agent Loop）
  config.mjs             # 配置 + SYSTEM_PROMPT
  core/                  # 运行时基础设施
    ink.mjs              # 终端 UI（Ink / React for CLI）
    logger.mjs           # 文件日志（结构化格式）
    messages.mjs         # 对话历史存储（异步 + 防抖保存）
  tools/                 # 工具系统
    registry.mjs         # define() + 注册表
    index.mjs            # 聚合 + 导出 toolSchemas / executeTool
    file.mjs             # read_file / write_file / edit_file
    search.mjs           # grep + ls（@vscode/ripgrep）
    glob.mjs             # glob — 按文件名模式查找（@vscode/ripgrep）
    ast.mjs              # code_symbols（web-tree-sitter AST 分析）
    bash.mjs             # execute_bash
docs/                    # 学习文档
  core.md                # Agent Loop + 消息协议 + SDK
  tools.md               # 工具设计原理
  advanced.md            # 上下文管理 + 显示层
  semantic-search.md     # AST 分析 + 语义搜索
```

## 核心流程

```
while(true) {
  等待用户输入 → messages.push(user)
  调用 LLM（streaming）→ 实时显示 thinking / text
  if stop_reason === 'tool_use' → 执行工具 → 结果加入 messages → 继续
  if stop_reason === 'end_turn'  → 等待用户
}
```

## 工具列表

| 工具 | 底层 | 用途 |
|------|------|------|
| read | fs/promises | 读取文件 |
| write | fs/promises | 创建新文件 |
| edit | fs/promises | Search & Replace 修改文件 |
| grep | @vscode/ripgrep | 正则搜索代码内容（支持 output_mode） |
| glob | @vscode/ripgrep | 按文件名模式查找文件 |
| ls | @vscode/ripgrep | 列出目录文件树 |
| symbols | web-tree-sitter | AST 分析（列符号 / 获取定义） |
| bash | child_process | 执行 bash 命令 |

## 技术栈

| 库 | 用途 |
|---|------|
| @anthropic-ai/sdk | LLM API（streaming） |
| ink + react | 终端 UI 框架 |
| @vscode/ripgrep | 代码搜索引擎 |
| web-tree-sitter | AST 解析（WASM） |
| @repomix/tree-sitter-wasms | 预构建语法文件 |
