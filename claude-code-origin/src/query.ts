// ============================================================================
// 📁 文件：query.ts
// 📌 一句话：while(true) 循环驱动的 AI 对话引擎——调 API、执行工具、自动压缩、错误恢复。
//
// ── 总览 ────────────────────────────────────────────────────────────────
//   这是整个 Claude Code 的"发动机"。一个 while(true) 循环不断：
//   调 Claude API → 解析回复 → 执行工具 → 把工具结果追加到消息 → 再调 API…
//   直到 Claude 回复 end_turn（没有 tool_use）或被用户中断。
//
//   它是一个 AsyncGenerator：每个循环迭代 yield 出流式事件（StreamEvent）
//   和消息（Message），由 REPL.tsx 的 onQueryImpl 通过 for-await 消费。
//
// ── 调用链位置 ──────────────────────────────────────────────────────────
//   REPL.tsx onQueryImpl:
//     for await (const event of query({messages, systemPrompt, ...})) {
//       onQueryEvent(event)  // 流式事件 → React state
//     }
//
//   子 agent 路径：runAgent.ts → query()（独立上下文）
//
// ── 入参（QueryParams）───────────────────────────────────────────────────
//   {
//     messages,         // Message[] — 完整对话历史
//     systemPrompt,     // SystemPrompt — 系统提示词
//     userContext,      // {key: value} — 用户上下文（cwd、git 状态等）
//     systemContext,    // {key: value} — 系统上下文
//     canUseTool,       // 工具权限判断函数
//     toolUseContext,   // ToolUseContext — 工具执行时的完整上下文
//     querySource,      // 'repl_main_thread' | 'agent:xxx' 等来源标识
//   }
//
// ── query() vs queryLoop() ──────────────────────────────────────────────
//   query()      — 薄包装：调 queryLoop()，完成后通知 consumed commands
//   queryLoop()  — 真正的 while(true) 循环，1400+ 行核心逻辑
//
// ── queryLoop() 每次迭代的流程 ──────────────────────────────────────────
//
//   while (true) {
//     // ① 上下文管理（瘦身，确保不超 token 限制）
//     applyToolResultBudget()     — 大工具结果替换为摘要
//     snipCompactIfNeeded()       — 历史裁剪（snip）
//     microcompact()              — 微压缩（缓存编辑）
//     applyCollapsesIfNeeded()    — 上下文折叠
//     autocompact()               — 自动压缩（超阈值时 Haiku 生成摘要）
//
//     // ② 安全检查
//     calculateTokenWarningState() — 超硬限制？→ yield error → return
//
//     // ③ ★ 调 Claude API（流式）
//     for await (const message of callModel({messages, systemPrompt, ...})) {
//       if (withheld) continue;   — 413/max_output 错误暂扣不 yield
//       yield message;            — 流式事件推给 REPL
//       收集 assistantMessages + toolUseBlocks
//       streamingToolExecutor.addTool()  — 边流式边开始执行工具
//     }
//
//     // ④ 用户中断检查
//     aborted? → yield 中断消息 → return
//
//     // ⑤ 错误恢复（仅当 !needsFollowUp 时）
//     prompt-too-long?  → contextCollapse 排空 / reactiveCompact → continue
//     max_output_tokens? → 提升限制重试 / 注入恢复消息 → continue（最多 3 次）
//     API error? → return
//     stop hooks? → 阻止/重试 → continue 或 return
//     token budget? → 预算耗尽检查 → continue 或 return
//     无 tool_use → return { reason: 'completed' }  ✅ 正常结束
//
//     // ⑥ ★ 工具执行（有 tool_use 时）
//     runTools() / streamingToolExecutor.getRemainingResults()
//       → 执行每个工具 → yield tool_result 消息
//     aborted? → return
//
//     // ⑦ 中间轮附件注入
//     getAttachmentMessages()    — IDE 选区、文件变更等
//     memoryPrefetch.consume()   — 相关记忆
//     skillDiscovery.collect()   — 技能发现
//     queuedCommands.drain()     — 队列中待处理的通知
//
//     // ⑧ 组装下一轮 state → continue（回到 ①）
//     state = { messages: [...old, ...assistant, ...toolResults], ... }
//   }
//
// ── 文件结构（~1831 行）───────────────────────────────────────────────
//
//   区域                        行数范围        深读价值    说明
//   ─────────────────────────────────────────────────────────────────────
//   🅰 导入层                    102~222        ❌ 跳过    50+ 个 import + 条件功能导入（reactiveCompact/contextCollapse/snip 等）
//   🅱 辅助函数                  224~250        ❌ 跳过    yieldMissingToolResultBlocks — 为未完成的 tool_use 补 error 结果
//   🅲 常量 + 类型守卫           252~280        ❌ 跳过    MAX_OUTPUT_TOKENS_RECOVERY_LIMIT / isWithheldMaxOutputTokens
//   🅳 类型定义                  282~318        ⭐ 必看    QueryParams（入参）+ State（循环状态机）← 理解整个文件的钥匙
//   🅴 query() 入口              320~340        ⚡ 快看    薄包装：调 queryLoop() + 通知 consumed commands
//   🅵 queryLoop() 初始化        342~407        ⭐ 必看    参数解构 + State 初始化 + budgetTracker + memoryPrefetch
//   🅶 ① 上下文压缩管道          408~644        ⭐⭐ 精读  toolResultBudget → snip → microcompact → collapse → autocompact
//   🅷 ② 安全检查 + 执行器准备   644~749        ⚡ 快看    token warning + StreamingToolExecutor 创建 + model 选择 + blocking limit
//   🅸 ③ 调 Claude API（流式）   750~964        ⭐⭐⭐    callModel 流式循环 + 扣留逻辑 + backfill + streaming tool execution
//   🅹 ④ 错误处理                965~1110       ⭐ 必看    FallbackTriggeredError / Image errors / generic errors / post-sampling hooks
//   🅺 ⑤ 中断检查                1112~1161      ⚡ 快看    abort handling + streaming tool executor cleanup
//   🅻 ⑥ 非跟进分支（!needsFollowUp） 1163~1458  ⭐⭐ 精读  PTL recovery → max_output recovery → stop hooks → token budget → return
//   🅼 ⑦ 工具执行                1460~1617      ⭐ 必看    runTools / streamingToolExecutor.getRemainingResults + abort check
//   🅽 ⑧ 附件注入 + 状态转移     1618~1829      ⭐ 必看    attachments + memory + skills + queued commands + state = next → continue
//
// ── State — 循环状态机（核心数据结构）──────────────────────────────────
//
//   每次 while(true) 迭代开头从 state 解构出当前状态，循环末尾用 state = next 更新。
//   State 是理解整个文件的钥匙——所有 continue 站点都通过构造新 State 来驱动下一轮。
//
//   type State = {
//     messages: Message[]                    // 当前消息序列（会被压缩管道修改）
//     toolUseContext: ToolUseContext          // 工具执行上下文（工具列表、MCP、权限等）
//     autoCompactTracking: ...               // 自动压缩追踪（turnId/turnCounter/consecutiveFailures）
//     maxOutputTokensRecoveryCount: number   // 输出截断恢复次数（最多 3 次）
//     hasAttemptedReactiveCompact: boolean   // 是否已尝试响应式压缩（防止死循环）
//     maxOutputTokensOverride: number        // 输出 token 限制覆盖（8k→64k 提升）
//     pendingToolUseSummary: Promise<...>    // 上一轮工具摘要（Haiku 异步生成，下一轮 yield）
//     stopHookActive: boolean               // 停止钩子是否激活（阻止本轮退出）
//     turnCount: number                     // 当前轮次（从 1 开始）
//     transition: Continue | undefined      // 本次循环的转移原因（undefined = 首次迭代）
//   }
//
//   transition.reason 揭示了为什么循环会 continue：
//     'next_turn'                — 正常：工具执行完毕，继续下一轮
//     'collapse_drain_retry'     — 上下文折叠排空后重试（413 恢复路径 1）
//     'reactive_compact_retry'   — 响应式压缩后重试（413 恢复路径 2）
//     'max_output_tokens_escalate' — 输出 token 限制从 8k 提升到 64k 后重试
//     'max_output_tokens_recovery' — 输出截断恢复中（注入 meta 消息让模型续写）
//     'stop_hook_blocking'       — 停止钩子阻止后重试
//     'token_budget_continuation' — Token 预算续行（预算未耗尽，继续执行）
//
//   7 个 continue 站点（每个都构造新 State）：
//     🅶 L571-636  autocompact 成功后的 tracking 重置
//     🅻 L1200-1216 collapse_drain_retry
//     🅻 L1253-1266 reactive_compact_retry
//     🅻 L1308-1321 max_output_tokens_escalate
//     🅻 L1333-1352 max_output_tokens_recovery
//     🅻 L1384-1406 stop_hook_blocking
//     🅻 L1422-1441 token_budget_continuation
//     🅽 L1816-1828 next_turn（正常路径）
//
// ── 关键机制 ────────────────────────────────────────────────────────────
//
//   withhold（扣留）：
//     413/max_output/media 错误不立即 yield 给调用方，先尝试恢复。
//     恢复成功 → continue 重试；恢复失败 → yield error → return。
//
//   streaming tool execution：
//     Claude 流式回复中一旦出现 tool_use block，立即开始执行工具，
//     不等全部回复完成。节省 30-50% 的工具等待时间。
//
//   autocompact：
//     token 超阈值时自动压缩历史（Haiku 生成摘要），缩减到阈值以下后继续。
//
//   turn 计数 & maxTurns：
//     每次工具循环 turnCount++，超过 maxTurns 时强制退出。
//
// 详细文档：→ 源码阅读/02-核心对话循环.md
// ============================================================================

// #region 🅰 导入层 — 50+ 个 import + 条件功能导入（reactiveCompact/contextCollapse/snip 等）
// biome-ignore-all assist/source/organizeImports: ANT-ONLY import markers must not be reordered
import type {
  ToolResultBlockParam,
  ToolUseBlock,
} from '@anthropic-ai/sdk/resources/index.mjs'
import type { CanUseToolFn } from './hooks/useCanUseTool.js'
import { FallbackTriggeredError } from './services/api/withRetry.js'
import {
  calculateTokenWarningState,
  isAutoCompactEnabled,
  type AutoCompactTrackingState,
} from './services/compact/autoCompact.js'
import { buildPostCompactMessages } from './services/compact/compact.js'
/* eslint-disable @typescript-eslint/no-require-imports */
const reactiveCompact = feature('REACTIVE_COMPACT')
  ? (require('./services/compact/reactiveCompact.js') as typeof import('./services/compact/reactiveCompact.js'))
  : null
const contextCollapse = feature('CONTEXT_COLLAPSE')
  ? (require('./services/contextCollapse/index.js') as typeof import('./services/contextCollapse/index.js'))
  : null
/* eslint-enable @typescript-eslint/no-require-imports */
import {
  logEvent,
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
} from 'src/services/analytics/index.js'
import { ImageSizeError } from './utils/imageValidation.js'
import { ImageResizeError } from './utils/imageResizer.js'
import { findToolByName, type ToolUseContext } from './Tool.js'
import { asSystemPrompt, type SystemPrompt } from './utils/systemPromptType.js'
import type {
  AssistantMessage,
  AttachmentMessage,
  Message,
  RequestStartEvent,
  StreamEvent,
  ToolUseSummaryMessage,
  UserMessage,
  TombstoneMessage,
} from './types/message.js'
import { logError } from './utils/log.js'
import {
  PROMPT_TOO_LONG_ERROR_MESSAGE,
  isPromptTooLongMessage,
} from './services/api/errors.js'
import { logAntError, logForDebugging } from './utils/debug.js'
import {
  createUserMessage,
  createUserInterruptionMessage,
  normalizeMessagesForAPI,
  createSystemMessage,
  createAssistantAPIErrorMessage,
  getMessagesAfterCompactBoundary,
  createToolUseSummaryMessage,
  createMicrocompactBoundaryMessage,
  stripSignatureBlocks,
} from './utils/messages.js'
import { generateToolUseSummary } from './services/toolUseSummary/toolUseSummaryGenerator.js'
import { prependUserContext, appendSystemContext } from './utils/api.js'
import {
  createAttachmentMessage,
  filterDuplicateMemoryAttachments,
  getAttachmentMessages,
  startRelevantMemoryPrefetch,
} from './utils/attachments.js'
/* eslint-disable @typescript-eslint/no-require-imports */
const skillPrefetch = feature('EXPERIMENTAL_SKILL_SEARCH')
  ? (require('./services/skillSearch/prefetch.js') as typeof import('./services/skillSearch/prefetch.js'))
  : null
const jobClassifier = feature('TEMPLATES')
  ? (require('./jobs/classifier.js') as typeof import('./jobs/classifier.js'))
  : null
/* eslint-enable @typescript-eslint/no-require-imports */
import {
  remove as removeFromQueue,
  getCommandsByMaxPriority,
  isSlashCommand,
} from './utils/messageQueueManager.js'
import { notifyCommandLifecycle } from './utils/commandLifecycle.js'
import { headlessProfilerCheckpoint } from './utils/headlessProfiler.js'
import {
  getRuntimeMainLoopModel,
  renderModelName,
} from './utils/model/model.js'
import {
  doesMostRecentAssistantMessageExceed200k,
  finalContextTokensFromLastResponse,
  tokenCountWithEstimation,
} from './utils/tokens.js'
import { ESCALATED_MAX_TOKENS } from './utils/context.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from './services/analytics/growthbook.js'
import { SLEEP_TOOL_NAME } from './tools/SleepTool/prompt.js'
import { executePostSamplingHooks } from './utils/hooks/postSamplingHooks.js'
import { executeStopFailureHooks } from './utils/hooks.js'
import type { QuerySource } from './constants/querySource.js'
import { createDumpPromptsFetch } from './services/api/dumpPrompts.js'
import { StreamingToolExecutor } from './services/tools/StreamingToolExecutor.js'
import { queryCheckpoint } from './utils/queryProfiler.js'
import { runTools } from './services/tools/toolOrchestration.js'
import { applyToolResultBudget } from './utils/toolResultStorage.js'
import { recordContentReplacement } from './utils/sessionStorage.js'
import { handleStopHooks } from './query/stopHooks.js'
import { buildQueryConfig } from './query/config.js'
import { productionDeps, type QueryDeps } from './query/deps.js'
import type { Terminal, Continue } from './query/transitions.js'
import { feature } from 'bun:bundle'
import {
  getCurrentTurnTokenBudget,
  getTurnOutputTokens,
  incrementBudgetContinuationCount,
} from './bootstrap/state.js'
import { createBudgetTracker, checkTokenBudget } from './query/tokenBudget.js'
import { count } from './utils/array.js'

/* eslint-disable @typescript-eslint/no-require-imports */
const snipModule = feature('HISTORY_SNIP')
  ? (require('./services/compact/snipCompact.js') as typeof import('./services/compact/snipCompact.js'))
  : null
const taskSummaryModule = feature('BG_SESSIONS')
  ? (require('./utils/taskSummary.js') as typeof import('./utils/taskSummary.js'))
  : null
/* eslint-enable @typescript-eslint/no-require-imports */

// #endregion 🅰

// #region 🅱 辅助函数 — yieldMissingToolResultBlocks（为未完成的 tool_use 补 error 结果）
function* yieldMissingToolResultBlocks(
  assistantMessages: AssistantMessage[],
  errorMessage: string,
) {
  for (const assistantMessage of assistantMessages) {
    // 从 assistant 消息中提取所有 tool_use block
    const toolUseBlocks = assistantMessage.message.content.filter(
      content => content.type === 'tool_use',
    ) as ToolUseBlock[]

    // 为每个 tool_use 生成一条中断错误消息（补齐缺失的 tool_result）
    for (const toolUse of toolUseBlocks) {
      yield createUserMessage({
        content: [
          {
            type: 'tool_result',
            content: errorMessage,
            is_error: true,
            tool_use_id: toolUse.id,
          },
        ],
        toolUseResult: errorMessage,
        sourceToolAssistantUUID: assistantMessage.uuid,
      })
    }
  }
}

// #endregion 🅱

// #region 🅲 常量 + 类型守卫 — MAX_OUTPUT_TOKENS_RECOVERY_LIMIT / isWithheldMaxOutputTokens
/**
 * thinking block 的三条铁律（违反 = 一整天的 debug 地狱）：
 * 1. 包含 thinking/redacted_thinking 的消息，所在请求的 max_thinking_length 必须 > 0
 * 2. thinking block 不能是 content 数组的最后一个元素
 * 3. thinking block 必须在整个 assistant 轨迹中保留（单轮 + 后续 tool_result + 下一条 assistant 消息）
 */
const MAX_OUTPUT_TOKENS_RECOVERY_LIMIT = 3

/**
 * 判断是否为 max_output_tokens 错误消息。如果是，流式循环应扣留它，
 * 不立即 yield 给 SDK 调用方——等恢复循环确认能否继续后再决定。
 * 过早 yield 会导致 SDK 调用方（如 cowork/desktop）收到 error 后终止会话，
 * 而恢复循环还在跑但已无人监听。
 *
 * 与 reactiveCompact.isWithheldPromptTooLong 对称。
 */
function isWithheldMaxOutputTokens(
  msg: Message | StreamEvent | undefined,
): msg is AssistantMessage {
  return msg?.type === 'assistant' && msg.apiError === 'max_output_tokens'
}

// #endregion 🅲

// #region 🅳 类型定义 — QueryParams（入参）+ State（循环状态机）← 理解整个文件的钥匙
export type QueryParams = {
  messages: Message[]
  systemPrompt: SystemPrompt
  userContext: { [k: string]: string }
  systemContext: { [k: string]: string }
  canUseTool: CanUseToolFn
  toolUseContext: ToolUseContext
  fallbackModel?: string
  querySource: QuerySource
  maxOutputTokensOverride?: number
  maxTurns?: number
  skipCacheWrite?: boolean
  // API task_budget（output_config.task_budget，beta task-budgets-2026-03-13）。
  // 与 tokenBudget +500k 自动续行功能不同。total 是整个 agentic turn 的预算；
  // remaining 在每次迭代中根据累计 API 使用量计算。见 claude.ts 的 configureTaskBudgetParams。
  taskBudget?: { total: number }
  deps?: QueryDeps
}

// -- 循环状态定义

// 在 while(true) 迭代之间传递的可变状态
type State = {
  messages: Message[]                    // 当前消息序列
  toolUseContext: ToolUseContext          // 工具执行上下文
  autoCompactTracking: AutoCompactTrackingState | undefined  // 自动压缩追踪
  maxOutputTokensRecoveryCount: number   // 输出截断恢复次数
  hasAttemptedReactiveCompact: boolean   // 是否已尝试响应式压缩
  maxOutputTokensOverride: number | undefined  // 输出 token 限制覆盖值
  pendingToolUseSummary: Promise<ToolUseSummaryMessage | null> | undefined  // 上一轮待完成的工具摘要
  stopHookActive: boolean | undefined    // 停止钩子是否激活
  turnCount: number                      // 当前轮次
  // 上一次迭代为什么 continue。首次迭代时为 undefined。
  // 让测试可以断言恢复路径是否触发，而不必检查消息内容。
  transition: Continue | undefined
}

// #endregion 🅳

// #region 🅴 query() 入口 — 薄包装：调 queryLoop() + 通知 consumed commands
export async function* query(
  params: QueryParams,
): AsyncGenerator<
  | StreamEvent
  | RequestStartEvent
  | Message
  | TombstoneMessage
  | ToolUseSummaryMessage,
  Terminal
> {
  const consumedCommandUuids: string[] = []
  const terminal = yield* queryLoop(params, consumedCommandUuids)
  // 只有 queryLoop 正常 return 才会到这里。throw（错误通过 yield* 传播）和
  // .return()（Return 关闭两个 generator）时跳过。
  // 这与 print.ts 的 drainCommandQueue 在 turn 失败时的行为一致——
  // 只有 started 没有 completed 的非对称信号。
  for (const uuid of consumedCommandUuids) {
    notifyCommandLifecycle(uuid, 'completed')
  }
  return terminal
}

// #endregion 🅴

// #region 🅵 queryLoop() — 真正的 while(true) 循环，1400+ 行核心逻辑
async function* queryLoop(
  params: QueryParams,
  consumedCommandUuids: string[],
): AsyncGenerator<
  | StreamEvent
  | RequestStartEvent
  | Message
  | TombstoneMessage
  | ToolUseSummaryMessage,
  Terminal
> {
  // 不可变参数 — 循环期间不会重新赋值
  const {
    systemPrompt,
    userContext,
    systemContext,
    canUseTool,
    fallbackModel,
    querySource,
    maxTurns,
    skipCacheWrite,
  } = params
  const deps = params.deps ?? productionDeps()

  // 跨迭代可变状态。循环体在每次迭代开头解构它，读取时用裸变量名。
  // continue 站点用 `state = { ... }` 一次性更新，避免 9 个单独赋值。
  let state: State = {
    messages: params.messages,
    toolUseContext: params.toolUseContext,
    maxOutputTokensOverride: params.maxOutputTokensOverride,
    autoCompactTracking: undefined,
    stopHookActive: undefined,
    maxOutputTokensRecoveryCount: 0,
    hasAttemptedReactiveCompact: false,
    turnCount: 1,
    pendingToolUseSummary: undefined,
    transition: undefined,
  }
  const budgetTracker = feature('TOKEN_BUDGET') ? createBudgetTracker() : null

  // task_budget.remaining 跨压缩边界追踪。首次压缩前为 undefined——
  // 未压缩时服务端能看到完整历史，自行从 {total} 倒数。
  // 压缩后服务端只看到摘要，会低估消耗；remaining 告诉它被摘要掉的上下文窗口大小。
  // 多次压缩累计：每次减去该次压缩触发时的最终上下文 token 数。
  // 放在循环局部（不在 State 上），避免修改 7 个 continue 站点。
  let taskBudgetRemaining: number | undefined = undefined

  // 入口处快照一次不可变的 env/statsig/session 状态。
  // 详见 QueryConfig，feature() 门控故意不包含在内。
  const config = buildQueryConfig()

  // 每个用户 turn 只触发一次——prompt 在循环迭代间不变，
  // 每次迭代都触发会让 sideQuery 重复问同一个问题 N 次。
  // 消费点轮询 settledAt（永不阻塞）。`using` 在所有 generator 退出路径上 dispose。
  using pendingMemoryPrefetch = startRelevantMemoryPrefetch(
    state.messages,
    state.toolUseContext,
  )

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // 每次迭代开头解构 state。toolUseContext 是唯一在迭代内被重新赋值的
    //（queryTracking、messages 更新）；其余在 continue 站点之间是只读的。
    let { toolUseContext } = state
    const {
      messages,
      autoCompactTracking,
      maxOutputTokensRecoveryCount,
      hasAttemptedReactiveCompact,
      maxOutputTokensOverride,
      pendingToolUseSummary,
      stopHookActive,
      turnCount,
    } = state

    // 技能发现预取 — 每次迭代触发（findWritePivot 守卫在非写入迭代时提前返回）。
    // 在模型流式输出和工具执行期间并行运行；工具执行完后与 memory prefetch 一起 await。
    // 替代了之前在 getAttachmentMessages 内的阻塞 assistant_turn 路径
    //（生产环境 97% 的调用啥也没找到）。
    const pendingSkillPrefetch = skillPrefetch?.startSkillDiscoveryPrefetch(
      null,
      messages,
      toolUseContext,
    )

    // #region 🅶 ① 上下文压缩管道 — toolResultBudget → snip → microcompact → collapse → autocompact
    yield { type: 'stream_request_start' }

    queryCheckpoint('query_fn_entry')

    // 记录查询开始（用于 headless 延迟追踪，子 agent 跳过）
    if (!toolUseContext.agentId) {
      headlessProfilerCheckpoint('query_started')
    }

    // 初始化或递增查询链追踪
    const queryTracking = toolUseContext.queryTracking
      ? {
          chainId: toolUseContext.queryTracking.chainId,
          depth: toolUseContext.queryTracking.depth + 1,
        }
      : {
          chainId: deps.uuid(),
          depth: 0,
        }

    const queryChainIdForAnalytics =
      queryTracking.chainId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS

    toolUseContext = {
      ...toolUseContext,
      queryTracking,
    }

    let messagesForQuery = [...getMessagesAfterCompactBoundary(messages)]

    let tracking = autoCompactTracking

    // 对聚合工具结果大小施加每条消息预算。在 microcompact 之前运行——
    // 缓存 MC 纯粹按 tool_use_id 操作（不检查 content），所以内容替换对它透明。
    // contentReplacementState 为 undefined 时（功能关闭）是 no-op。
    // 只为恢复时需要读回记录的 querySource 持久化：agentId 路由到
    // sidechain 文件（AgentTool resume）或 session 文件（/resume）。
    const persistReplacements =
      querySource.startsWith('agent:') ||
      querySource.startsWith('repl_main_thread')
    messagesForQuery = await applyToolResultBudget(
      messagesForQuery,
      toolUseContext.contentReplacementState,
      persistReplacements
        ? records =>
            void recordContentReplacement(
              records,
              toolUseContext.agentId,
            ).catch(logError)
        : undefined,
      new Set(
        toolUseContext.options.tools
          .filter(t => !Number.isFinite(t.maxResultSizeChars))
          .map(t => t.name),
      ),
    )

    // snip 在 microcompact 之前运行（两者可以同时生效——不互斥）。
    // snipTokensFreed 传给 autocompact，让阈值检查反映 snip 移除的量；
    // tokenCountWithEstimation 本身看不到（它从 protected-tail assistant 读 usage，
    // 而那个消息在 snip 后不变）。
    let snipTokensFreed = 0
    if (feature('HISTORY_SNIP')) {
      queryCheckpoint('query_snip_start')
      const snipResult = snipModule!.snipCompactIfNeeded(messagesForQuery)
      messagesForQuery = snipResult.messages
      snipTokensFreed = snipResult.tokensFreed
      if (snipResult.boundaryMessage) {
        yield snipResult.boundaryMessage
      }
      queryCheckpoint('query_snip_end')
    }

    // microcompact 在 autocompact 之前运行
    queryCheckpoint('query_microcompact_start')
    const microcompactResult = await deps.microcompact(
      messagesForQuery,
      toolUseContext,
      querySource,
    )
    messagesForQuery = microcompactResult.messages
    // 缓存微压缩（cache editing）的 boundary message 延迟到 API 响应后，
    // 以便使用实际的 cache_deleted_input_tokens。
    // 通过 feature() 门控，外部构建会消除该字符串。
    const pendingCacheEdits = feature('CACHED_MICROCOMPACT')
      ? microcompactResult.compactionInfo?.pendingCacheEdits
      : undefined
    queryCheckpoint('query_microcompact_end')

    // 投射折叠后的上下文视图，可能提交更多折叠。
    // 在 autocompact 之前运行——如果折叠就够了，autocompact 就是 no-op，
    // 保留细粒度上下文而非单一摘要。
    //
    // 不 yield 任何内容——折叠视图是 REPL 完整历史上的读时投射。
    // 摘要消息存在折叠存储中，不在 REPL 数组里。
    // 这让折叠跨 turn 持久化：projectView() 每次入口重放提交日志。
    if (feature('CONTEXT_COLLAPSE') && contextCollapse) {
      const collapseResult = await contextCollapse.applyCollapsesIfNeeded(
        messagesForQuery,
        toolUseContext,
        querySource,
      )
      messagesForQuery = collapseResult.messages
    }

    const fullSystemPrompt = asSystemPrompt(
      appendSystemContext(systemPrompt, systemContext),
    )

    queryCheckpoint('query_autocompact_start')
    const { compactionResult, consecutiveFailures } = await deps.autocompact(
      messagesForQuery,
      toolUseContext,
      {
        systemPrompt,
        userContext,
        systemContext,
        toolUseContext,
        forkContextMessages: messagesForQuery,
      },
      querySource,
      tracking,
      snipTokensFreed,
    )
    queryCheckpoint('query_autocompact_end')

    if (compactionResult) {
      const {
        preCompactTokenCount,
        postCompactTokenCount,
        truePostCompactTokenCount,
        compactionUsage,
      } = compactionResult

      logEvent('tengu_auto_compact_succeeded', {
        originalMessageCount: messages.length,
        compactedMessageCount:
          compactionResult.summaryMessages.length +
          compactionResult.attachments.length +
          compactionResult.hookResults.length,
        preCompactTokenCount,
        postCompactTokenCount,
        truePostCompactTokenCount,
        compactionInputTokens: compactionUsage?.input_tokens,
        compactionOutputTokens: compactionUsage?.output_tokens,
        compactionCacheReadTokens:
          compactionUsage?.cache_read_input_tokens ?? 0,
        compactionCacheCreationTokens:
          compactionUsage?.cache_creation_input_tokens ?? 0,
        compactionTotalTokens: compactionUsage
          ? compactionUsage.input_tokens +
            (compactionUsage.cache_creation_input_tokens ?? 0) +
            (compactionUsage.cache_read_input_tokens ?? 0) +
            compactionUsage.output_tokens
          : 0,

        queryChainId: queryChainIdForAnalytics,
        queryDepth: queryTracking.depth,
      })

      // task_budget：在 messagesForQuery 被替换为 postCompactMessages 之前，
      // 捕获压缩前的最终上下文窗口。iterations[-1] 是权威的最终窗口。
      if (params.taskBudget) {
        const preCompactContext =
          finalContextTokensFromLastResponse(messagesForQuery)
        taskBudgetRemaining = Math.max(
          0,
          (taskBudgetRemaining ?? params.taskBudget.total) - preCompactContext,
        )
      }

      // 每次压缩都重置 tracking，让 turnCounter/turnId 反映最近一次压缩。
      // recompactionInfo（autoCompact.ts:190）在调用前已捕获旧值，不会丢失。
      tracking = {
        compacted: true,
        turnId: deps.uuid(),
        turnCounter: 0,
        consecutiveFailures: 0,
      }

      const postCompactMessages = buildPostCompactMessages(compactionResult)

      for (const message of postCompactMessages) {
        yield message
      }

      // 使用压缩后的消息继续当前查询
      messagesForQuery = postCompactMessages
    } else if (consecutiveFailures !== undefined) {
      // Autocompact 失败 — 传播失败计数，让断路器在下次迭代中停止重试。
      tracking = {
        ...(tracking ?? { compacted: false, turnId: '', turnCounter: 0 }),
        consecutiveFailures,
      }
    }

    //TODO: 初始化时不需要设置 toolUseContext.messages，因为这里会更新
    toolUseContext = {
      ...toolUseContext,
      messages: messagesForQuery,
    }

    const assistantMessages: AssistantMessage[] = []
    const toolResults: (UserMessage | AttachmentMessage)[] = []
    // #endregion 🅶

    // #region 🅷 ② 安全检查 + 执行器准备 — token warning + StreamingToolExecutor + model 选择 + blocking limit
    // @see https://docs.claude.com/en/docs/build-with-claude/tool-use
    // 注意：stop_reason === 'tool_use' 不可靠——并不总是正确设置。
    // 在流式接收中每当 tool_use block 到达时设为 true——这是唯一的循环继续信号。
    // 流式结束后如果为 false，就结束循环（除非 stop-hook 重试）。
    const toolUseBlocks: ToolUseBlock[] = []
    let needsFollowUp = false

    queryCheckpoint('query_setup_start')
    const useStreamingToolExecution = config.gates.streamingToolExecution
    let streamingToolExecutor = useStreamingToolExecution
      ? new StreamingToolExecutor(
          toolUseContext.options.tools,
          canUseTool,
          toolUseContext,
        )
      : null

    const appState = toolUseContext.getAppState()
    const permissionMode = appState.toolPermissionContext.mode
    let currentModel = getRuntimeMainLoopModel({
      permissionMode,
      mainLoopModel: toolUseContext.options.mainLoopModel,
      exceeds200kTokens:
        permissionMode === 'plan' &&
        doesMostRecentAssistantMessageExceed200k(messagesForQuery),
    })

    queryCheckpoint('query_setup_end')

    // 每次 query session 创建一次 fetch 包装器，避免内存泄漏。
    // createDumpPromptsFetch 创建的闭包会捕获请求体。
    // 只创建一次意味着只保留最新请求体（~700KB），
    // 而非会话中所有请求体（长会话可达 ~500MB）。
    const dumpPromptsFetch = config.gates.isAnt
      ? createDumpPromptsFetch(toolUseContext.agentId ?? config.sessionId)
      : undefined

    // 如果达到硬阻塞限制则阻止（仅在 auto-compact 关闭时生效）。
    // 预留空间让用户仍能手动运行 /compact。
    // 跳过条件：
    //   - 刚刚压缩过（压缩结果已验证在阈值以下，tokenCountWithEstimation 会用过时值）
    //   - snip 刚运行（减去 snipTokensFreed，避免误判）
    //   - compact/session_memory 查询（分叉 agent 继承完整对话，阻塞会死锁）
    //   - reactiveCompact 启用且允许自动压缩（合成错误会在 API 调用前返回，
    //     reactiveCompact 永远看不到真正的 413）
    //   - context-collapse 启用（同理，recoverFromOverflow 需要真实的 API 413）
    let collapseOwnsIt = false
    if (feature('CONTEXT_COLLAPSE')) {
      collapseOwnsIt =
        (contextCollapse?.isContextCollapseEnabled() ?? false) &&
        isAutoCompactEnabled()
    }
    // 每轮提升一次 media-recovery 门控。扣留（流式循环内）和恢复（之后）必须一致；
    // CACHED_MAY_BE_STALE 可能在 5-30s 流式期间翻转，扣留但不恢复会吃掉消息。
    const mediaRecoveryEnabled =
      reactiveCompact?.isReactiveCompactEnabled() ?? false
    if (
      !compactionResult &&
      querySource !== 'compact' &&
      querySource !== 'session_memory' &&
      !(
        reactiveCompact?.isReactiveCompactEnabled() && isAutoCompactEnabled()
      ) &&
      !collapseOwnsIt
    ) {
      const { isAtBlockingLimit } = calculateTokenWarningState(
        tokenCountWithEstimation(messagesForQuery) - snipTokensFreed,
        toolUseContext.options.mainLoopModel,
      )
      if (isAtBlockingLimit) {
        yield createAssistantAPIErrorMessage({
          content: PROMPT_TOO_LONG_ERROR_MESSAGE,
          error: 'invalid_request',
        })
        return { reason: 'blocking_limit' }
      }
    }

    // #endregion 🅷

    // #region 🅸 ③ 调 Claude API（流式）— callModel 流式循环 + 扣留逻辑 + backfill + streaming tool execution
    let attemptWithFallback = true

    queryCheckpoint('query_api_loop_start')
    try {
      while (attemptWithFallback) {
        attemptWithFallback = false
        try {
          let streamingFallbackOccured = false
          queryCheckpoint('query_api_streaming_start')
          for await (const message of deps.callModel({
            messages: prependUserContext(messagesForQuery, userContext),
            systemPrompt: fullSystemPrompt,
            thinkingConfig: toolUseContext.options.thinkingConfig,
            tools: toolUseContext.options.tools,
            signal: toolUseContext.abortController.signal,
            options: {
              async getToolPermissionContext() {
                const appState = toolUseContext.getAppState()
                return appState.toolPermissionContext
              },
              model: currentModel,
              ...(config.gates.fastModeEnabled && {
                fastMode: appState.fastMode,
              }),
              toolChoice: undefined,
              isNonInteractiveSession:
                toolUseContext.options.isNonInteractiveSession,
              fallbackModel,
              onStreamingFallback: () => {
                streamingFallbackOccured = true
              },
              querySource,
              agents: toolUseContext.options.agentDefinitions.activeAgents,
              allowedAgentTypes:
                toolUseContext.options.agentDefinitions.allowedAgentTypes,
              hasAppendSystemPrompt:
                !!toolUseContext.options.appendSystemPrompt,
              maxOutputTokensOverride,
              fetchOverride: dumpPromptsFetch,
              mcpTools: appState.mcp.tools,
              hasPendingMcpServers: appState.mcp.clients.some(
                c => c.type === 'pending',
              ),
              queryTracking,
              effortValue: appState.effortValue,
              advisorModel: appState.advisorModel,
              skipCacheWrite,
              agentId: toolUseContext.agentId,
              addNotification: toolUseContext.addNotification,
              ...(params.taskBudget && {
                taskBudget: {
                  total: params.taskBudget.total,
                  ...(taskBudgetRemaining !== undefined && {
                    remaining: taskBudgetRemaining,
                  }),
                },
              }),
            },
          })) {
            // 不使用第一次尝试的 tool_calls（否则要合并不同 id 的 assistant 消息）
            if (streamingFallbackOccured) {
              // 为孤立消息 yield tombstone，让它们从 UI 和 transcript 中移除。
              // 这些部分消息（尤其 thinking block）的签名无效，
              // 会导致 "thinking blocks cannot be modified" API 错误。
              for (const msg of assistantMessages) {
                yield { type: 'tombstone' as const, message: msg }
              }
              logEvent('tengu_orphaned_messages_tombstoned', {
                orphanedMessageCount: assistantMessages.length,
                queryChainId: queryChainIdForAnalytics,
                queryDepth: queryTracking.depth,
              })

              assistantMessages.length = 0
              toolResults.length = 0
              toolUseBlocks.length = 0
              needsFollowUp = false

              // 丢弃失败流式尝试的挂起结果，创建新的执行器。
              // 防止孤立 tool_results（带旧 tool_use_ids）在回退响应到达后被 yield。
              if (streamingToolExecutor) {
                streamingToolExecutor.discard()
                streamingToolExecutor = new StreamingToolExecutor(
                  toolUseContext.options.tools,
                  canUseTool,
                  toolUseContext,
                )
              }
            }
            // 在 yield 前对克隆消息回填 tool_use 输入，让 SDK 流输出和
            // transcript 序列化能看到 legacy/derived 字段。
            // 原始 message 不修改——它会回流到 API，修改会破坏 prompt 缓存。
            let yieldMessage: typeof message = message
            if (message.type === 'assistant') {
              let clonedContent: typeof message.message.content | undefined
              for (let i = 0; i < message.message.content.length; i++) {
                const block = message.message.content[i]!
                if (
                  block.type === 'tool_use' &&
                  typeof block.input === 'object' &&
                  block.input !== null
                ) {
                  const tool = findToolByName(
                    toolUseContext.options.tools,
                    block.name,
                  )
                  if (tool?.backfillObservableInput) {
                    const originalInput = block.input as Record<string, unknown>
                    const inputCopy = { ...originalInput }
                    tool.backfillObservableInput(inputCopy)
                    // 仅当 backfill 添加了新字段时才 yield 克隆；
                    // 如果只是覆盖了已有字段（如 file tools 展开 file_path），则跳过。
                    // 覆盖会改变序列化 transcript 并破坏 VCR fixture 哈希。
                    const addedFields = Object.keys(inputCopy).some(
                      k => !(k in originalInput),
                    )
                    if (addedFields) {
                      clonedContent ??= [...message.message.content]
                      clonedContent[i] = { ...block, input: inputCopy }
                    }
                  }
                }
              }
              if (clonedContent) {
                yieldMessage = {
                  ...message,
                  message: { ...message.message, content: clonedContent },
                }
              }
            }
            // 扣留可恢复错误（prompt-too-long、max-output-tokens），
            // 直到确认恢复（collapse drain / reactive compact / 截断重试）能否成功。
            // 仍然 push 到 assistantMessages，让下面的恢复检查能找到它们。
            // 两个子系统的扣留相互独立——关闭一个不影响另一个的恢复路径。
            let withheld = false
            if (feature('CONTEXT_COLLAPSE')) {
              if (
                contextCollapse?.isWithheldPromptTooLong(
                  message,
                  isPromptTooLongMessage,
                  querySource,
                )
              ) {
                withheld = true
              }
            }
            if (reactiveCompact?.isWithheldPromptTooLong(message)) {
              withheld = true
            }
            if (
              mediaRecoveryEnabled &&
              reactiveCompact?.isWithheldMediaSizeError(message)
            ) {
              withheld = true
            }
            if (isWithheldMaxOutputTokens(message)) {
              withheld = true
            }
            if (!withheld) {
              yield yieldMessage
            }
            if (message.type === 'assistant') {
              assistantMessages.push(message)

              const msgToolUseBlocks = message.message.content.filter(
                content => content.type === 'tool_use',
              ) as ToolUseBlock[]
              if (msgToolUseBlocks.length > 0) {
                toolUseBlocks.push(...msgToolUseBlocks)
                needsFollowUp = true
              }

              if (
                streamingToolExecutor &&
                !toolUseContext.abortController.signal.aborted
              ) {
                for (const toolBlock of msgToolUseBlocks) {
                  streamingToolExecutor.addTool(toolBlock, message)
                }
              }
            }

            if (
              streamingToolExecutor &&
              !toolUseContext.abortController.signal.aborted
            ) {
              for (const result of streamingToolExecutor.getCompletedResults()) {
                if (result.message) {
                  yield result.message
                  toolResults.push(
                    ...normalizeMessagesForAPI(
                      [result.message],
                      toolUseContext.options.tools,
                    ).filter(_ => _.type === 'user'),
                  )
                }
              }
            }
          }
          queryCheckpoint('query_api_streaming_end')

          // 使用 API 报告的实际 token 删除数（而非客户端估算）yield 延迟的
          // microcompact boundary message。整个块通过 feature() 门控。
          if (feature('CACHED_MICROCOMPACT') && pendingCacheEdits) {
            const lastAssistant = assistantMessages.at(-1)
            // API 字段是跨请求累计的，所以减去请求前捕获的基线得到增量。
            const usage = lastAssistant?.message.usage
            const cumulativeDeleted = usage
              ? ((usage as unknown as Record<string, number>)
                  .cache_deleted_input_tokens ?? 0)
              : 0
            const deletedTokens = Math.max(
              0,
              cumulativeDeleted - pendingCacheEdits.baselineCacheDeletedTokens,
            )
            if (deletedTokens > 0) {
              yield createMicrocompactBoundaryMessage(
                pendingCacheEdits.trigger,
                0,
                deletedTokens,
                pendingCacheEdits.deletedToolIds,
                [],
              )
            }
          }
        } catch (innerError) {
          if (innerError instanceof FallbackTriggeredError && fallbackModel) {
            // 触发回退 — 切换模型并重试
            currentModel = fallbackModel
            attemptWithFallback = true

            // 清空 assistant 消息，因为我们会重试整个请求
            yield* yieldMissingToolResultBlocks(
              assistantMessages,
              'Model fallback triggered',
            )
            assistantMessages.length = 0
            toolResults.length = 0
            toolUseBlocks.length = 0
            needsFollowUp = false

            // 丢弃失败尝试的挂起结果，创建新执行器。
            // 防止孤立 tool_results 泄漏到重试中。
            if (streamingToolExecutor) {
              streamingToolExecutor.discard()
              streamingToolExecutor = new StreamingToolExecutor(
                toolUseContext.options.tools,
                canUseTool,
                toolUseContext,
              )
            }

            // 更新工具上下文的模型
            toolUseContext.options.mainLoopModel = fallbackModel

            // thinking 签名与模型绑定：将 protected-thinking block 重放到
            // 非 protected 的回退模型会 400。重试前剥离签名。
            if (process.env.USER_TYPE === 'ant') {
              messagesForQuery = stripSignatureBlocks(messagesForQuery)
            }

            // 记录回退事件
            logEvent('tengu_model_fallback_triggered', {
              original_model:
                innerError.originalModel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
              fallback_model:
                fallbackModel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
              entrypoint:
                'cli' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
              queryChainId: queryChainIdForAnalytics,
              queryDepth: queryTracking.depth,
            })

            // yield 回退系统消息 — 使用 'warning' 级别让用户无需 verbose 模式也能看到
            yield createSystemMessage(
              `Switched to ${renderModelName(innerError.fallbackModel)} due to high demand for ${renderModelName(innerError.originalModel)}`,
              'warning',
            )

            continue
          }
          throw innerError
        }
      }
    // #endregion 🅸
    } catch (error) {
      // #region 🅹 ④ 错误处理 — Fallback / Image / generic errors / post-sampling hooks
      logError(error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      logEvent('tengu_query_error', {
        assistantMessages: assistantMessages.length,
        toolUses: assistantMessages.flatMap(_ =>
          _.message.content.filter(content => content.type === 'tool_use'),
        ).length,

        queryChainId: queryChainIdForAnalytics,
        queryDepth: queryTracking.depth,
      })

      // 处理图片大小/缩放错误，生成用户友好的错误消息
      if (
        error instanceof ImageSizeError ||
        error instanceof ImageResizeError
      ) {
        yield createAssistantAPIErrorMessage({
          content: error.message,
        })
        return { reason: 'image_error' }
      }

      // queryModelWithStreaming 通常不应抛出错误，而是 yield 合成 assistant 消息。
      // 但如果因 bug 抛出，可能已经 yield 了 tool_use block 但还没 yield tool_result。
      yield* yieldMissingToolResultBlocks(assistantMessages, errorMessage)

      // 显示真实错误而非误导性的 "[Request interrupted by user]"——
      // 这条路径是模型/运行时故障，不是用户操作。
      yield createAssistantAPIErrorMessage({
        content: errorMessage,
      })

      // 帮助追踪 bug，对内部用户（ant）大声记录日志
      logAntError('Query error', error)
      return { reason: 'model_error', error }
    }

    // 模型响应完成后执行 post-sampling 钩子
    if (assistantMessages.length > 0) {
      void executePostSamplingHooks(
        [...messagesForQuery, ...assistantMessages],
        systemPrompt,
        userContext,
        systemContext,
        toolUseContext,
        querySource,
      )
    }

    // #endregion 🅹

    // #region 🅺 ⑤ 中断检查 — abort handling + streaming tool executor cleanup
    // 在其他逻辑之前先处理流式中断。
    // 使用 streamingToolExecutor 时，必须消费 getRemainingResults()，
    // 让执行器为排队/进行中的工具生成合成 tool_result block。
    // 否则 tool_use block 会缺少匹配的 tool_result block。
    if (toolUseContext.abortController.signal.aborted) {
      if (streamingToolExecutor) {
        // 消费剩余结果 — 执行器为中止的工具生成合成 tool_results
        //（executeTool() 中检查 abort 信号）
        for await (const update of streamingToolExecutor.getRemainingResults()) {
          if (update.message) {
            yield update.message
          }
        }
      } else {
        yield* yieldMissingToolResultBlocks(
          assistantMessages,
          'Interrupted by user',
        )
      }
      // chicago MCP：中断时自动取消隐藏 + 释放锁。
      // 与 stopHooks.ts 中自然 turn 结束路径的清理逻辑相同。仅主线程。
      if (feature('CHICAGO_MCP') && !toolUseContext.agentId) {
        try {
          const { cleanupComputerUseAfterTurn } = await import(
            './utils/computerUse/cleanup.js'
          )
          await cleanupComputerUseAfterTurn(toolUseContext)
        } catch {
          // 清理失败时静默——这是内部测试清理，非关键路径
        }
      }

      // submit-interrupt 跳过中断消息——后续排队的用户消息提供了足够上下文
      if (toolUseContext.abortController.signal.reason !== 'interrupt') {
        yield createUserInterruptionMessage({
          toolUse: false,
        })
      }
      return { reason: 'aborted_streaming' }
    }

    // yield 上一轮的工具摘要 — haiku（~1s）在模型流式期间（5-30s）已解析完
    if (pendingToolUseSummary) {
      const summary = await pendingToolUseSummary
      if (summary) {
        yield summary
      }
    }

    // #endregion 🅺

    // #region 🅻 ⑥ 非跟进分支（!needsFollowUp）— PTL recovery → max_output recovery → stop hooks → token budget → return
    if (!needsFollowUp) {
      const lastMessage = assistantMessages.at(-1)

      // Prompt-too-long 恢复：流式循环扣留了该错误。
      // 先尝试 collapse drain（便宜，保留细粒度上下文），再尝试 reactive compact（全量摘要）。
      // 每种只尝试一次——重试仍然 413 的话，下一阶段处理或错误浮出。
      const isWithheld413 =
        lastMessage?.type === 'assistant' &&
        lastMessage.isApiErrorMessage &&
        isPromptTooLongMessage(lastMessage)
      // Media-size 拒绝（图片/PDF/多图）可通过 reactive compact 的 strip-retry 恢复。
      // 与 PTL 不同，media 错误跳过 collapse drain——collapse 不会剥离图片。
      // 如果超大 media 在保留尾部，压缩后仍会 media-error；
      // hasAttemptedReactiveCompact 防止死循环。
      const isWithheldMedia =
        mediaRecoveryEnabled &&
        reactiveCompact?.isWithheldMediaSizeError(lastMessage)
      if (isWithheld413) {
        // 首先：排空所有暂存的 context-collapses。
        // 以上一次 transition 不是 collapse_drain_retry 为门控——
        // 如果已经排空但重试仍然 413，则降级到 reactive compact。
        if (
          feature('CONTEXT_COLLAPSE') &&
          contextCollapse &&
          state.transition?.reason !== 'collapse_drain_retry'
        ) {
          const drained = contextCollapse.recoverFromOverflow(
            messagesForQuery,
            querySource,
          )
          if (drained.committed > 0) {
            const next: State = {
              messages: drained.messages,
              toolUseContext,
              autoCompactTracking: tracking,
              maxOutputTokensRecoveryCount,
              hasAttemptedReactiveCompact,
              maxOutputTokensOverride: undefined,
              pendingToolUseSummary: undefined,
              stopHookActive: undefined,
              turnCount,
              transition: {
                reason: 'collapse_drain_retry',
                committed: drained.committed,
              },
            }
            state = next
            continue
          }
        }
      }
      if ((isWithheld413 || isWithheldMedia) && reactiveCompact) {
        const compacted = await reactiveCompact.tryReactiveCompact({
          hasAttempted: hasAttemptedReactiveCompact,
          querySource,
          aborted: toolUseContext.abortController.signal.aborted,
          messages: messagesForQuery,
          cacheSafeParams: {
            systemPrompt,
            userContext,
            systemContext,
            toolUseContext,
            forkContextMessages: messagesForQuery,
          },
        })

        if (compacted) {
          // task_budget: same carryover as the proactive path above.
          // messagesForQuery still holds the pre-compact array here (the
          // 413-failed attempt's input).
          if (params.taskBudget) {
            const preCompactContext =
              finalContextTokensFromLastResponse(messagesForQuery)
            taskBudgetRemaining = Math.max(
              0,
              (taskBudgetRemaining ?? params.taskBudget.total) -
                preCompactContext,
            )
          }

          const postCompactMessages = buildPostCompactMessages(compacted)
          for (const msg of postCompactMessages) {
            yield msg
          }
          const next: State = {
            messages: postCompactMessages,
            toolUseContext,
            autoCompactTracking: undefined,
            maxOutputTokensRecoveryCount,
            hasAttemptedReactiveCompact: true,
            maxOutputTokensOverride: undefined,
            pendingToolUseSummary: undefined,
            stopHookActive: undefined,
            turnCount,
            transition: { reason: 'reactive_compact_retry' },
          }
          state = next
          continue
        }

        // 无法恢复 — 暴露扣留的错误并退出。不要降级到 stop hooks：
        // 模型从未产生有效响应，hooks 没有有意义的内容可评估。
        // 在 prompt-too-long 上运行 stop hooks 会造成死循环：
        // error → hook blocking → retry → error → …
        yield lastMessage
        void executeStopFailureHooks(lastMessage, toolUseContext)
        return { reason: isWithheldMedia ? 'image_error' : 'prompt_too_long' }
      } else if (feature('CONTEXT_COLLAPSE') && isWithheld413) {
        // reactiveCompact 被编译排除，但 contextCollapse 扣留了且无法恢复
        //（暂存队列为空/过时）。暴露错误。同样不降级到 stop hooks。
        yield lastMessage
        void executeStopFailureHooks(lastMessage, toolUseContext)
        return { reason: 'prompt_too_long' }
      }

      // 检查 max_output_tokens 错误并注入恢复消息。
      // 该错误在上面的流式循环中被扣留；只有恢复耗尽时才暴露。
      if (isWithheldMaxOutputTokens(lastMessage)) {
        // 升级重试：如果使用了 8k 默认上限并触达限制，
        // 以 64k 重试同一请求——不加 meta 消息，不多轮对话。
        // 每轮只触发一次（由 override 检查守卫），
        // 如果 64k 也触达上限则降级到多轮恢复。
        const capEnabled = getFeatureValue_CACHED_MAY_BE_STALE(
          'tengu_otk_slot_v1',
          false,
        )
        if (
          capEnabled &&
          maxOutputTokensOverride === undefined &&
          !process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS
        ) {
          logEvent('tengu_max_tokens_escalate', {
            escalatedTo: ESCALATED_MAX_TOKENS,
          })
          const next: State = {
            messages: messagesForQuery,
            toolUseContext,
            autoCompactTracking: tracking,
            maxOutputTokensRecoveryCount,
            hasAttemptedReactiveCompact,
            maxOutputTokensOverride: ESCALATED_MAX_TOKENS,
            pendingToolUseSummary: undefined,
            stopHookActive: undefined,
            turnCount,
            transition: { reason: 'max_output_tokens_escalate' },
          }
          state = next
          continue
        }

        if (maxOutputTokensRecoveryCount < MAX_OUTPUT_TOKENS_RECOVERY_LIMIT) {
          const recoveryMessage = createUserMessage({
            content:
              `Output token limit hit. Resume directly — no apology, no recap of what you were doing. ` +
              `Pick up mid-thought if that is where the cut happened. Break remaining work into smaller pieces.`,
            isMeta: true,
          })

          const next: State = {
            messages: [
              ...messagesForQuery,
              ...assistantMessages,
              recoveryMessage,
            ],
            toolUseContext,
            autoCompactTracking: tracking,
            maxOutputTokensRecoveryCount: maxOutputTokensRecoveryCount + 1,
            hasAttemptedReactiveCompact,
            maxOutputTokensOverride: undefined,
            pendingToolUseSummary: undefined,
            stopHookActive: undefined,
            turnCount,
            transition: {
              reason: 'max_output_tokens_recovery',
              attempt: maxOutputTokensRecoveryCount + 1,
            },
          }
          state = next
          continue
        }

        // 恢复耗尽 — 现在暴露扣留的错误。
        yield lastMessage
      }

      // 当最后一条消息是 API 错误（限流/prompt-too-long/认证失败等）时跳过 stop hooks。
      // 模型从未产生真实响应——hooks 评估它会造成死循环。
      if (lastMessage?.isApiErrorMessage) {
        void executeStopFailureHooks(lastMessage, toolUseContext)
        return { reason: 'completed' }
      }

      const stopHookResult = yield* handleStopHooks(
        messagesForQuery,
        assistantMessages,
        systemPrompt,
        userContext,
        systemContext,
        toolUseContext,
        querySource,
        stopHookActive,
      )

      if (stopHookResult.preventContinuation) {
        return { reason: 'stop_hook_prevented' }
      }

      if (stopHookResult.blockingErrors.length > 0) {
        const next: State = {
          messages: [
            ...messagesForQuery,
            ...assistantMessages,
            ...stopHookResult.blockingErrors,
          ],
          toolUseContext,
          autoCompactTracking: tracking,
          maxOutputTokensRecoveryCount: 0,
          // 保留 reactive compact 守卫 — 如果压缩已运行但无法从 prompt-too-long 恢复，
          // stop-hook blocking 后重试会产生同样结果。重置为 false 会导致无限循环：
          // compact → 仍然太长 → error → stop hook blocking → compact → …
          hasAttemptedReactiveCompact,
          maxOutputTokensOverride: undefined,
          pendingToolUseSummary: undefined,
          stopHookActive: true,
          turnCount,
          transition: { reason: 'stop_hook_blocking' },
        }
        state = next
        continue
      }

      if (feature('TOKEN_BUDGET')) {
        const decision = checkTokenBudget(
          budgetTracker!,
          toolUseContext.agentId,
          getCurrentTurnTokenBudget(),
          getTurnOutputTokens(),
        )

        if (decision.action === 'continue') {
          incrementBudgetContinuationCount()
          logForDebugging(
            `Token budget continuation #${decision.continuationCount}: ${decision.pct}% (${decision.turnTokens.toLocaleString()} / ${decision.budget.toLocaleString()})`,
          )
          state = {
            messages: [
              ...messagesForQuery,
              ...assistantMessages,
              createUserMessage({
                content: decision.nudgeMessage,
                isMeta: true,
              }),
            ],
            toolUseContext,
            autoCompactTracking: tracking,
            maxOutputTokensRecoveryCount: 0,
            hasAttemptedReactiveCompact: false,
            maxOutputTokensOverride: undefined,
            pendingToolUseSummary: undefined,
            stopHookActive: undefined,
            turnCount,
            transition: { reason: 'token_budget_continuation' },
          }
          continue
        }

        if (decision.completionEvent) {
          if (decision.completionEvent.diminishingReturns) {
            logForDebugging(
              `Token budget early stop: diminishing returns at ${decision.completionEvent.pct}%`,
            )
          }
          logEvent('tengu_token_budget_completed', {
            ...decision.completionEvent,
            queryChainId: queryChainIdForAnalytics,
            queryDepth: queryTracking.depth,
          })
        }
      }

      return { reason: 'completed' }
    }

    // #endregion 🅻

    // #region 🅼 ⑦ 工具执行 — runTools / streamingToolExecutor.getRemainingResults + abort check
    let shouldPreventContinuation = false
    let updatedToolUseContext = toolUseContext

    queryCheckpoint('query_tool_execution_start')


    if (streamingToolExecutor) {
      logEvent('tengu_streaming_tool_execution_used', {
        tool_count: toolUseBlocks.length,
        queryChainId: queryChainIdForAnalytics,
        queryDepth: queryTracking.depth,
      })
    } else {
      logEvent('tengu_streaming_tool_execution_not_used', {
        tool_count: toolUseBlocks.length,
        queryChainId: queryChainIdForAnalytics,
        queryDepth: queryTracking.depth,
      })
    }

    const toolUpdates = streamingToolExecutor
      ? streamingToolExecutor.getRemainingResults()
      : runTools(toolUseBlocks, assistantMessages, canUseTool, toolUseContext)

    for await (const update of toolUpdates) {
      if (update.message) {
        yield update.message

        if (
          update.message.type === 'attachment' &&
          update.message.attachment.type === 'hook_stopped_continuation'
        ) {
          shouldPreventContinuation = true
        }

        toolResults.push(
          ...normalizeMessagesForAPI(
            [update.message],
            toolUseContext.options.tools,
          ).filter(_ => _.type === 'user'),
        )
      }
      if (update.newContext) {
        updatedToolUseContext = {
          ...update.newContext,
          queryTracking,
        }
      }
    }
    queryCheckpoint('query_tool_execution_end')

    // 工具批次完成后生成工具使用摘要 — 传给下一次迭代
    let nextPendingToolUseSummary:
      | Promise<ToolUseSummaryMessage | null>
      | undefined
    if (
      config.gates.emitToolUseSummaries &&
      toolUseBlocks.length > 0 &&
      !toolUseContext.abortController.signal.aborted &&
      !toolUseContext.agentId // subagents don't surface in mobile UI — skip the Haiku call
    ) {
      // 提取最后一个 assistant text block 作为上下文
      const lastAssistantMessage = assistantMessages.at(-1)
      let lastAssistantText: string | undefined
      if (lastAssistantMessage) {
        const textBlocks = lastAssistantMessage.message.content.filter(
          block => block.type === 'text',
        )
        if (textBlocks.length > 0) {
          const lastTextBlock = textBlocks.at(-1)
          if (lastTextBlock && 'text' in lastTextBlock) {
            lastAssistantText = lastTextBlock.text
          }
        }
      }

      // 收集工具信息用于摘要生成
      const toolUseIds = toolUseBlocks.map(block => block.id)
      const toolInfoForSummary = toolUseBlocks.map(block => {
        // 查找对应的工具结果
        const toolResult = toolResults.find(
          result =>
            result.type === 'user' &&
            Array.isArray(result.message.content) &&
            result.message.content.some(
              content =>
                content.type === 'tool_result' &&
                content.tool_use_id === block.id,
            ),
        )
        const resultContent =
          toolResult?.type === 'user' &&
          Array.isArray(toolResult.message.content)
            ? toolResult.message.content.find(
                (c): c is ToolResultBlockParam =>
                  c.type === 'tool_result' && c.tool_use_id === block.id,
              )
            : undefined
        return {
          name: block.name,
          input: block.input,
          output:
            resultContent && 'content' in resultContent
              ? resultContent.content
              : null,
        }
      })

      // 异步启动摘要生成，不阻塞下一次 API 调用
      nextPendingToolUseSummary = generateToolUseSummary({
        tools: toolInfoForSummary,
        signal: toolUseContext.abortController.signal,
        isNonInteractiveSession: toolUseContext.options.isNonInteractiveSession,
        lastAssistantText,
      })
        .then(summary => {
          if (summary) {
            return createToolUseSummaryMessage(summary, toolUseIds)
          }
          return null
        })
        .catch(() => null)
    }

    // 工具调用期间被中断
    if (toolUseContext.abortController.signal.aborted) {
      // chicago MCP：工具调用中途中断时自动取消隐藏 + 释放锁。
      // 这是 CU 最可能的 Ctrl+C 路径（如慢速截图）。仅主线程。
      if (feature('CHICAGO_MCP') && !toolUseContext.agentId) {
        try {
          const { cleanupComputerUseAfterTurn } = await import(
            './utils/computerUse/cleanup.js'
          )
          await cleanupComputerUseAfterTurn(toolUseContext)
        } catch {
          // 清理失败时静默——非关键路径
        }
      }
      // submit-interrupt 跳过中断消息——后续排队的用户消息提供了足够上下文
      if (toolUseContext.abortController.signal.reason !== 'interrupt') {
        yield createUserInterruptionMessage({
          toolUse: true,
        })
      }
      // 中断返回前检查 maxTurns
      const nextTurnCountOnAbort = turnCount + 1
      if (maxTurns && nextTurnCountOnAbort > maxTurns) {
        yield createAttachmentMessage({
          type: 'max_turns_reached',
          maxTurns,
          turnCount: nextTurnCountOnAbort,
        })
      }
      return { reason: 'aborted_tools' }
    }

    // 如果 hook 指示阻止继续，在这里停止
    if (shouldPreventContinuation) {
      return { reason: 'hook_stopped' }
    }

    // #endregion 🅼

    // #region 🅽 ⑧ 附件注入 + 状态转移 — attachments + memory + skills + queued commands + state = next → continue
    if (tracking?.compacted) {
      tracking.turnCounter++
      logEvent('tengu_post_autocompact_turn', {
        turnId:
          tracking.turnId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        turnCounter: tracking.turnCounter,

        queryChainId: queryChainIdForAnalytics,
        queryDepth: queryTracking.depth,
      })
    }

    // 注意在工具调用完成后再做这一步——API 不允许 tool_result 消息
    // 与普通 user 消息交错。

    // 追踪附件注入前的消息计数（遥测）
    logEvent('tengu_query_before_attachments', {
      messagesForQueryCount: messagesForQuery.length,
      assistantMessagesCount: assistantMessages.length,
      toolResultsCount: toolResults.length,
      queryChainId: queryChainIdForAnalytics,
      queryDepth: queryTracking.depth,
    })

    // 处理附件前获取排队命令快照——这些会作为附件发送让 Claude 在当前 turn 中响应。
    //
    // 排空待处理通知。LocalShellTask 完成是 'next'（MONITOR_TOOL 开启时），
    // 无需 Sleep 即可排空。其他任务类型默认 'later'——由 Sleep 冲刷处理。
    //
    // 斜杠命令排除在中间 turn 排空之外——它们必须在 turn 结束后通过
    // processSlashCommand 处理（经由 useQueueProcessor）。
    //
    // Agent 作用域：队列是进程全局单例，coordinator 和所有子 agent 共享。
    // 每个循环只排空寻址到自己的命令——主线程排空 agentId===undefined，
    // 子 agent 排空自己的 agentId。用户 prompt 只发主线程。
    // eslint-disable-next-line custom-rules/require-tool-match-name -- ToolUseBlock.name has no aliases
    const sleepRan = toolUseBlocks.some(b => b.name === SLEEP_TOOL_NAME)
    const isMainThread =
      querySource.startsWith('repl_main_thread') || querySource === 'sdk'
    const currentAgentId = toolUseContext.agentId
    const queuedCommandsSnapshot = getCommandsByMaxPriority(
      sleepRan ? 'later' : 'next',
    ).filter(cmd => {
      if (isSlashCommand(cmd)) return false
      if (isMainThread) return cmd.agentId === undefined
      // Subagents only drain task-notifications addressed to them — never
      // user prompts, even if someone stamps an agentId on one.
      return cmd.mode === 'task-notification' && cmd.agentId === currentAgentId
    })

    for await (const attachment of getAttachmentMessages(
      null,
      updatedToolUseContext,
      null,
      queuedCommandsSnapshot,
      [...messagesForQuery, ...assistantMessages, ...toolResults],
      querySource,
    )) {
      yield attachment
      toolResults.push(attachment)
    }

    // 消费 memory prefetch：仅当已 settled 且未在之前迭代中消费过时。
    // 未 settled 则跳过（零等待），下次迭代重试——
    // prefetch 有与循环迭代次数一样多的机会。
    // readFileState（跨迭代累计）过滤掉模型已经 Read/Wrote/Edited 的记忆。
    if (
      pendingMemoryPrefetch &&
      pendingMemoryPrefetch.settledAt !== null &&
      pendingMemoryPrefetch.consumedOnIteration === -1
    ) {
      const memoryAttachments = filterDuplicateMemoryAttachments(
        await pendingMemoryPrefetch.promise,
        toolUseContext.readFileState,
      )
      for (const memAttachment of memoryAttachments) {
        const msg = createAttachmentMessage(memAttachment)
        yield msg
        toolResults.push(msg)
      }
      pendingMemoryPrefetch.consumedOnIteration = turnCount - 1
    }


    // 注入预取的技能发现结果。collectSkillDiscoveryPrefetch 发出
    // hidden_by_main_turn——当 prefetch 在此之前解析时为 true（>98% 概率）。
    if (skillPrefetch && pendingSkillPrefetch) {
      const skillAttachments =
        await skillPrefetch.collectSkillDiscoveryPrefetch(pendingSkillPrefetch)
      for (const att of skillAttachments) {
        const msg = createAttachmentMessage(att)
        yield msg
        toolResults.push(msg)
      }
    }

    // 只移除实际被消费为附件的命令。
    // prompt 和 task-notification 命令在上面被转换为附件。
    const consumedCommands = queuedCommandsSnapshot.filter(
      cmd => cmd.mode === 'prompt' || cmd.mode === 'task-notification',
    )
    if (consumedCommands.length > 0) {
      for (const cmd of consumedCommands) {
        if (cmd.uuid) {
          consumedCommandUuids.push(cmd.uuid)
          notifyCommandLifecycle(cmd.uuid, 'started')
        }
      }
      removeFromQueue(consumedCommands)
    }

    // 追踪附件注入后的文件变更附件计数（遥测）
    const fileChangeAttachmentCount = count(
      toolResults,
      tr =>
        tr.type === 'attachment' && tr.attachment.type === 'edited_text_file',
    )

    logEvent('tengu_query_after_attachments', {
      totalToolResultsCount: toolResults.length,
      fileChangeAttachmentCount,
      queryChainId: queryChainIdForAnalytics,
      queryDepth: queryTracking.depth,
    })

    // 在 turn 之间刷新工具，让新连接的 MCP 服务器可用
    if (updatedToolUseContext.options.refreshTools) {
      const refreshedTools = updatedToolUseContext.options.refreshTools()
      if (refreshedTools !== updatedToolUseContext.options.tools) {
        updatedToolUseContext = {
          ...updatedToolUseContext,
          options: {
            ...updatedToolUseContext.options,
            tools: refreshedTools,
          },
        }
      }
    }

    const toolUseContextWithQueryTracking = {
      ...updatedToolUseContext,
      queryTracking,
    }

    // 每次有工具结果且即将进入下一轮迭代时，轮次 +1
    const nextTurnCount = turnCount + 1

    // 周期性任务摘要（供 `claude ps` 使用）——在 turn 中间触发，
    // 让长时间运行的 agent 仍能刷新工作状态。
    // 仅 !agentId 时生效（所有顶层对话都生成摘要；子 agent 不生成）。
    if (feature('BG_SESSIONS')) {
      if (
        !toolUseContext.agentId &&
        taskSummaryModule!.shouldGenerateTaskSummary()
      ) {
        taskSummaryModule!.maybeGenerateTaskSummary({
          systemPrompt,
          userContext,
          systemContext,
          toolUseContext,
          forkContextMessages: [
            ...messagesForQuery,
            ...assistantMessages,
            ...toolResults,
          ],
        })
      }
    }

    // 检查是否达到最大轮次限制
    if (maxTurns && nextTurnCount > maxTurns) {
      yield createAttachmentMessage({
        type: 'max_turns_reached',
        maxTurns,
        turnCount: nextTurnCount,
      })
      return { reason: 'max_turns', turnCount: nextTurnCount }
    }

    queryCheckpoint('query_recursive_call')
    const next: State = {
      messages: [...messagesForQuery, ...assistantMessages, ...toolResults],
      toolUseContext: toolUseContextWithQueryTracking,
      autoCompactTracking: tracking,
      turnCount: nextTurnCount,
      maxOutputTokensRecoveryCount: 0,
      hasAttemptedReactiveCompact: false,
      pendingToolUseSummary: nextPendingToolUseSummary,
      maxOutputTokensOverride: undefined,
      stopHookActive,
      transition: { reason: 'next_turn' },
    }
    state = next
    // #endregion 🅽
  } // while (true)
}
// #endregion 🅵
