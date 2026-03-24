# Agent Demo

最小 AI Coding Agent 示例，约 200 行代码。

## 运行

```bash
cd agent-demo
npm install
```

在 `.env` 中配置 API Key：

```
ANTHROPIC_API_KEY=你的key
```

启动：

```bash
node agent.mjs
```

## 文件说明

| 文件 | 作用 |
|------|------|
| agent.mjs | Agent Loop（while 循环 + tool_use 分支） |
| tools.mjs | 工具定义与执行（read_file, write_file, execute_bash） |

## 试试这些指令

- "列出当前目录的文件"
- "读取 package.json"
- "创建一个 hello.js 打印 hello world"
- "运行 node hello.js"
