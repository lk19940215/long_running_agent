// ============================================================================
// 📁 文件：snipCompact.ts
// 📌 定位：Snip 裁剪——按标记裁剪旧消息为占位符（本还原版为占位实现）
//
// 核心概念：
//   - 占位：不裁剪，changed 恒为 false
// 详细文档：→ 源码阅读/05-上下文压缩.md
// ============================================================================

export function snipCompactIfNeeded<T>(messages: T, _options?: unknown): {
  messages: T
  changed: boolean
} {
  return { messages, changed: false }
}

export function isSnipBoundaryMessage(): boolean {
  return false
}
