# Claude Coder 官网

Claude Coder 官网项目，基于 React 18 + TypeScript + Vite + Tailwind CSS 构建，部署于 GitHub Pages。

## 项目简介

这是一个展示 Claude Coder 工具的官方网站，包含：
- 核心功能介绍
- 快速上手指南
- 完整文档中心
- 使用案例展示

## 技术栈

- **框架**: React 18 + TypeScript
- **构建工具**: Vite 5
- **样式**: Tailwind CSS
- **路由**: React Router v6 (Hash 模式)
- **部署**: GitHub Pages + GitHub Actions

## 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 构建生产版本

```bash
npm run build
```

### 预览构建结果

```bash
npm run preview
```

## 部署

项目配置了 GitHub Actions 自动部署：
- 推送代码到 `main` 分支
- GitHub Actions 会自动构建并部署到 GitHub Pages

## UI 设计

本项目包含由 `claude-coder design` 命令生成的 `.pen` 设计文件：

```
.claude-coder/design/
  system.lib.pen       # 设计系统（变量 + 可复用组件）
  design_map.json      # 设计映射表
  pages/
    home.pen           # 首页设计稿
```

> ⚠️ **Windows 已知限制**：`.pen` 文件的跨文件组件引用（`ref: "sys:header"`）在 Windows 的 Pencil 插件中不受支持（Pencil应用也不支持）。Mac 桌面应用、插件均正常预览。建议在 Mac 上使用 design 命令生成和预览设计稿。跨文件变量引用（`$sys:color.bg`）和同文件内组件引用在所有平台均可用。

## 项目结构

```
├── public/              # 静态资源
├── src/
│   ├── assets/         # 样式资源
│   ├── components/     # React 组件
│   │   ├── common/     # 通用组件 (Header, Footer)
│   │   ├── home/       # 首页组件
│   │   └── docs/       # 文档组件
│   ├── pages/          # 页面组件
│   ├── router/         # 路由配置 (HashRouter)
│   ├── types/          # TypeScript 类型定义
│   └── utils/          # 工具函数
├── .github/workflows/  # CI/CD 配置
├── index.html          # 入口 HTML
├── package.json        # 依赖配置
├── vite.config.ts      # Vite 配置
└── tsconfig.json       # TypeScript 配置
```

## 文档

- [快速上手](./docs/quick-start.md)
- [功能特性](./docs/features.md)
- [API 文档](./docs/api.md)

## 许可证

MIT License
