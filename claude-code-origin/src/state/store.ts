// ============================================================================
// 📁 文件：store.ts
// 📌 定位：35 行的轻量级 Store 实现，替代 Redux
// 🔗 调用链：createStore → getState / setState / subscribe；AppState.tsx 经 useSyncExternalStore 接入 React
//
// 核心概念：
//   - getState / setState（Object.is 判等）/ subscribe，一个极简的发布-订阅模式
// 详细文档：→ 源码阅读/03-状态管理.md
// ============================================================================

type Listener = () => void
type OnChange<T> = (args: { newState: T; oldState: T }) => void

export type Store<T> = {
  getState: () => T
  setState: (updater: (prev: T) => T) => void
  subscribe: (listener: Listener) => () => void
}

export function createStore<T>(
  initialState: T,
  onChange?: OnChange<T>,
): Store<T> {
  let state = initialState
  const listeners = new Set<Listener>()

  return {
    getState: () => state,

    setState: (updater: (prev: T) => T) => {
      const prev = state
      const next = updater(prev)
      if (Object.is(next, prev)) return
      state = next
      onChange?.({ newState: next, oldState: prev })
      for (const listener of listeners) listener()
    },

    subscribe: (listener: Listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
