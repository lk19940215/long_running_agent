// ============================================================================
// 📁 文件：query/deps.ts
// 📌 一句话：query() 的 I/O 依赖注入点——4 个核心依赖，测试可替换。
//
// 设计意图：
//   query() 依赖 callModel / microcompact / autocompact / uuid 这 4 个 I/O 操作。
//   通过 QueryDeps 接口注入，测试时传 fakes 即可，无需 spyOn 各个模块。
//   用 `typeof fn` 保持签名与真实实现自动同步。
//   范围故意很窄（4 个）以验证模式，后续可扩展到 runTools / handleStopHooks 等。
// ============================================================================

import { randomUUID } from 'crypto'
import { queryModelWithStreaming } from '../services/api/claude.js'
import { autoCompactIfNeeded } from '../services/compact/autoCompact.js'
import { microcompactMessages } from '../services/compact/microCompact.js'

// -- deps

// I/O dependencies for query(). Passing a `deps` override into QueryParams
// lets tests inject fakes directly instead of spyOn-per-module — the most
// common mocks (callModel, autocompact) are each spied in 6-8 test files
// today with module-import-and-spy boilerplate.
//
// Using `typeof fn` keeps signatures in sync with the real implementations
// automatically. This file imports the real functions for both typing and
// the production factory — tests that import this file for typing are
// already importing query.ts (which imports everything), so there's no
// new module-graph cost.
//
// Scope is intentionally narrow (4 deps) to prove the pattern. Followup
// PRs can add runTools, handleStopHooks, logEvent, queue ops, etc.
export type QueryDeps = {
  // -- model
  callModel: typeof queryModelWithStreaming

  // -- compaction
  microcompact: typeof microcompactMessages
  autocompact: typeof autoCompactIfNeeded

  // -- platform
  uuid: () => string
}

export function productionDeps(): QueryDeps {
  return {
    callModel: queryModelWithStreaming,
    microcompact: microcompactMessages,
    autocompact: autoCompactIfNeeded,
    uuid: randomUUID,
  }
}
