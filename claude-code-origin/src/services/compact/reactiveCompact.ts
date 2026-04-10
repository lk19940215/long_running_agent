// ============================================================================
// 📁 文件：reactiveCompact.ts
// 📌 定位：响应式压缩——API 返回 413 后的紧急压缩重试（本还原版为占位实现）
//
// 核心概念：
//   - 占位：runReactiveCompact 直接返回原 messages
// 详细文档：→ 源码阅读/05-上下文压缩.md
// ============================================================================

export async function runReactiveCompact<T>(messages: T): Promise<T> {
  return messages
}
