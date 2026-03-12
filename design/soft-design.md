# NPM 包打包为可运行软件 — 方案调研

## 一、当前状态

Claude Coder 是一个 npm CLI 工具，通过 `npm install -g claude-coder` 安装，依赖用户系统已有的 Node.js 运行时和 `@anthropic-ai/claude-agent-sdk`。

```json
{
  "bin": { "claude-coder": "bin/cli.js" },
  "engines": { "node": ">=18.0.0" },
  "peerDependencies": { "@anthropic-ai/claude-agent-sdk": ">=0.1.0" }
}
```

## 二、打包方案对比

### 2.1 纯 CLI 可执行文件（无 GUI）

| 方案 | 说明 | 产物大小 | 成熟度 |
|------|------|---------|--------|
| **Node.js SEA** | Node.js 内置 Single Executable Application | 40-80MB | Node 25+ 稳定，22-24 实验性 |
| **pkg** | 第三方打包工具（已停止维护，社区 fork） | 40-80MB | 成熟但已弃用 |
| **esbuild + SEA** | 先 bundle 再 SEA 打包 | 40-80MB | 推荐组合 |

### 2.2 带 GUI 的桌面应用

| 方案 | 说明 | 产物大小 | 技术栈 |
|------|------|---------|--------|
| **Electron** | 内置 Chromium + Node.js | 80-200MB | JS/TS 全栈 |
| **Tauri** | 系统原生 WebView + Rust 后端 | 2-10MB | Rust + Web 前端 |
| **Neutralino** | 系统原生 WebView + JS 后端 | 1-5MB | 纯 JS |

---

## 三、方案分析

### 3.1 Node.js SEA（推荐 — CLI 场景）

Node.js v25.5.0+ 提供 `--build-sea` 一步式构建：

```bash
# sea-config.json
{
  "main": "dist/cli.js",
  "output": "claude-coder",
  "mainFormat": "commonjs"
}

# 构建
node --build-sea sea-config.json
```

**优势**：
- Node.js 官方支持，无外部依赖
- 用户无需安装 Node.js
- 单文件分发

**限制**：
- 产物仍包含完整 Node.js 运行时（~40MB）
- `peerDependencies`（claude-agent-sdk）需要打入 bundle
- 原生模块（如 playwright）无法直接打入 SEA
- macOS / Windows 需要代码签名

**前置工作**：
1. 用 esbuild 将所有源码 + 依赖打包为单个 `dist/cli.js`
2. 处理 `@anthropic-ai/claude-agent-sdk` 依赖：需确认 SDK 是否可被 bundle（可能有原生模块限制）
3. 用 SEA 包装 `dist/cli.js` 为可执行文件
4. 跨平台构建（Linux / macOS / Windows 各需一次）

### 3.2 Electron（推荐 — GUI 场景）

适合为 Claude Coder 构建可视化控制台：

```
┌─────────────────────────────────────────┐
│  Claude Coder                     _ □ X │
├─────────────────────────────────────────┤
│  [Session 3] 编码中 05:32               │
│  ├─ feat-001: 用户注册      ✅ done     │
│  ├─ feat-002: 登录功能      ✅ done     │
│  └─ feat-003: 密码重置      🔄 running  │
│                                         │
│  ┌──────────────────────────────────┐   │
│  │ > 编辑文件: src/auth/reset.ts   │   │
│  │ > 执行命令: npm test            │   │
│  │ > 测试验证: 3/5 passed          │   │
│  └──────────────────────────────────┘   │
│                                         │
│  [Run] [Pause] [Stop]  Cost: $0.42     │
└─────────────────────────────────────────┘
```

**优势**：
- Node.js 全栈，现有代码可直接在主进程使用
- 生态成熟，electron-builder / electron-forge 打包工具完善
- 跨平台一致性最好

**限制**：
- 产物 80-200MB
- 内存占用高（150-300MB）

### 3.3 Tauri（推荐 — 轻量 GUI 场景）

使用系统 WebView 替代 Chromium，大幅缩小体积：

**优势**：
- 产物仅 2-10MB
- 内存占用低
- Tauri v2 支持移动端

**限制**：
- 后端需 Rust 编写 — 现有 Node.js 代码需通过 sidecar 方式调用
- 不同 OS 的 WebView 渲染差异
- 团队需要 Rust 技能

**Sidecar 模式**：Tauri 可将 Node.js SEA 作为 sidecar 进程启动，前端通过 Tauri 命令桥接。这种方式最适合我们：

```
Tauri App
  ├─ Frontend (Web UI)
  ├─ Rust Backend (轻量 IPC)
  └─ Sidecar: claude-coder (Node.js SEA binary)
```

### 3.4 Neutralino（最轻量 GUI）

**优势**：纯 JS 开发，产物最小（1-5MB），学习成本最低

**限制**：社区较小，安全性一般（localhost 暴露），不适合商业产品

---

## 四、推荐路线

### 阶段一：CLI 可执行文件

目标：用户下载单文件即可使用，无需 Node.js 环境。

```
esbuild bundle → Node.js SEA → 跨平台可执行文件
                                ├─ claude-coder-linux
                                ├─ claude-coder-macos
                                └─ claude-coder-win.exe
```

技术步骤：
1. 添加 `esbuild` 构建脚本，将 `bin/cli.js` + `src/` + `templates/` 打包为单文件
2. 处理 SDK 依赖打包（可能需要将 SDK 从 peerDependencies 改为 bundledDependencies）
3. 编写 `sea-config.json`
4. CI/CD 跨平台构建 + GitHub Releases 分发
5. macOS / Windows 代码签名（可选）

**难点**：`@anthropic-ai/claude-agent-sdk` 是否可被 esbuild bundle。如有原生模块，需排除并要求用户系统安装 SDK。

### 阶段二：GUI 桌面应用

目标：可视化控制台，实时展示任务进度、日志、成本。

推荐 **Tauri + Sidecar** 方案：
1. 阶段一产出的 SEA 作为 sidecar
2. Tauri 前端用 React/Vue 构建控制台 UI
3. 通过 Tauri Commands 调用 sidecar 进程

备选 **Electron** 方案：
1. 现有代码直接在 Electron 主进程运行
2. Renderer 进程构建 UI
3. 通过 IPC 通信

---

## 五、分发渠道

| 渠道 | 适用 | 说明 |
|------|------|------|
| npm | CLI | 现有方式，`npm install -g` |
| GitHub Releases | SEA | 按平台提供二进制下载 |
| Homebrew | macOS | `brew install claude-coder` |
| dmg / AppImage / msi | GUI | 桌面安装包 |
| Homebrew Cask | macOS GUI | `brew install --cask claude-coder` |

---

## 六、风险与注意事项

| 风险 | 说明 | 缓解 |
|------|------|------|
| SDK 原生模块 | claude-agent-sdk 可能含原生 C++ 模块，无法 bundle | 检查 SDK 依赖树；必要时仍要求系统安装 SDK |
| 跨平台构建 | SEA 需在目标平台上构建 | 使用 GitHub Actions 矩阵构建 |
| 代码签名 | macOS Gatekeeper / Windows SmartScreen | 需 Apple Developer / Windows EV 证书 |
| 产物体积 | Node.js 运行时 ~40MB | 可接受；Tauri sidecar 模式下前端额外仅 2-5MB |
| Playwright 兼容 | 浏览器二进制文件无法打入 SEA | 保持 playwright 为可选依赖，运行时按需安装 |
