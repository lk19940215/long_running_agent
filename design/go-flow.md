# Go 指令 — 代码流程与机制

> 实现文件：`src/core/go.js`、`templates/goSystem.md`
> 食谱源目录：`recipes/`（内置）→ 部署到 `.claude-coder/recipes/`（项目）

---

## 一、CLI 入口

```
bin/cli.js  parseArgs(argv) → main()
└── go → main() → go.executeGo(config, input, opts)

参数：
  go                       对话模式 — AI 通过 askUserQuestion 逐步收集需求
  go "需求内容"             自动模式 — AI 分析需求，直接组装方案
  go -r requirements.md    自动模式 — 从文件读取需求
  go --reset               清空 go 记忆（harness_state.json → go section）
```

---

## 二、go.run — 主流程

```
executeGo(config, input, opts)                     ← src/core/go.js
│
├── [--reset] → saveGoState({}) → return
│
├── [-r file] → opts.reqFile = resolve(file)
│
├── 确定模式:
│   ├── 有 input 或 reqFile → 自动模式
│   └── 无参数              → 对话模式
│
├── _executeGoSession(instruction, opts)            → [session 展开]
│   └── content = extractGoContent(collected)
│
├── [content 为空] → 报错 return
│
├── previewAndConfirm(content)                      ← 终端交互
│   ├── 显示方案预览（前 25 行）
│   ├── 用户直接回车 → 确认
│   ├── 用户输入补充 → 追加 "## 补充要求"
│   └── 用户输入 cancel → 取消 return
│
├── writeGoFile(finalContent)                       → .claude-coder/go/go_YYYYMMDDHHMM.md
│
├── saveGoState()                                   → harness_state.json
│   ├── lastFile, lastDomain, lastComponents
│   ├── lastTimestamp
│   └── history[] (保留最近 10 条)
│
└── promptProceedToPlan()
    ├── [y] → plan.run('', { reqFile: filePath })   ← 兜底到 plan
    └── [n] → 提示: claude-coder plan -r <filePath>
```

---

## 三、Go Session — AI 会话执行

```
_executeGoSession(instruction, opts)
└── Session.run('go', config, { execute })          ← core/session.js
    │
    ├── Session._initHooks('go')
    │   └── FEATURE_MAP.go = [STOP, STALL, INTERACTION]
    │       ├── createStallModule()     → 无活动超时中断
    │       └── createAskUserQuestionHook() → 对话模式交互
    │
    └── execute(session):
        ├── buildGoPrompt(instruction, opts)
        │   ├── inputSection:  需求文本 / 文件路径 / "使用对话模式收集"
        │   ├── modeSection:   【自动模式】 / 【对话模式】
        │   ├── recipesPath:   assets.recipesDir()   ← 先查项目级，再查 bundled
        │   └── memorySection: 上次使用记录（仅供参考）
        │
        ├── session.buildQueryOptions(opts)
        │   └── permissionMode: 'plan'              ← 允许 Read/LS/Glob
        │
        ├── buildSystemPrompt('go')
        │   └── coreProtocol.md + goSystem.md
        │
        ├── [自动模式] disallowedTools: ['askUserQuestion']
        │
        └── session.runQuery(prompt, queryOpts)
            └── AI 扫描 recipes/ → 分析/对话 → GO_CONTENT 标记输出
```

---

## 四、食谱系统

### 4.1 目录结构

食谱默认从内置 `recipes/` 目录读取。使用 `claude-coder init --deploy-templates` 可复制到项目的 `.claude-coder/recipes/`，用户可在项目中修改或新增食谱。`assets.recipesDir()` 自动优先查找项目级食谱。

```
.claude-coder/recipes/              ← init 时从内置 recipes/ 部署
├── console/                        ← 管理后台领域
│   ├── manifest.json               ← 领域元数据（组件列表、默认值）
│   ├── base.md                     ← 任务分解指导
│   ├── components/                 ← 功能组件片段
│   │   ├── search.md
│   │   ├── table-list.md
│   │   ├── pagination.md
│   │   ├── modal-form.md
│   │   ├── upload.md
│   │   ├── tree.md
│   │   └── tabs.md
│   └── test/
│       └── crud-e2e.md             ← E2E 测试模板
│
├── h5/                             ← H5 活动页领域
│   ├── manifest.json
│   ├── base.md
│   ├── components/
│   └── test/
│
├── backend/                        ← 后端 API 领域
│   ├── manifest.json
│   ├── base.md
│   ├── components/
│   └── test/
│
└── _shared/                        ← 跨领域共享
    ├── roles/
    │   ├── product.md              ← 产品经理角色指引
    │   ├── developer.md            ← 开发者角色指引
    │   └── tester.md               ← 测试角色指引
    └── test/
        └── report-format.md        ← 测试报告规范（JSON + Markdown）
```

### 4.2 manifest.json 结构

```json
{
  "id": "console",
  "name": "管理后台",
  "description": "企业级管理后台页面开发（搜索、列表、分页、弹窗等 CRUD 场景）",
  "base": "base.md",
  "components": [
    { "id": "search", "label": "搜索框", "description": "...", "file": "components/search.md", "default": true }
  ],
  "test": { "file": "test/crud-e2e.md", "defaultEnabled": true },
  "defaults": { "components": ["search", "table", "pagination", "modal"], "role": "developer", "test": true }
}
```

AI 扫描时：`LS .claude-coder/recipes/` → 发现领域目录 → `Read manifest.json` → 了解可用选项。

### 4.3 食谱定位

食谱是**参考素材**，不是强制模板：
- 有匹配食谱 → 以食谱为基线，结合具体需求适配
- 部分匹配 → 可跨领域组合多个食谱片段
- 无匹配 → AI 凭专业能力独立输出方案
- 食谱目录为空 → go 指令仍可正常工作

### 4.4 扩展新领域

零代码扩展：在 `.claude-coder/recipes/` 下新建目录 + `manifest.json` + 组件 `.md` 即可。AI 下次扫描会自动发现。

### 4.5 部署机制

```
claude-coder init --deploy-templates
├── deployAll()      → templates/ → .claude-coder/assets/
└── deployRecipes()  → recipes/   → .claude-coder/recipes/
    └── 递归复制，跳过已存在的文件（保留用户自定义）
```

部署是可选的（`--deploy-templates` 标志）。默认情况下 `go.js` 通过 `assets.recipesDir()` 直接读取内置食谱，无需部署。部署后可自定义修改，已存在的文件不会被覆盖。

---

## 五、两种模式

### 5.1 自动模式

触发条件：`go "需求内容"` 或 `go -r file`

```
用户 → 需求文本/文件
           │
           ▼
    AI 扫描 recipes/
           │
           ▼
    AI 分析需求 → 匹配领域/组件
           │
           ▼
    AI 阅读选中的食谱 .md
           │
           ▼
    AI 组装完整方案 (GO_CONTENT)
           │
           ▼
    harness 提取内容 → 预览确认
           │
           ▼
    写入 .claude-coder/go/
```

特点：`disallowedTools: ['askUserQuestion']`，AI 不会提问，直接输出。

### 5.2 对话模式

触发条件：`go`（无参数）

```
           AI 扫描 recipes/
                  │
                  ▼
    ┌─ askUserQuestion: 选择领域
    │         │
    │         ▼
    ├─ askUserQuestion: 选择组件
    │         │
    │         ▼
    ├─ askUserQuestion: 确认角色
    │         │
    │         ▼
    ├─ askUserQuestion: 具体需求
    │         │
    │         ▼
    ├─ askUserQuestion: 测试需求
    │         │
    │         ▼
    └─ askUserQuestion: 补充信息
                  │
                  ▼
         AI 阅读食谱 → 组装方案
                  │
                  ▼
         harness 提取 → 预览确认
                  │
                  ▼
         写入 .claude-coder/go/
```

特点：通过 `INTERACTION` hook 启用 `askUserQuestion` 工具，AI 驱动对话。

---

## 六、记忆机制

存储位置：`harness_state.json` 的 `go` section。

```json
{
  "go": {
    "lastFile": ".claude-coder/go/go_202603151430.md",
    "lastDomain": "console",
    "lastComponents": ["搜索框", "数据表格", "分页", "弹窗/表单"],
    "lastTimestamp": "2026-03-15T14:30:00.000Z",
    "history": [
      {
        "timestamp": "2026-03-15T14:30:00.000Z",
        "requirement": "用户管理页面",
        "file": ".claude-coder/go/go_202603151430.md",
        "domain": "console"
      }
    ]
  }
}
```

- `lastDomain` / `lastComponents`：注入到 AI prompt 中作为参考（非强制）
- `history`：保留最近 10 条，用于追溯
- `--reset`：清空整个 go section

---

## 七、与 plan 的衔接

go 的输出物是 `.claude-coder/go/go_YYYYMMDDHHMM.md` — 一份完整的需求方案文档。

衔接方式：

```
go 输出 → .claude-coder/go/go_202603151430.md
                    │
                    ▼
        promptProceedToPlan()
        ├── [y] → plan.run('', { reqFile: filePath })
        └── [n] → 用户稍后手动:
                  claude-coder plan -r .claude-coder/go/go_202603151430.md
```

plan 不需要知道"食谱"概念。go 的输出文件已包含所有食谱内容、用户需求、技术指导和分解建议，plan 按普通需求文件处理即可。

---

## 八、内容提取机制

AI 在文本中使用标记输出方案内容，harness 负责提取和写入文件：

```
AI 文本输出:
  "... 分析完成，以下是方案：
   GO_CONTENT_START
   # 需求方案 — 用户管理
   ## 项目概述
   ...
   GO_CONTENT_END
   方案包含 4 个功能组件..."

extractGoContent():
  ├── 遍历 collected messages
  ├── 拼接所有 assistant text blocks
  ├── 正则匹配 GO_CONTENT_START ... GO_CONTENT_END
  └── 返回中间内容（trim）

writeGoFile():
  ├── ensureGoDir() → .claude-coder/go/
  ├── 生成文件名: go_YYYYMMDDHHMM.md
  └── fs.writeFileSync()
```

AI 不使用 Write 工具。`permissionMode: 'plan'` 限制了写入权限，内容通过文本标记传递给 harness 处理。
