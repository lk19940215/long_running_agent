# Claude Coder

**中文** | [English](docs/README.en.md) | [在线文档](https://lk19940215.github.io/claude-coder/#/quick-start)

> 🚀 **一句话需求 → 完整项目。AI 编码数小时，你只需一行命令。**

**觉得好用？回来点个 ⭐ 吧！** 你的 Star 是我持续维护的最大动力。

```bash
claude-coder run "用 React + Express 做一个带登录的 Todo 应用"
```

```
✓ 项目扫描完成
✓ 分解为 8 个任务
▸ Session 1/8: 搭建项目脚手架 .......... done ✅
▸ Session 2/8: 实现用户注册/登录 ........ done ✅
▸ Session 3/8: Todo CRUD ................ done ✅
  ...
✓ 全部任务完成，8 次提交已推送 🎉
```

你下一行命令，Claude Coder 拆需求、写代码、跑测试、提交 Git，**循环执行直到交付**。中间卡住了？自动回滚重试。JSON 损坏了？AI 自修复。你只需要等通知。

---

## 💡 你是不是也遇到过这些问题？

### 🎨 "我不会设计 UI，做出来的页面又丑又乱"

> 你是后端出身，或者独立开发者，没有设计师搭档。每次做前端页面都在找模板、抄样式，结果还是不满意。

> ⚠️ **Windows 已知限制**：`.pen` 文件的跨文件组件引用（`ref: "sys:header"`）在 Windows 的 Pencil 插件中不受支持（Pencil应用也不支持）。Mac 桌面应用、插件均正常预览。建议在 Mac 上使用 design 命令生成和预览设计稿。跨文件变量引用（`$sys:color.bg`）和同文件内组件引用在所有平台均可用。

**✨ Claude Coder 的解法：**

```bash
claude-coder design "后台管理系统：用户管理、数据看板、系统设置"
```

AI 自动生成专业的 `.pen` UI 设计稿 → 完整的配色、字体、组件规范 → 编码阶段 AI **自动参考设计稿还原 UI** 🎯


### 😤 "AI 写的代码和设计稿差了十万八千里"

> 用了 AI 编码工具，代码能跑，但 UI 还原度惨不忍睹。颜色、间距、布局全凭 AI 想象。

**✨ Claude Coder 的解法：**

设计文件通过 `design_map.json` 索引 → 编码时 AI 自动读取对应 `.pen` 设计文件 → 提取颜色、间距、组件结构 → **像素级还原设计意图** 🎯

### 💥 "AI 编码工具总是中途崩、半途而废"

> 用过其他 AI 编码工具，写了几个文件就卡住了、报错了、或者把之前的代码覆盖了。每次都要手动介入。

**✨ Claude Coder 的解法：**

```
失败 → 🔄 自动回滚到上一个好的提交
再试 → 🛠️ AI 自修复损坏的 JSON
又失败 → ⏭️ 自动跳过，继续下一个任务
```

多 Session 编排 + 活跃度监控，**Agent 连续编码数小时不中断** ⚡

### 🧹 "AI 写的代码越堆越乱，没人 Review"

> AI 编码工具产出大量代码，但没有人审查质量。冗余逻辑、重复代码越积越多，最后不敢改。

**✨ Claude Coder 的解法：**

```
Session 3 完成 ✅ → 🧹 自动审查最近代码变更
发现冗余 → 重构优化 → 自动提交 style: auto simplify
Session 4 继续 ▸
```

每隔 N 个 session 自动触发 AI 代码审查（`simplify`），审查累积变更、消除冗余、优化结构，**编码和审查一体化** 🎯

### 🤹 "一个人要干前端、后端、测试、部署"

> 独立开发者或者小团队，一个人要搞定所有环节。

**✨ Claude Coder 的解法：**

```
📝 需求描述  →  🎨 UI 设计  →  📋 任务分解  →  💻 编码实现  →  ✅ 测试验证  →  📦 Git 提交
```

**全流程自动化**，你只需要描述你想要什么。

---

## 🔗 完整工作流

```
  📝 需求输入                                         🎉 最终交付
     │                                                    ▲
     ▼                                                    │
 ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────────────────┐
 │ 🎨      │    │ 📋      │    │ 🔍      │    │ 🔄 run (循环)        │
 │ design  │ →  │  plan   │ →  │  init   │ →  │  ┌──────────────┐   │
 │ UI 设计 │    │ 分解任务 │    │ 扫描项目 │    │  │ Session N    │   │
 │ .pen    │    │ tasks   │    │ profile │    │  │ 💻 编码       │   │
 └─────────┘    └─────────┘    └─────────┘    │  │ ✅ 验证       │   │
     │                                         │  │ 📦 提交       │   │
     └──── 📄 design_map.json ─────────────→  │  └──────┬───────┘   │
                                               │         │           │
                                               │  每 N 次 → 🧹 审查  │
                                               │  失败   → 🔄 回滚   │
                                               └─────────────────────┘
```

**关键链路：design → plan → run → simplify 全程贯通。** 设计稿通过 `design_map.json` 索引，编码阶段 AI 自动参考。每隔 N 个成功 session 自动触发代码审查，编码和质量保障一体化。

---

## ⚡ 30 秒上手

```bash
# 1️⃣ 安装
npm install -g @anthropic-ai/claude-agent-sdk
npm install -g claude-coder

# 2️⃣ 配置（交互式，选模型 + API）
claude-coder setup

# 3️⃣ 跑起来
cd your-project
claude-coder init
claude-coder run "实现用户注册和登录功能"
```

就这么简单。

---

## 🏆 核心能力

| | 能力 | 说明 |
|---|------|------|
| 📝 | **需求 → 代码** | 一句话或需求文档输入，自动分解任务、逐个编码实现 |
| 🎨 | **AI 生成 UI 设计** | `design` 命令生成 `.pen` 设计稿，编码时 AI 自动参考 |
| 🔄 | **长时间自运行** | 多 Session 编排 + 活跃度监控，连续编码数小时不中断 |
| 🛡️ | **自愈与容错** | 校验失败自动回滚，损坏文件 AI 修复，连续失败自动跳过 |
| 🧹 | **自动代码审查** | 每 N 个 session 自动审查累积变更，消除冗余、优化结构 |
| 🔌 | **任意模型** | Claude、DeepSeek、GLM、Qwen 或任何兼容 API |
| ⚙️ | **Hook 提示注入** | JSON 配置注入行为引导，零代码扩展 AI 规则 |

---

## 📖 命令速查

| 命令 | 说明 |
|------|------|
| `setup` | 🔧 交互式配置（模型、MCP、安全限制） |
| `init` | 🔍 初始化项目（扫描技术栈、生成 profile） |
| `go [需求]` | 💬 AI 驱动的需求收集与方案组装 |
| `plan "需求"` | 📋 生成计划并分解任务 |
| `design [需求]` | 🎨 AI 生成 UI 设计（`.pen` 文件） |
| `design --type fix` | 🛠️ 修复不合规的设计文件 |
| `run [需求]` | 🚀 自动编码循环 |
| `simplify [focus]` | 🧹 代码审查和简化 |
| `auth [url]` | 🔐 配置浏览器测试工具 |
| `status` | 📊 查看进度和成本 |

**常用选项**：`--max N` 限制 session 数 / `--pause N` 每 N 个暂停确认 / `--dry-run` 预览 / `--model M` 指定模型

---

## 🤖 模型推荐

**长时间自运行（最稳定）**
```bash
ANTHROPIC_DEFAULT_OPUS_MODEL=glm-5
ANTHROPIC_DEFAULT_SONNET_MODEL=qwen3-coder-next
ANTHROPIC_MODEL=kimi-k2.5
```

**自用（最强）**
```bash
ANTHROPIC_DEFAULT_OPUS_MODEL=qwen3-max-2026-01-23
ANTHROPIC_DEFAULT_SONNET_MODEL=qwen3-coder-next
ANTHROPIC_MODEL=glm-5
```

---

## 📚 深入了解

| 文档 | 说明 |
|------|------|
| [🏗️ 技术架构](design/ARCHITECTURE.md) | Session 类、模块关系、Prompt 注入 |
| [🪝 Hook 机制](design/hook-mechanism.md) | 三级匹配、配置格式 |
| [🛡️ Session 守护](design/session-guard.md) | 倒计时检测、状态追踪 |
| [💬 Go 指令](design/go-flow.md) | 需求组装、食谱系统 |
| [🎨 UI 设计流程](design/ui-design-flow.md) | design 命令、与编码联动 |
| [🌐 浏览器测试](docs/PLAYWRIGHT_CREDENTIALS.md) | Playwright / Chrome DevTools |
| [📖 SDK 参考](docs/CLAUDE_AGENT_SDK_GUIDE.md) | Claude Agent SDK 接口 |

---

<details>
<summary>📁 项目结构</summary>

```
your-project/
  .claude-coder/
    .env                    # 模型配置
    project_profile.json    # 项目扫描结果
    tasks.json              # 任务列表 + 状态
    design/                 # UI 设计文件
      design_map.json       # 设计映射表
      pages/                # 页面设计（.pen）
    go/                     # go 指令输出方案
    recipes/                # 食谱库（可选）
    .runtime/
      harness_state.json    # 运行状态
      logs/                 # session 日志
```

</details>

## ❓ FAQ

**中断恢复**：直接重新运行 `claude-coder run`，从上次中断处继续。

**跳过任务**：将 `tasks.json` 中该任务的 `status` 改为 `done`。

**长时间无响应**：超过阈值后自动中断并重试。通过 `claude-coder setup` 调整超时。

---

---


📖 [Anthropic: Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)

MIT License
