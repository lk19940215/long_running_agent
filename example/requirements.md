# Claude Coder 官网

## 项目概述

为 Claude Coder（一个长时间自运行的自主编码 Agent Harness）构建一个产品官网。技术栈：React + TypeScript + Tailwind CSS + Vite，纯前端静态站点，部署到 GitHub Pages。

## 设计风格

- 深色主题为主（#0a0a0f 底色），亮色辅助
- 科技感 + 极简，参考 Vercel / Linear / Cursor 官网风格
- 代码块和终端截图使用等宽字体 + 语法高亮
- 动效克制，以 fade-in 和 scroll-reveal 为主
- 中文为主语言，顶部可切换英文

## 页面结构

### 1. Hero 区域

- 大标题："让 AI Agent 连续编码数小时"
- 副标题：一句话介绍核心价值（harness 管理状态、校验产出、失败回滚，Agent 只管写代码）
- 一个终端动画展示 `claude-coder run` 的实际运行效果（任务滚动、状态切换、session 推进）
- CTA 按钮："快速开始" + "GitHub"

### 2. 核心特性（3-4 个卡片）

- **Hook 提示注入**：通过 JSON 配置在工具调用时注入引导，零代码修改即可扩展
- **多 Session 编排**：自动分解任务 → 逐个编码 → 校验 → 提交 → 下一任务
- **失败自愈**：编码不通过时自动 git 回滚 + 重试，支持连续失败标记跳过
- **多模型支持**：Claude 官方 / Coding Plan 多模型路由 / DeepSeek / 任意 Anthropic 兼容 API

### 3. 工作原理（流程图）

用动画或可交互的流程图展示：

```
需求输入 → 项目扫描 → 任务分解 → 编码循环
                                    │
                              ┌─────┴─────┐
                              │  Session N  │
                              │  6 步流程   │
                              └─────┬─────┘
                                    │
                              harness 校验
                                    │
                          通过 → 下一任务
                          失败 → git 回滚 + 重试
```

### 4. 代码示例区

展示核心使用场景的代码片段：

```bash
# 新项目
claude-coder plan "用 Express + React 做 Todo 应用"
claude-coder run

# 已有项目
claude-coder run "新增头像上传功能"

# 需求文档驱动
claude-coder plan -r requirements.md
claude-coder run --max 10
```

### 5. 技术架构（可折叠/Tab 切换）

- Hook 注入机制简介（GuidanceInjector 三级匹配流水线示意图）
- Session 守护机制简介（倒计时重置 + 工具运行状态追踪）
- 链接到 GitHub 的 design/ 目录深入了解

### 6. 命令速查表

表格形式展示所有命令及说明，与 README 保持一致。

### 7. 模型配置推荐

两列卡片：
- "长时间自运行（最稳）" — 配置代码
- "自用 Claude Code（最强）" — 配置代码

### 8. 快速开始（Step by step）

1. 安装 SDK
2. 安装 Claude Coder
3. 配置模型
4. 开始编码

每一步配终端代码块 + 简要说明。

### 9. Footer

- GitHub 链接
- npm 链接
- MIT License
- 版本号（从 package.json 读取或硬编码）

## 技术要求

- React 18+ / TypeScript / Vite
- Tailwind CSS v4
- 响应式设计（移动端适配）
- 纯前端静态站，无后端
- 代码语法高亮（shiki 或 prism）
- 平滑滚动 + 滚动锚点导航
- SEO 基础 meta 标签
- 构建产物部署到 GitHub Pages

## 内容来源

- 产品介绍和命令列表：参考项目根目录 `README.md`
- 技术架构：参考 `design/` 目录下的文档
- package.json 中的版本号和描述

## 不需要的功能

- 用户登录 / 注册
- 后端 API
- 数据库
- 博客系统
- 多语言 i18n 框架（简单的中英文切换用条件渲染即可）
