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

启动交互模式：

```bash
npm start
```

Headless 模式（非交互）：

```bash
node --no-deprecation src/agent.mjs -p "在项目中搜索所有 export 的函数" | "分析 test-example/shopping-cart 所有文件，找出潜在 bug，然后帮我修
复" | "我想了解 test-example 下三个子项目的代码质量，哪些函数缺少错误处理" | "分析 src/tools 目录下每个工具文件的功能和参数"
```

运行评估：

```bash
npm run eval                     # 跑全部 16 个 case
npm run eval:quick               # 5 个核心 case，快速验证
npm run eval -- --list           # 列出所有 case
npm run eval -- py_fix --log     # 指定 case + 开启日志
npm run eval -- --repeat 3       # 每个 case 跑 3 次（Pass@k）
npm run eval -- --save-baseline  # 保存结果为 baseline（下次自动对比）
```

## 项目结构

```
src/
  agent.mjs              # 交互模式入口（Ink UI + AgentCore）
  eval.mjs               # 评估模式入口
  eval/                  # 评估框架
    cases.mjs            # 16 个测试用例（JS/Python/Go/Rust + 多轮 + SubAgent）
    runner.mjs           # 运行器 + 多维评分 + Pass@k + 沙盒管理
    report.mjs           # 报告生成 + Baseline 对比
  config.mjs             # 配置 + SYSTEM_PROMPT
  core/                  # 运行时基础设施
    agent-core.mjs       # Agent 引擎（纯逻辑，支持自定义工具集）
    ink.mjs              # 终端 UI（Ink / React for CLI）
    logger.mjs           # 文件日志（结构化格式）
    messages.mjs         # 对话历史存储（异步 + 防抖保存）
  tools/                 # 工具系统
    registry.mjs         # define() + 注册表
    index.mjs            # 聚合 + 导出 toolSchemas / executeTool
    file.mjs             # read / write / edit / multi_edit
    grep.mjs             # grep（@vscode/ripgrep）
    ls.mjs               # ls（@vscode/ripgrep）
    glob.mjs             # glob（@vscode/ripgrep）
    symbols.mjs          # symbols（web-tree-sitter，17 种语言）
    bash.mjs             # bash
    task.mjs             # task — SubAgent 委派
test-example/            # 评估用测试项目
  shopping-cart/         # JS — 购物车
  string-utils/          # JS — 字符串工具
  todo-app/              # JS — Todo 应用
  py-utils/              # Python — 计算器 + 验证器
  go-api/                # Go — HTTP API
  rust-lib/              # Rust — 泛型栈 + Trait
eval-reports/            # 评估报告输出
docs/                    # 学习文档
  core.md                # Agent Loop + 消息协议 + SDK
  tools.md               # 工具设计原理
  advanced.md            # 上下文管理 + 显示层
  semantic-search.md     # AST 分析 + 语义搜索
  eval.md                # 评估体系（SWE-bench + Eval Harness）
```

## 架构

```
                ┌─────────────────┐
                │   AgentCore     │  纯逻辑引擎
                │  (agent-core)   │  batch / stream 调用
                └────────┬────────┘
          ┌──────────────┤──────────────┐
          ▼              ▼              ▼
  ┌─────────────┐  ┌──────────┐  ┌───────────┐
  │  agent.mjs  │  │ eval.mjs │  │  task 工具 │
  │  交互模式   │  │ 评估模式 │  │  SubAgent │
  │  Ink UI     │  │ 自动评分 │  │  只读工具  │
  └─────────────┘  └──────────┘  └───────────┘
```

## 核心流程（交互模式）

```
while(true) {
  等待用户输入
  AgentCore.run(input, callbacks) → 流式 UI + 工具调用循环
  完成 → 等待用户
}
```

## 评估模式

```
加载 test case → 备份 test-example
  ↓
for each case (× repeat):
  恢复沙盒 → AgentCore.run(input, temperature=0) → 验证 → 多维评分
  ↓
生成报告 → eval-reports/  (对比 baseline 如有)
```

评分维度：正确性 50 + 工具选择 20 + 效率 20 + 无错误 10 = 100

## 工具列表

| 工具 | 底层 | 用途 |
|------|------|------|
| read | fs/promises | 读取文件 |
| write | fs/promises | 创建新文件 |
| edit | fs/promises | Search & Replace 修改文件 |
| multi_edit | fs/promises | 同一文件多处 Search & Replace |
| grep | @vscode/ripgrep | 正则搜索代码内容（支持 output_mode） |
| glob | @vscode/ripgrep | 按文件名模式查找文件 |
| ls | @vscode/ripgrep | 列出目录文件树 |
| symbols | web-tree-sitter | AST 分析（17 种语言：JS/TS/Python/Rust/Go/Java/C/C++ 等） |
| bash | child_process | 执行 bash 命令 |
| task | AgentCore | SubAgent 委派（独立上下文，只读工具集） |

## 技术栈

| 库 | 用途 |
|---|------|
| @anthropic-ai/sdk | LLM API（streaming） |
| ink + react | 终端 UI 框架 |
| @vscode/ripgrep | 代码搜索引擎 |
| web-tree-sitter | AST 解析（WASM） |
| @repomix/tree-sitter-wasms | 预构建语法文件 |
