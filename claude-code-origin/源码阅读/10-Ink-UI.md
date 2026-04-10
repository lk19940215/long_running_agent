# 10 - Ink 终端 UI

> **一句话总结**：Claude Code 使用**自维护的 Ink 运行时**（基于 React + Yoga 布局引擎），在终端中实现了类似浏览器的组件化 UI——虚拟 DOM、Flexbox 布局、增量渲染、鼠标支持、选择复制。

---

## 为什么重要？

Claude Code 不是一个简单的 CLI —— 它是一个**终端内的富应用**：
- 权限弹窗、进度条、消息流、语法高亮都是 React 组件
- 通过 Yoga（Flexbox）实现复杂布局
- 增量渲染优化，只重绘变化的区域
- 支持鼠标点击、文本选择、滚动

理解 Ink UI 层有助于：
- 理解 Claude Code 的用户交互模型
- 理解为什么用 React 而不是传统 CLI 库
- 为终端 UI 开发提供参考

---

## 全景图：渲染管线

```
React 组件树
  │
  ▼
reconciler.ts          ← React Reconciler（DOM 操作）
  │
  ▼
dom.ts                 ← 虚拟 DOM 节点树
  │
  ▼
Yoga 布局引擎          ← Flexbox 计算（width/height/x/y）
  │
  ▼
render-node-to-output  ← 虚拟 DOM → Screen Buffer
  │
  ▼
renderer.ts            ← 生成 Frame（screen + cursor）
  │
  ▼
render-to-screen.ts    ← Frame → 终端转义序列
  │
  ▼
terminal.ts            ← 写入 stdout（增量 diff）
```

---

## 核心文件导航

| 文件 | 职责 | 深读价值 |
|------|------|---------|
| `ink/ink.tsx` | Ink 主类：生命周期、渲染调度、事件处理，~1723 行 | ⭐⭐⭐ 核心 |
| `ink/reconciler.ts` | React Reconciler 适配器，~513 行 | ⭐⭐⭐ 核心 |
| `ink/renderer.ts` | Frame 生成器，~179 行 | ⭐⭐ 必读 |
| `ink/dom.ts` | 虚拟 DOM 节点定义 | ⭐⭐ 必读 |
| `ink/render-node-to-output.ts` | DOM → 像素输出 | ⭐⭐ 必读 |
| `ink/render-to-screen.ts` | 输出 → 终端序列 | ⭐ 了解 |
| `ink/screen.ts` | Screen Buffer（字符/样式/宽度池） | ⭐ 了解 |
| `ink/terminal.ts` | 终端写入和 diff | ⭐ 了解 |
| `ink/components/*.tsx` | 基础组件（App/Box/Text/ScrollBox 等） | ⭐⭐ 按需 |
| `ink/layout/*.ts` | Yoga 布局配置 | ⭐ 了解 |
| `ink/selection.ts` | 文本选择状态机 | ⭐ 按需 |
| `ink/events/*.ts` | 键盘/鼠标事件 | ⭐ 按需 |
| `ink/termio/*.ts` | CSI/DEC/OSC 转义序列 | ⭐ 低优 |

**应用层**：

| 文件 | 职责 | 深读价值 |
|------|------|---------|
| `screens/REPL.tsx` | 主交互界面（极大），数千行 | ⭐⭐⭐ 按功能段读 |
| `components/App.tsx` | 顶层 Provider 壳 | ⭐ 了解 |
| `components/**/*.tsx` | 业务组件（消息、权限、设置等） | ⭐ 按需 |

---

## 逐层详解

### 1. Ink 主类（ink.tsx）

`Ink` 类是整个 UI 的入口，管理完整的渲染生命周期：

```typescript
class Ink {
  // 核心状态
  private container: FiberRoot           // React Fiber 根
  private rootNode: DOMElement           // 虚拟 DOM 根
  private renderer: Renderer             // Frame 生成器
  private terminal: Terminal             // 终端写入器
  private frontFrame / backFrame: Frame  // 双缓冲 Frame
  private selectionState: SelectionState // 文本选择状态
  
  // 核心方法
  render(node: ReactNode)     // 更新 React 树
  scheduleRender()            // 节流渲染调度（FRAME_INTERVAL_MS）
  actualRender()              // 实际渲染：Yoga → Output → Screen → Terminal
  pause() / resume()          // 暂停/恢复渲染（子进程接管终端时）
  waitUntilExit()             // 等待退出
}
```

**渲染节流**：`scheduleRender` 使用 `throttle`（默认 ~16ms），避免 React 频繁 setState 导致过度渲染。

**双缓冲**：`frontFrame`（当前显示的）和 `backFrame`（正在构建的），渲染完成后交换，实现无闪烁更新。

### 2. React Reconciler（reconciler.ts）

Claude Code 实现了自定义的 React Reconciler，将 React 组件映射到虚拟 DOM：

```
React 元素                  虚拟 DOM 操作
─────────                  ──────────────
<Box>                 →    createNode('ink-box')
<Text>Hello</Text>    →    createTextNode('Hello')
props 变化            →    setAttribute / setStyle
组件卸载              →    removeChildNode
```

关键配置：
- 使用 `ConcurrentRoot`（React 18 并发模式）
- 支持 `Dispatcher`（事件分发）
- 每次 commit 后触发 `scheduleRender`

### 3. Yoga 布局（layout/）

Yoga 是 Facebook 的 Flexbox 布局引擎（C++ 实现），Claude Code 用它计算终端中的组件位置：

```jsx
// 这个 Box 会被 Yoga 计算出精确的 x/y/width/height
<Box flexDirection="column" paddingX={1} width="100%">
  <Text>Hello</Text>
  <Box flexGrow={1}>
    <ScrollBox>{messages}</ScrollBox>
  </Box>
  <Box height={3}>
    <InputField />
  </Box>
</Box>
```

Yoga 支持的布局属性：`flexDirection`、`flexGrow`、`padding`、`margin`、`width`、`height`、`alignItems` 等，与 CSS Flexbox 一致。

### 4. Screen Buffer（screen.ts）

渲染结果存储在 Screen Buffer 中：

```typescript
type Screen = {
  width: number
  height: number
  chars: Uint32Array[]     // 每个单元格的字符（索引到 CharPool）
  styles: Uint32Array[]    // 每个单元格的样式（索引到 StylePool）
  widths: Uint8Array[]     // 每个单元格的显示宽度（1 或 2，处理 CJK 字符）
  hyperlinks: Uint32Array[] // 超链接索引
}
```

使用**对象池**（`CharPool`、`StylePool`、`HyperlinkPool`）避免重复创建字符串，提高内存效率。

### 5. 增量渲染（terminal.ts）

`writeDiffToTerminal` 对比前后两帧的 Screen Buffer，只写入变化的单元格：

```
前一帧：  H e l l o _ W o r l d
当前帧：  H e l l o _ C o d e _
差异：                    ^ ^ ^ ^  ← 只发送 "Code " 和光标移动
```

通过 CSI 转义序列精确定位：
- `cursorMove(x, y)` → 移动光标
- ANSI 颜色/样式序列 → 应用样式
- 字符输出 → 更新内容

### 6. 基础组件

| 组件 | 用途 | 对应 HTML |
|------|------|----------|
| `Box` | 容器（Flexbox 布局） | `<div>` |
| `Text` | 文本显示（颜色、粗体、斜体） | `<span>` |
| `ScrollBox` | 可滚动容器 | `<div style="overflow:scroll">` |
| `App` | Ink 内部的根容器（自动测量终端尺寸） | `<body>` |

### 7. 事件系统

```
终端原始输入（stdin）
  │
  ├── 键盘事件
  │   ├── parse-keypress.ts → 解析转义序列为 ParsedKey
  │   ├── KeyboardEvent → 分发到聚焦组件
  │   └── 快捷键处理（Ctrl+C、Ctrl+Z、方向键等）
  │
  └── 鼠标事件
      ├── 终端鼠标跟踪（ENABLE_MOUSE_TRACKING）
      ├── hit-test.ts → 坐标 → 组件映射
      ├── dispatchClick → 点击事件
      └── dispatchHover → 悬停事件
```

### 8. Alt Screen 模式

Claude Code 使用终端的 Alt Screen（备用屏幕缓冲区）：
- 进入 Alt Screen → 保存原始终端内容
- 退出 Alt Screen → 恢复原始终端内容
- 类似 vim 的行为：打开时全屏接管，关闭后终端恢复原样

---

## 应用层：REPL.tsx

`screens/REPL.tsx` 是 Claude Code 的主交互界面，极大（数千行），核心结构：

```
REPL
  ├── 状态管理
  │   ├── 消息列表（messages）
  │   ├── 权限队列（toolUseConfirmQueue）
  │   ├── 输入状态
  │   └── 会话状态
  │
  ├── 核心 Hook
  │   ├── useCanUseTool → 权限处理
  │   ├── useManageMCPConnections → MCP 连接
  │   └── onQuery → 提交消息并消费 StreamEvent
  │
  └── UI 组件树
      ├── 消息列表（ScrollBox 包裹）
      │   ├── 用户消息
      │   ├── 助手消息（流式渲染）
      │   └── 工具调用/结果
      ├── 权限弹窗（PermissionRequest）
      ├── 输入框
      └── 状态栏
```

---

## 组件层：components/

`src/components/` 包含大量业务组件：

```
components/
  ├── App.tsx              ← 顶层 Provider（AppState + FPS + Stats）
  ├── messages/            ← 消息渲染组件
  ├── permissions/         ← 权限弹窗组件
  ├── settings/            ← 设置面板
  ├── mcp/                 ← MCP 设置 UI
  ├── tasks/               ← 后台任务对话框
  └── ...
```

`components/App.tsx` 的嵌套层级：

```jsx
<BootstrapBoundary>        {/* 错误边界 */}
  <FpsMetricsProvider>     {/* FPS 监控 */}
    <StatsProvider>        {/* 统计数据 */}
      <AppStateProvider>   {/* 全局状态 */}
        {children}         {/* REPL 或其他 */}
      </AppStateProvider>
    </StatsProvider>
  </FpsMetricsProvider>
</BootstrapBoundary>
```

---

## 设计亮点

### 1. 自维护 Ink 运行时
Claude Code 没有使用 npm 上的 `ink` 包，而是 fork 了一份并深度定制：
- 添加了 Alt Screen 支持
- 添加了鼠标事件和文本选择
- 优化了滚动性能（ScrollBox）
- 添加了超链接支持
- 使用对象池减少 GC 压力

### 2. React 18 并发模式
使用 `ConcurrentRoot` 让 React 可以中断渲染，优先处理用户输入，保持 UI 响应性。

### 3. 对象池与增量渲染
- `CharPool` / `StylePool` 避免重复字符串分配
- `writeDiffToTerminal` 只发送变化的像素
- 双缓冲避免闪烁
- 渲染节流（~16ms 间隔）

这些优化让 Claude Code 在长对话、大量输出时仍然流畅。

### 4. 声明式终端 UI
```jsx
// 传统 CLI：手动管理光标位置、清屏、重绘
process.stdout.write('\x1b[2J\x1b[H')
process.stdout.write('Hello')
process.stdout.write('\x1b[2;1H')
process.stdout.write('World')

// Ink：声明式，自动处理布局和更新
<Box flexDirection="column">
  <Text>Hello</Text>
  <Text>World</Text>
</Box>
```

### 5. 跨终端兼容
`termio/` 目录封装了各种终端转义序列标准：
- CSI（Control Sequence Introducer）：光标移动、颜色
- DEC（DEC Private Mode）：Alt Screen、鼠标跟踪
- OSC（Operating System Command）：剪贴板、标签页状态、iTerm2 进度
- 自动检测终端能力（`supportsExtendedKeys` 等）

---

## 深读建议

| 如果你想了解... | 读这里 |
|----------------|--------|
| 渲染调度的详细流程 | `ink.tsx` 的 `actualRender()` 方法 |
| Yoga 样式映射 | `ink/styles.ts` + `ink/layout/engine.ts` |
| 滚动容器实现 | `ink/components/ScrollBox.tsx` |
| 文本选择与复制 | `ink/selection.ts` |
| REPL 的输入处理 | `screens/REPL.tsx`（搜索 `onSubmit` / `onInput`） |
| 权限弹窗 UI | `components/permissions/PermissionRequest.tsx` |

---

## 小结

Ink UI 层是 Claude Code 区别于其他 CLI 工具的关键：它不是简单地打印文本，而是构建了一个**终端内的 React 应用**。虽然这部分代码体量很大（仅 `ink.tsx` 就有 1700+ 行），但核心思路与 Web 前端开发类似：

```
Web：React → ReactDOM → 浏览器 DOM → 像素
Ink：React → Reconciler → 虚拟 DOM → Yoga → Screen Buffer → 终端转义序列
```

如果你有 React 和 CSS Flexbox 经验，理解 Ink 的门槛并不高。

---

## 回到总目录

→ [结构.md](./结构.md)
