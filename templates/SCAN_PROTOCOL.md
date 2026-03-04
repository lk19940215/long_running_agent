<!-- 
  Scan Protocol for Auto Coder.
  Only injected during scan sessions — not used in coding sessions.
  Contains: scan steps, project_profile.json format.
-->

# 项目扫描协议（首次运行时执行）

当 `project_profile.json` 不存在时，按以下步骤扫描项目并生成配置文件。

## 步骤 1：判断项目类型

检查项目根目录：
- 如果存在代码文件（`.py`, `.js`, `.ts`, `package.json`, `requirements.txt` 等）→ **旧项目**（已有代码）
- 如果根目录几乎为空（仅有 `.auto-coder/` 和少量文件）→ **新项目**（从零开始）

## 步骤 2A：旧项目 — 扫描现有代码，**优先整理文档**

**文档先行**：旧项目在扫描前，必须先确保项目文档可读、可用。文档是后续 session 高质量执行的基础 — AI Agent 会在每次编码前读取文档来了解架构和接口约定。

**文档标准（按优先级）**：
1. **README.md**（必须有）：项目简介、技术栈、目录结构、如何运行。若缺失或过于简略，先补充
2. **架构文档**（推荐有）：如果 `docs/` 中没有架构概述，生成一份简要的架构文档（如 `docs/ARCHITECTURE.md`），包含：模块职责、核心数据流、关键 API 路由。格式用结构化标题，方便 AI 快速检索
3. **API 文档**：如果项目有 API 且无文档，在 docs/ 或 README 中补充主要端点列表

按顺序检查以下文件，**存在则读取**，不存在则跳过：

1. `package.json` → Node.js 项目，读取 dependencies 判断框架（React/Vue/Express 等）
2. `pyproject.toml` / `requirements.txt` / `setup.py` / `setup.cfg` → Python 项目，判断框架（FastAPI/Django/Flask 等）
3. `Cargo.toml` → Rust，`go.mod` → Go，`pom.xml` / `build.gradle` → Java
4. `docker-compose.yml` / `Dockerfile` → 容器化配置，提取服务定义
5. `Makefile` → 构建方式
6. `README.md` / `docs/` → 现有文档（若缺失或过简，**先整理再扫描**；在 session_result.json 的 notes 中记录文档状态）
7. `.env` / `.env.example` → 环境变量配置
8. 运行 `ls` 查看顶层目录结构

根据扫描结果，生成 `.auto-coder/project_profile.json`（格式见下方）。若项目有自定义初始化步骤（如 `python manage.py migrate`），填充 `custom_init` 字段。`existing_docs` 须如实列出项目中**所有**可读文档路径（包括本次扫描中新生成的文档）。

## 步骤 2B：新项目 — 脚手架搭建

1. **优先检查项目根目录是否存在 `requirements.md`**，如果存在，以其中的技术约束和设计要求为准
2. 根据需求（`requirements.md` 或 harness 传入的需求文本），设计技术架构
3. 创建项目目录结构和基础文件（入口文件、配置文件、依赖文件等）
4. 生成 `README.md`（项目用途、技术栈、如何运行）
5. 如果项目包含 2 个以上模块或前后端分离，生成简要架构文档 `docs/ARCHITECTURE.md`（模块职责、数据流、API 路由）
6. 初始化包管理（`npm init` / `pip freeze` 等）
7. 完成后，执行**步骤 2A 的扫描流程**生成 `project_profile.json`

## 步骤 3：生成 tasks.json

根据用户需求和 user prompt 中的「任务分解指导」，将功能分解为任务。
格式参见 CLAUDE.md 中的 tasks.json 章节。

## 步骤 4：收尾

1. 写入 `.auto-coder/session_result.json`（notes 中记录初始化摘要）
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
  "custom_init": ["python manage.py migrate"],
  "scan_files_checked": [
    "package.json", "pyproject.toml", "requirements.txt",
    "Dockerfile", "docker-compose.yml", "Makefile", "README.md"
  ]
}
```

**注意**：
- `existing_docs`：列出项目中所有可读文档路径，Agent 实现前按需读取与任务相关的文档；扫描时须如实填写全部文档
- 字段值必须基于实际扫描结果，**禁止猜测**
- 如果某个字段无法确定，使用 `"none"` 或空数组 `[]`
- `services` 中的 `command` 必须来自实际的配置文件（package.json scripts、Procfile 等）或标准命令
- `mcp_tools` 字段：检查 `.auto-coder/.env` 中的 `MCP_PLAYWRIGHT` 等变量。如果 `.env` 不存在，则全部设为 `false`
- `custom_init`：可选，数组格式。若项目需要额外的初始化命令（如数据库迁移、静态文件收集等），按执行顺序列出。无额外步骤则填 `[]` 或省略
