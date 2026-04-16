// ============================================================================
// 📁 文件：query/transitions.ts
// 📌 一句话：状态转移类型占位——当前是恒等函数，为未来纯 reducer 提取预留。
//
// 同时导出 Terminal 和 Continue 类型（query.ts 的返回值和 continue 原因）。
// ============================================================================

export function transitionQueryState<T>(value: T): T {
  return value
}
