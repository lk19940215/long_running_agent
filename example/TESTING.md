# Claude Coder 本地测试指南

本目录用于在开发阶段测试 claude-coder 工具的完整流程，无需发包或 npm link。

## 前置条件

```bash
# 在项目根目录安装依赖（含 peerDependency: @anthropic-ai/claude-agent-sdk）
cd <project-root>
npm install
```

确保已有可用的 API Key（Claude / GLM / DeepSeek 等）。

## 测试流程

所有命令在 `example/` 目录下执行，通过 `node ../bin/cli.js` 调用本地开发版 CLI。

### 0. 进入测试目录

```bash
cd example
```

### 1. 配置模型（首次）

```bash
node ../bin/cli.js setup
```

按提示选择模型提供商、填入 API Key。配置会写入 `example/.claude-coder/.env`。

### 2. 预览模式（不消耗 token）

```bash
node ../bin/cli.js run --dry-run
```

验证 CLI 参数解析、文件读取等基础流程是否正确。

### 3. 单次运行（scan + add + 编码）

```bash
node ../bin/cli.js run --max 1
```

这会依次执行：
1. **scan** — 识别为新项目，搭建脚手架，生成 `project_profile.json`
2. **用户确认** — 提示是否分解任务
3. **add** — 读取 `requirements.md`，分解为 `tasks.json`
4. **coding session** — 执行第一个任务

### 4. 手动追加任务

```bash
node ../bin/cli.js add "新增一个健康检查接口"
```

### 5. 从 requirements.md 追加任务

```bash
node ../bin/cli.js add -r
```

### 6. 查看任务状态

```bash
node ../bin/cli.js status
```

### 7. 多 session 运行

```bash
node ../bin/cli.js run --max 3
```

### 8. 校验上次 session

```bash
node ../bin/cli.js validate
```

## 清理测试环境

重置到初始状态，可重新测试完整流程：

```bash
# 删除运行时文件
rm -rf .claude-coder/ .mcp.json .claude/

# 恢复 git（如果在 git 管理下）
git checkout -- .
git clean -fd
```

Windows PowerShell：

```powershell
Remove-Item -Recurse -Force .claude-coder, .mcp.json, .claude -ErrorAction SilentlyContinue
```

## 目录说明

| 文件 | 用途 | git 状态 |
|------|------|----------|
| `requirements.md` | 示例需求输入 | 已提交 |
| `TESTING.md` | 本文件，测试指南 | 已提交 |
| `.claude-coder/` | 运行时数据（自动生成） | gitignored |
| `.mcp.json` | MCP 配置（自动生成） | gitignored |
