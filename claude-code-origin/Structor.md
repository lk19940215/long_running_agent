# Restored Claude Code Source

> 并非上游仓库的原始状态。部分文件无法仅凭 source map 恢复，使用了兼容 shim 或降级实现。

[仓库地址](https://github.com/oboard/claude-code-rev)
[仓库地址](https://github.com/waiterxiaoyy/Deep-Dive-Claude-Code)
[仓库地址](https://github.com/instructkr/claw-code)

# 疑问

    1. node如何像web一样打debugger来调试代码？


## 运行方式

环境要求：Bun 1.3.5+、Node.js 24+

```bash
bun install        # 安装依赖（含 shims 本地包）
bun run dev        # 启动还原后的 CLI
bun run version    # 输出版本号
bun run dev --help # 查看完整命令树
```

## 当前状态

- `bun install` / `bun run version` / `bun run dev` 均可成功执行
- CLI 通过还原后的真实 bootstrap 路径启动
- 部分模块仍保留 fallback，行为可能与原始实现不同
- 剩余缺口主要集中在私有/原生集成（shim 或降级行为）

---

## 项目架构

### 技术栈

| 层面 | 技术 |
|------|------|
| 运行时 | Bun (构建/运行/包管理) |
| 语言 | TypeScript (ESM, `.ts` / `.tsx`) |
| UI 框架 | React + 自定义 Ink 终端渲染器 |
| 状态管理 | 轻量 subscribe/getState/setState (非 Redux) |
| Schema | Zod v4 |
| API SDK | `@anthropic-ai/sdk` |
| 构建宏 | `bun:bundle` 的 `feature()` 条件编译 |
| 插件协议 | MCP (Model Context Protocol) |

### 启动流程

```
bootstrap-entry.ts          # 最小引导：注入 MACRO 全局宏
  └─ bootstrapMacro.ts      # 在 globalThis 设置 VERSION/PACKAGE_URL 等
  └─ entrypoints/cli.tsx    # CLI 异步入口：Commander 参数解析
       └─ main.tsx          # 主编排：性能埋点 → MDM 预读 → 钥匙串预取 → REPL 启动
            ├─ entrypoints/init.ts   # 运行时初始化（遥测/策略/MCP 等）
            ├─ screens/REPL.tsx      # 交互式 REPL 主屏
            └─ QueryEngine.ts        # 会话查询引擎（驱动模型往返）
                 └─ query.ts         # 单次请求管道（消息组装/compact/重试）
```

### 仓库目录结构

```
claude-code-rev-main/
├── package.json              # Bun 项目配置 (999.0.0-restored)
├── tsconfig.json             # TypeScript 配置
├── bun.lock                  # 依赖锁文件
├── AGENTS.md                 # AI Agent 贡献指南
├── image-processor.node      # 预编译原生扩展 (darwin)
│
├── src/                      # 主体源码 (~2000 个文件)
│   ├── main.tsx              # 主入口编排
│   ├── commands.ts           # 命令注册表（汇总所有斜杠命令）
│   ├── tools.ts              # 工具注册表（汇总所有 AI 工具）
│   ├── Tool.ts               # 工具核心类型与 buildTool 工厂
│   ├── QueryEngine.ts        # 会话查询引擎
│   ├── query.ts              # 单次查询管道
│   ├── context.ts            # 系统提示上下文（Git/用户信息注入）
│   ├── cost-tracker.ts       # Token 费用追踪与格式化
│   ├── Task.ts               # 任务类型定义与 TaskContext
│   ├── bootstrap-entry.ts    # 最小引导入口
│   ├── bootstrapMacro.ts     # 全局构建宏（VERSION 等）
│   └── dev-entry.ts          # 开发入口（导入完整性检查）
│
├── shims/                    # 本地 npm 包替身（7 个子包）
└── vendor/                   # 原生模块的 TS 封装（4 个子模块）
```

---

### `src/` 模块详解

#### `commands/` — 斜杠命令实现 (~87 个命令)

用户通过 `/command` 触发的交互式命令。每个子目录导出满足 `Command` 接口的描述符，由 `commands.ts` 统一注册。

```
commands/
├── add-dir/          # 添加工作目录
├── agents/           # 自定义 Agent 管理
├── bridge/           # IDE/远程桥接控制
├── chrome/           # Chrome 浏览器集成
├── clear/            # 清屏
├── compact/          # 手动压缩上下文
├── config/           # 配置查看与修改
├── context/          # 上下文可视化
├── copy/             # 复制最近回复
├── desktop/          # 桌面应用联动
├── diff/             # 文件差异查看
├── doctor/           # 环境诊断
├── effort/           # 思考力度调节
├── exit/             # 退出 CLI
├── export/           # 导出对话历史
├── fast/             # 快速模式切换
├── feedback/         # 反馈提交
├── help/             # 帮助信息
├── hooks/            # Hook 配置管理
├── ide/              # IDE 集成设置
├── install-github-app/ # GitHub App 安装向导
├── login/logout/     # 登录/登出
├── mcp/              # MCP 服务器管理
├── memory/           # 记忆文件管理
├── model/            # 模型切换
├── plan/             # 计划模式
├── plugin/           # 插件管理（安装/发现/市场）
├── resume/           # 恢复历史会话
├── review/           # 代码审查
├── sandbox-toggle/   # 沙箱模式开关
├── session/          # 会话管理
├── skills/           # 技能管理
├── stats/            # 统计信息
├── status/           # 状态查看
├── tag/              # 会话标签
├── tasks/            # 后台任务管理
├── theme/            # 主题切换
├── thinkback/        # 思维回放
├── upgrade/          # 版本升级
├── usage/            # 用量查看
├── vim/              # Vim 模式开关
├── voice/            # 语音输入
├── ...               # 更多命令
└── [18 个 stub]      # 禁用的内部/实验命令 (index.js)
    ├── share/            # 分享功能
    ├── teleport/         # 传送功能
    ├── bughunter/        # Bug 猎手
    ├── onboarding/       # 新手引导
    ├── summary/          # 摘要生成
    ├── autofix-pr/       # 自动修复 PR
    ├── issue/            # Issue 处理
    ├── debug-tool-call/  # 工具调用调试
    ├── ant-trace/        # 内部追踪
    ├── mock-limits/      # 模拟限制
    ├── reset-limits/     # 重置限制
    ├── good-claude/      # 奖励机制
    ├── oauth-refresh/    # OAuth 刷新
    ├── env/              # 环境变量
    ├── break-cache/      # 缓存清除
    ├── perf-issue/       # 性能问题
    ├── ctx_viz/          # 上下文可视化
    └── backfill-sessions/ # 回填会话
```

**模式**：`Command 描述符 + 动态 import()` 懒加载实现

#### `tools/` — AI 模型可调用的工具 (~48 种)

LLM 在对话中调用的工具集合。每个工具通过 `buildTool` 工厂创建，包含 Zod schema、执行逻辑与可选的 Ink 进度 UI。

```
tools/
├── AgentTool/            # 子 Agent 派遣与任务委托
├── AskUserQuestionTool/  # 向用户提问
├── BashTool/             # Bash 命令执行
├── FileReadTool/         # 文件读取
├── FileWriteTool/        # 文件写入
├── FileEditTool/         # 文件编辑（搜索替换）
├── GlobTool/             # 文件模式匹配搜索
├── GrepTool/             # 正则内容搜索
├── LSPTool/              # LSP 语言服务调用
├── MCPTool/              # MCP 工具调用代理
├── NotebookEditTool/     # Jupyter Notebook 编辑
├── WebFetchTool/         # 网页内容获取
├── WebSearchTool/        # 网页搜索
├── SkillTool/            # 技能执行
├── TaskCreateTool/       # 后台任务创建
├── TaskOutputTool/       # 任务输出获取
├── TeamCreateTool/       # 队友创建
├── TodoWriteTool/        # TODO 列表管理
├── PowerShellTool/       # PowerShell 执行 (Windows)
├── ScheduleCronTool/     # 定时任务调度
├── SendMessageTool/      # 消息发送
├── EnterPlanModeTool/    # 进入计划模式
├── ExitPlanModeTool/     # 退出计划模式
├── EnterWorktreeTool/    # 进入工作树
├── ExitWorktreeTool/     # 退出工作树
├── ConfigTool/           # 配置修改
├── RemoteTriggerTool/    # 远程触发
├── shared/               # 工具间共享逻辑
└── ...
```

**模式**：`buildTool + Zod schema + ToolUseContext + 可选 React UI`

#### `components/` — Ink/React 终端 UI 组件 (~400+ 文件)

基于自定义 Ink 渲染器的终端 UI 组件库。

```
components/
├── App.tsx                    # 顶层应用包装
├── MessageResponse.tsx        # 消息响应容器
├── TextInput.tsx              # 文本输入框
├── VirtualMessageList.tsx     # 虚拟滚动消息列表
├── Markdown.tsx               # Markdown 渲染
├── HighlightedCode.tsx        # 代码高亮
├── Spinner.tsx                # 加载动画
│
├── messages/                  # 各类消息气泡 (~30 种)
│   ├── UserTextMessage.tsx        # 用户文本消息
│   ├── AssistantTextMessage.tsx   # 助手回复
│   ├── AssistantToolUseMessage.tsx # 工具调用展示
│   ├── PlanApprovalMessage.tsx    # 计划审批
│   ├── RateLimitMessage.tsx       # 速率限制提示
│   └── ...
│
├── PromptInput/               # 主输入区
│   ├── PromptInput.tsx            # 输入框主体
│   ├── PromptInputHelpMenu.tsx    # 帮助菜单
│   ├── Notifications.tsx          # 通知栏
│   └── VoiceIndicator.tsx         # 语音指示器
│
├── LogoV2/                    # 品牌/欢迎/营销条
├── Settings/                  # 设置面板（配置/用量/状态）
├── design-system/             # 设计系统基础组件
│   ├── Dialog.tsx / Tabs.tsx / ProgressBar.tsx / FuzzyPicker.tsx ...
│
├── diff/                      # 文件差异查看
├── tasks/                     # 后台任务状态 UI
├── agents/                    # Agent 列表与创建向导
├── mcp/                       # MCP 服务器管理 UI
├── sandbox/                   # 沙箱配置 UI
├── hooks/                     # Hook 配置 UI
├── wizard/                    # 多步向导框架
└── ui/                        # 通用 UI 原子组件
```

#### `services/` — 后台服务层 (~150 文件)

可复用的后台能力，供 QueryEngine、REPL、工具等共用。

```
services/
├── api/                       # Claude API 交互
│   ├── client.ts                  # HTTP 客户端
│   ├── claude.ts                  # Claude 特定逻辑
│   ├── bootstrap.ts               # API 启动配置
│   ├── filesApi.ts                # 文件上传 API
│   └── withRetry.ts               # 重试与降级策略
│
├── mcp/                       # MCP 协议实现
│   ├── MCPConnectionManager.tsx   # 连接管理器
│   ├── client.ts                  # MCP 客户端
│   ├── config.ts                  # 配置规范化
│   └── auth.ts                    # MCP 鉴权
│
├── analytics/                 # 事件分析与遥测
│   ├── index.ts                   # 公共 API（零依赖设计）
│   └── growthbook.ts              # Feature flag 服务
│
├── compact/                   # 上下文压缩
│   ├── compact.ts                 # 压缩核心逻辑
│   ├── autoCompact.ts             # 自动压缩策略
│   └── reactiveCompact.ts        # 响应式压缩
│
├── oauth/                     # OAuth 认证
├── lsp/                       # LSP 语言服务管理
├── plugins/                   # 插件安装管理
├── skillSearch/               # 技能搜索（本地+远程）
├── tools/                     # 工具执行管线
│   ├── toolExecution.ts           # 执行调度
│   └── StreamingToolExecutor.ts   # 流式执行器
│
├── contextCollapse/           # 上下文折叠 (feature flag)
├── remoteManagedSettings/     # 远端托管设置
├── voice.ts                   # 语音输入服务
├── notifier.ts                # 系统通知
├── tokenEstimation.ts         # Token 估算
├── SessionMemory.ts           # 会话记忆
└── autoDream.ts               # 自动梦境模式
```

#### `hooks/` — React Hooks (~105 文件)

```
hooks/
├── useTextInput.ts            # 文本输入管理
├── useCanUseTool.tsx          # 工具可用性检查
├── useRemoteSession.ts        # 远程会话管理
├── useMergedTools.ts          # 工具合并（内置+MCP+插件）
├── useCommandKeybindings.tsx  # 命令键位绑定
├── useIDEIntegration.tsx      # IDE 集成
│
├── notifs/                    # 通知类 hooks
│   ├── useStartupNotification.ts    # 启动通知
│   ├── useMcpConnectivityStatus.tsx # MCP 连接状态
│   ├── usePluginInstallationStatus.tsx
│   ├── useRateLimitWarningNotification.tsx
│   └── ...
│
└── toolPermission/            # 工具权限
    ├── PermissionContext.ts       # 权限上下文
    └── handlers/                  # 权限处理器（交互/协调器/swarm）
```

#### `utils/` — 工具函数库 (~574 文件)

```
utils/
├── settings/                  # 配置读写与校验
│   ├── settings.ts                # 核心 settings 读写
│   ├── applySettingsChange.ts     # 变更应用
│   └── mdm/                      # MDM 企业管理
│
├── permissions/               # 路径与权限校验
├── shell/                     # Shell 提供方与安全校验
├── bash/                      # Bash AST 解析
├── git/                       # Git 辅助函数
├── messages.ts                # 消息工厂函数
├── secureStorage/             # 钥匙串/安全存储
├── processUserInput/          # 用户输入解析
├── swarm/                     # 多队友/后台终端
├── plugins/                   # 插件加载工具
├── computerUse/               # 计算机使用工具渲染
├── claudeInChrome/            # Chrome 集成工具
└── startupProfiler.ts         # 启动性能埋点
```

#### `ink/` — 自定义终端渲染器 (~100 文件)

基于 React 的终端 UI 渲染引擎，替代标准 Ink 库。

```
ink/
├── ink.tsx                    # 渲染器入口
├── reconciler.ts              # React Reconciler 实现
├── renderer.ts                # 终端帧输出
├── terminal.ts                # 终端控制
├── layout/
│   └── yoga.ts                # Yoga 布局引擎桥接
├── components/
│   ├── App.tsx                # 根组件
│   ├── Box.tsx / Text.tsx     # 基础布局/文本
│   ├── Button.tsx / Link.tsx  # 交互组件
│   ├── ScrollBox.tsx          # 滚动容器
│   └── ErrorOverview.tsx      # 错误展示
└── dom.ts                     # 虚拟 DOM 节点
```

#### `state/` — 应用状态管理

```
state/
├── AppStateStore.ts           # Store 实现 (subscribe/getState/setState)
├── AppState.tsx               # AppState 类型定义与 Provider
├── store.ts                   # Store 工厂
├── selectors.ts               # 状态选择器
└── onChangeAppState.ts        # 状态变更副作用
```

#### `context/` — React Context 提供者

```
context/
├── notifications.tsx          # 通知队列
├── mailbox.tsx                # 消息邮箱
├── modalContext.tsx           # 弹层/对话框
├── overlayContext.tsx         # 浮层
├── promptOverlayContext.tsx   # 输入区浮层
├── QueuedMessageContext.tsx   # 排队消息
├── voice.tsx                  # 语音状态
├── stats.tsx                  # 统计数据
└── fpsMetrics.tsx             # FPS 性能指标
```

#### 其它核心模块

| 目录 | 职责 |
|------|------|
| `bridge/` | REPL ↔ IDE/远端桥通信：API 客户端、消息编解码、JWT/工作密钥、HybridTransport |
| `coordinator/` | 协调器模式：为「工人」Agent 限制工具集并注入专用上下文 |
| `remote/` | 远程会话：WebSocket 封装、SDK 消息适配、权限桥 |
| `server/` | Direct Connect 场景的 WebSocket 客户端会话管理 |
| `tasks/` | 后台任务运行时：LocalShell / LocalAgent / RemoteAgent / InProcessTeammate / Dream |
| `entrypoints/` | 进程入口与 SDK 边界类型（CLI / MCP / Agent SDK 契约） |
| `plugins/` | 内置插件注册表（`@builtin` 插件管理） |
| `skills/` | 技能系统：磁盘加载 `.claude/skills`、frontmatter 解析、bundled 技能 |
| `keybindings/` | 键位绑定：默认键位表、用户 bindings 加载、解析校验 |
| `vim/` | Vim 模式：动作、操作符、文本对象、状态转移 |
| `memdir/` | 长期记忆目录：MEMORY.md 管理、相关性扫描、团队记忆 |
| `schemas/` | 从 settings 拆出的 Hook Zod schema（打破循环依赖） |
| `migrations/` | 一次性配置迁移（模型默认值、MCP、权限等） |
| `constants/` | 产品常量：OAuth、API 限制、系统提示片段、工具名列表 |
| `types/` | 共享 TS 类型：消息、命令、权限、插件、hooks；含 protobuf 生成类型 |
| `native-ts/` | 纯 TS 替代原生 NAPI 的实现：Yoga 布局、语法着色 diff、模糊文件索引 |
| `outputStyles/` | 从 `.claude/output-styles` 加载 Markdown 输出风格 |
| `buddy/` | 伴侣精灵（ASCII 动画、气泡、互动） |
| `screens/` | 全屏视图：REPL、Doctor 诊断、恢复会话 |
| `bootstrap/` | 会话/计数器/持久化相关的启动状态 |
| `cli/` | 非交互 CLI 辅助：打印、结构化 IO、退出码 |
| `assistant/` | 助手模式环境变量探测 (`CLAUDE_CODE_ASSISTANT_MODE`) |
| `jobs/` | 分类器扩展点（还原树中为 stub） |
| `proactive/` | 主动式行为的全局开关与订阅（外部构建为 noop） |
| `moreright/` | 查询前后钩子占位（仅内部构建有实现） |
| `upstreamproxy/` | CCR 容器侧上游代理（CONNECT→WebSocket relay） |

### `shims/` — 本地包替身 (7 个)

将对 NAPI/内部能力的 import 重定向到 `src/native-ts` 或 `vendor/*-src`，使无原生二进制时也能编译运行。

| 包名 | 作用 |
|------|------|
| `color-diff-napi` | 语法着色 diff → 转发到 `src/native-ts/color-diff` |
| `modifiers-napi` | 修饰键检测 → 转发到 `vendor/modifiers-napi-src` |
| `url-handler-napi` | URL/深度链接事件 → 转发到 `vendor/url-handler-src` |
| `ant-computer-use-mcp` | 计算机使用 MCP 集成占位 |
| `ant-computer-use-input` | 计算机使用输入接口占位 |
| `ant-computer-use-swift` | Swift 计算机使用接口占位 |
| `ant-claude-for-chrome-mcp` | Chrome MCP 集成占位 |

### `vendor/` — 原生模块 TS 封装 (4 个)

| 模块 | 作用 |
|------|------|
| `image-processor-src` | 图像处理/剪贴板读取的 lazy 原生绑定封装 |
| `audio-capture-src` | 音频采集原生模块封装 |
| `modifiers-napi-src` | 键盘修饰键状态封装 |
| `url-handler-src` | URL 事件/深度链接处理封装 |

---

## 还原状态说明

### 已还原

- CLI bootstrap 路径完整可运行
- 绝大多数 commands / tools / components / services / hooks / utils 的 TS 源码
- bundled skill（`claude-api`、`verify`）内容
- Chrome MCP / Computer Use MCP 兼容层
- planning / permission-classifier fallback prompt

### 待还原

| 类别 | 数量 | 说明 |
|------|------|------|
| React Compiler 产物 | ~200 个 .tsx | 含 `$[n]` 槽位的编译器输出，需还原为手写 JSX |
| Stub 命令 | 18 个 | `isEnabled: () => false` 的禁用占位 |
| 降级类型 | 2 个 .generated.ts | `Record<string, unknown>` 宽松占位 |
| 原生模块 | 1 个 .node + 7 个 shim | 预编译二进制，极难还原 |
| Feature 分支 | 多处 | `bun:bundle` 的 `feature()` 条件编译背后的 dead code |
| Source Map 残留 | ~200+ 文件 | `sourceMappingURL` 注释可清理 |
