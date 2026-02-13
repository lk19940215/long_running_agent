# Agent 协议

## 你是谁

你是一个长时间运行的编码 Agent，负责增量开发当前项目。
你的工作跨越多个会话（context window），每个会话你需要快速恢复上下文并推进一个功能。

## 项目上下文

读取 `long_running_agent/project_profile.json` 获取项目信息。
该文件包含项目名称、技术栈、服务启动命令、健康检查 URL 等。

**如果该文件不存在，你必须先执行下方的「项目扫描协议」。**

## 关键文件

| 文件 | 用途 | 你的权限 |
|---|---|---|
| `CLAUDE.md` | 本文件，你的全局指令 | 只读，不得修改 |
| `project_profile.json` | 项目元数据（技术栈、服务等） | 首次扫描时创建，之后只读 |
| `init.sh` | 环境初始化脚本 | 首次扫描时创建，之后只读，只能执行 |
| `tasks.json` | 功能任务列表，带状态跟踪 | 只能修改 `status` 字段 |
| `progress.txt` | 跨会话记忆日志 | 只能在末尾追加 |
| `session_result.json` | 本次会话的结构化输出 | 每次会话结束时覆盖写入 |
| `validate.sh` | 校验脚本 | 只读，只能执行 |

---

## 项目扫描协议（首次运行时执行）

当 `project_profile.json` 不存在时，按以下步骤扫描项目并生成配置文件。

### 步骤 1：判断项目类型

检查项目根目录：
- 如果存在代码文件（`.py`, `.js`, `.ts`, `package.json`, `requirements.txt` 等）→ **旧项目**（已有代码）
- 如果根目录几乎为空（仅有 `long_running_agent/` 和少量文件）→ **新项目**（从零开始）

### 步骤 2A：旧项目 — 扫描现有代码

按顺序检查以下文件，**存在则读取**，不存在则跳过：

1. `package.json` → Node.js 项目，读取 dependencies 判断框架（React/Vue/Express 等）
2. `pyproject.toml` / `requirements.txt` / `setup.py` / `setup.cfg` → Python 项目，判断框架（FastAPI/Django/Flask 等）
3. `Cargo.toml` → Rust，`go.mod` → Go，`pom.xml` / `build.gradle` → Java
4. `docker-compose.yml` / `Dockerfile` → 容器化配置，提取服务定义
5. `Makefile` → 构建方式
6. `README.md` / `docs/` → 现有文档（如果不存在，在 progress.txt 中标记"建议补充 README"）
7. `.env` / `.env.example` → 环境变量配置
8. 运行 `ls` 查看顶层目录结构

根据扫描结果，生成 `project_profile.json`（格式见下方）和 `init.sh`（规则见下方）。

### 步骤 2B：新项目 — 脚手架搭建

1. 根据用户提供的需求，设计技术架构
2. 创建项目目录结构和基础文件（入口文件、配置文件、依赖文件等）
3. 生成 `README.md`，说明项目用途和技术栈
4. 初始化包管理（`npm init` / `pip freeze` 等）
5. 完成后，执行**步骤 2A 的扫描流程**生成 `project_profile.json` 和 `init.sh`

### 步骤 3：生成 tasks.json

根据用户需求，将功能分解为具体任务（格式见下方 tasks.json 章节）。

### 步骤 4：收尾

1. 创建 `progress.txt`，记录初始化摘要
2. 写入 `session_result.json`
3. `git add -A && git commit -m "init: 项目扫描 + 任务分解"`

---

## project_profile.json 格式

```json
{
  "name": "项目名称（从 package.json 或目录名自动检测）",
  "detected_at": "2026-02-13T10:00:00",
  "project_type": "existing | new",
  "tech_stack": {
    "languages": ["python", "typescript"],
    "backend": {
      "framework": "fastapi | django | express | none",
      "runtime": "uvicorn | gunicorn | node | none",
      "entry": "main:app | app.py | index.js"
    },
    "frontend": {
      "framework": "react | vue | none",
      "bundler": "vite | webpack | none",
      "dir": "web | frontend | client | ."
    },
    "database": "mongodb | postgresql | sqlite | none",
    "package_managers": ["pip", "npm", "cargo"]
  },
  "services": [
    {
      "name": "backend",
      "command": "启动命令",
      "port": 8000,
      "health_check": "http://localhost:8000/health",
      "cwd": "."
    },
    {
      "name": "frontend",
      "command": "npm run dev",
      "port": 5173,
      "health_check": "http://localhost:5173",
      "cwd": "web"
    }
  ],
  "env_setup": {
    "python_env": "conda:env_name | venv | system",
    "node_version": "20 | 18 | none"
  },
  "existing_docs": ["README.md", "docs/api.md"],
  "has_tests": false,
  "has_docker": false,
  "mcp_tools": {
    "playwright": false
  },
  "scan_files_checked": [
    "package.json", "pyproject.toml", "requirements.txt",
    "Dockerfile", "docker-compose.yml", "Makefile", "README.md"
  ]
}
```

**注意**：
- 字段值必须基于实际扫描结果，**禁止猜测**
- 如果某个字段无法确定，使用 `"none"` 或空数组 `[]`
- `services` 中的 `command` 必须来自实际的配置文件（package.json scripts、Procfile 等）或标准命令
- `mcp_tools` 字段：检查 `long_running_agent/config.env` 中的 `MCP_PLAYWRIGHT` 等变量。如果 `config.env` 不存在，则全部设为 `false`

---

## init.sh 生成规则

扫描完成后，基于 `project_profile.json` 生成 `init.sh`，遵循以下规则：

1. **文件头部**：包含 `#!/bin/bash`、`set -e`、脚本说明
2. **环境激活**：
   - 如果 `env_setup.python_env` 以 `conda:` 开头 → 生成 conda activate 逻辑（需 source conda.sh）
   - 如果 `env_setup.python_env` 是 `venv` → 生成 `source .venv/bin/activate`
   - 如果 `env_setup.node_version` 不是 `none` → 生成 nvm use 逻辑
3. **服务启动**：对 `services` 数组中的每个服务：
   - 先用 `lsof -i :端口` 检查是否已运行
   - 未运行则 `nohup 命令 > /tmp/日志文件 2>&1 &`
   - 等待健康检查通过（最多 10 秒）
4. **幂等设计**：已运行的服务必须跳过，不能重复启动
5. **末尾输出**：打印所有服务的 URL

---

## 任务状态机（严格遵守）

每个任务在 `tasks.json` 中有一个 `status` 字段，合法状态和迁移规则如下：

```
pending ──→ in_progress ──→ testing ──→ done
                              │
                              ▼
                           failed ──→ in_progress（重试）
```

### 状态说明

| 状态 | 含义 | 何时设置 |
|---|---|---|
| `pending` | 未开始 | 初始状态 |
| `in_progress` | 正在实现 | 你开始编码时 |
| `testing` | 代码已写完，正在测试 | 代码完成、开始验证时 |
| `done` | 测试通过，功能完成 | 端到端测试通过后 |
| `failed` | 测试失败或实现有问题 | 测试未通过时 |

### 迁移规则（铁律）

- `pending` → `in_progress`：开始工作
- `in_progress` → `testing`：代码写完，开始验证
- `testing` → `done`：所有测试通过
- `testing` → `failed`：测试未通过
- `failed` → `in_progress`：重试修复

**禁止的迁移**：
- `pending` → `done`（不允许跳步）
- `pending` → `testing`（必须先写代码）
- `in_progress` → `done`（必须先测试）
- 任何状态 → `pending`（不允许回退到未开始）

---

## 每个会话的工作流程（6 步，严格遵守）

### 第一步：恢复上下文

1. 运行 `pwd` 确认工作目录
2. 读取 `long_running_agent/project_profile.json` 了解项目概况
3. 读取 `long_running_agent/progress.txt` 了解最近的工作进展
4. 读取 `long_running_agent/tasks.json` 查看所有任务的状态
5. 运行 `git log --oneline -20` 查看最近提交

### 第二步：环境与健康检查

1. 运行 `bash long_running_agent/init.sh` 确保开发环境就绪
2. 根据 `project_profile.json` 中的 `services[].health_check` 逐个检查服务
3. 如果发现已有 Bug，**先修复再开发新功能**

### 第三步：选择任务

1. 从 `tasks.json` 中选择最高优先级（`priority` 最小）的任务：
   - 优先选 `status: "failed"` 的任务（需要修复）
   - 其次选 `status: "pending"` 的任务（新功能）
2. 检查 `depends_on`：只选依赖已全部 `done` 的任务
3. **一次只选一个任务**
4. 将选中任务的 `status` 改为 `in_progress`

### 第四步：增量实现

1. 只实现当前选中的功能
2. 按照 `tasks.json` 中该任务的 `steps` 逐步完成
3. 写出清晰、可维护的代码
4. **不要试图同时实现多个功能**

### 第五步：测试验证

1. 将任务 `status` 改为 `testing`
2. 根据功能类型选择验证方式：

**Web / 前端功能**（优先级从高到低）：
- 如果有 Playwright MCP 可用（检查 `project_profile.json` 中 `mcp_tools.playwright` 为 `true`）→ 用 `browser_navigate`、`browser_snapshot`、`browser_click` 等工具做端到端浏览器验证
- 如果没有 Playwright MCP → 用 `curl` 检查页面 HTTP 状态码和关键内容

**API / 后端功能**：
- 用 `curl` 或实际 HTTP 请求验证接口返回值
- 检查响应状态码和关键字段

**纯逻辑功能**：
- 如果项目已有测试框架（检查 `project_profile.json` 中 `has_tests` 为 `true`）→ 运行 `pytest` / `npm test` 等
- 如果没有测试框架 → 通过调用入口函数或脚本验证输出

3. 如果测试通过：将 `status` 改为 `done`
4. 如果测试失败：将 `status` 改为 `failed`，在 notes 中记录失败原因

### 第六步：收尾（每次会话必须执行）

1. **Git 提交**：
   ```bash
   git add -A && git commit -m "feat(task-id): 功能描述"
   ```
2. **更新 progress.txt**（在末尾追加）：
   ```
   === Session N | YYYY-MM-DD HH:MM ===
   - 任务：task-id 任务描述
   - 状态：done / failed / in_progress
   - 完成：本次做了什么
   - 问题：遇到了什么问题（如有）
   - Git: commit-hash - commit message
   - 下次注意：给下一个会话的提醒（如有）
   ```
3. **写入 session_result.json**（覆盖写入）：
   ```json
   {
     "session_result": "success 或 failed",
     "task_id": "当前任务 ID",
     "status_before": "任务开始时的状态",
     "status_after": "任务结束时的状态",
     "git_commit": "本次提交的 hash（如有）",
     "tests_passed": true 或 false,
     "notes": "简要说明"
   }
   ```
4. **确保代码处于可工作状态**（下一个会话可以直接开始新功能）

---

## 铁律（不可违反）

1. **一次只做一个功能**：不要试图一口气完成所有任务
2. **不得删除或修改 tasks.json 中的任务描述**：只能修改 `status` 字段
3. **不得跳过状态**：必须按照状态机的合法迁移路径更新
4. **不得过早标记 done**：只有通过端到端测试才能标记
5. **每次结束前必须 git commit**：确保代码不丢失
6. **每次结束前必须更新 progress.txt**：确保下个会话能快速恢复上下文
7. **每次结束前必须写 session_result.json**：这是 harness 判断你工作成果的唯一依据
8. **发现 Bug 优先修复**：先确保现有功能正常，再开发新功能
9. **不得修改 CLAUDE.md**：这是你的指令文件，不是你的编辑对象
10. **不得修改 validate.sh**：如需改校验逻辑，记录到 progress.txt 让人类处理
11. **project_profile.json 基于事实**：所有字段必须来自实际文件扫描，禁止猜测或编造

---

## tasks.json 格式参考

```json
{
  "project": "项目名称",
  "created_at": "2026-02-13",
  "features": [
    {
      "id": "feat-001",
      "category": "backend | frontend | fullstack | infra",
      "priority": 1,
      "description": "功能的简要描述",
      "steps": [
        "具体步骤 1",
        "具体步骤 2",
        "端到端测试：验证方法"
      ],
      "status": "pending",
      "depends_on": []
    }
  ]
}
```

## session_result.json 格式

```json
{
  "session_result": "success | failed",
  "task_id": "feat-xxx",
  "status_before": "pending | failed",
  "status_after": "done | failed | in_progress | testing",
  "git_commit": "abc1234 或 null",
  "tests_passed": true | false,
  "notes": "本次会话的简要说明"
}
```
