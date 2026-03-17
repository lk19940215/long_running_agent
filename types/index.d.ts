import { WriteStream } from 'fs';

// ─── Config ───────────────────────────────────────────────

export interface Config {
  provider?: string;
  model?: string;
  defaultOpus?: string;
  maxTurns?: number;
  stallTimeout: number;
  editThreshold?: number;
  mcpPlaywright?: boolean;
  playwrightMode?: 'persistent' | 'isolated' | 'extension';
  simplifyInterval: number;
  simplifyCommits: number;
  [key: string]: unknown;
}

// ─── Main Options ─────────────────────────────────────────

export interface MainOpts {
  max?: number;
  pause?: number;
  dryRun?: boolean;
  readFile?: string;
  model?: string;
  n?: number;
  planOnly?: boolean;
  interactive?: boolean;
  reset?: boolean;
  deployTemplates?: boolean;
  projectRoot?: string;
  reqFile?: string;
}

// ─── Session ──────────────────────────────────────────────

export interface SessionRunOptions {
  logFileName: string;
  logStream?: WriteStream;
  sessionNum?: number;
  label?: string;
  execute: (session: Session) => Promise<Record<string, unknown>>;
}

export interface QueryResult {
  messages: SDKMessage[];
  success: boolean;
  subtype: string | null;
  cost: number | null;
  usage: { input_tokens: number; output_tokens: number } | null;
  turns: number | null;
}

export interface RunQueryOpts {
  onMessage?: (message: SDKMessage, messages: SDKMessage[]) => void | 'break';
}

export interface SDKMessage {
  type: 'assistant' | 'tool_result' | 'result' | string;
  message?: {
    content?: Array<{
      type: 'text' | 'tool_use' | string;
      text?: string;
      name?: string;
      input?: Record<string, unknown>;
    }>;
  };
  result?: string;
  subtype?: string;
  total_cost_usd?: number;
  usage?: { input_tokens: number; output_tokens: number };
  num_turns?: number;
  is_error?: boolean;
  content?: string;
  [key: string]: unknown;
}

export interface SessionRunResult {
  exitCode: number;
  logFile: string | null;
  stalled: boolean;
  [key: string]: unknown;
}

export declare class Session {
  static _sdk: unknown;

  /** 确保 SDK 已加载（懒加载单例） */
  static ensureSDK(config: Config): Promise<unknown>;

  /** 创建 Session 实例并执行回调，自动管理生命周期 */
  static run(type: string, config: Config, options: SessionRunOptions): Promise<SessionRunResult>;

  readonly config: Config;
  readonly type: string;
  readonly indicator: Indicator;
  logStream: WriteStream | null;
  logFile: string | null;
  hooks: unknown;
  abortController: AbortController;

  constructor(
    type: string,
    config: Config,
    options: { logFileName: string; logStream?: WriteStream; sessionNum?: number; label?: string },
  );

  /** 构建 SDK query 选项，自动附加 hooks、abortController、权限模式 */
  buildQueryOptions(overrides?: Record<string, unknown>): Record<string, unknown>;

  /** 执行一次 SDK 查询，遍历消息流并收集结果 */
  runQuery(prompt: string, queryOpts: Record<string, unknown>, opts?: RunQueryOpts): Promise<QueryResult>;

  /** 检查会话是否因停顿超时 */
  isStalled(): boolean;

  /** 结束会话：清理 hooks、关闭日志流、停止 indicator */
  finish(): void;
}

// ─── Indicator ────────────────────────────────────────────

export declare class Indicator {
  phase: 'thinking' | 'coding';
  step: string;
  toolTarget: string;
  sessionNum: number;
  startTime: number;
  stallTimeoutMin: number;
  toolRunning: boolean;
  currentToolName: string;
  projectRoot: string;

  /** 启动 indicator 渲染循环 */
  start(sessionNum: number, stallTimeoutMin: number, projectRoot: string): void;

  /** 停止渲染循环并清除终端行 */
  stop(): void;

  updatePhase(phase: 'thinking' | 'coding'): void;
  updateStep(step: string): void;
  appendActivity(toolName: string, summary: string): void;
  updateActivity(): void;

  /** 标记工具开始执行 */
  startTool(name: string): void;

  /** 标记工具执行结束 */
  endTool(): void;

  pauseRendering(): void;
  resumeRendering(): void;

  /** 生成当前状态行文本 */
  getStatusLine(): string;
}

/** 根据工具名称和输入推断当前阶段和步骤，更新 indicator 状态 */
export declare function inferPhaseStep(
  indicator: Indicator,
  toolName: string,
  toolInput: Record<string, unknown> | string,
): void;

// ─── Main ─────────────────────────────────────────────────

/** 应用入口：初始化资产、加载配置、分发命令 */
export declare function main(
  command: string,
  input: string,
  opts?: MainOpts,
): Promise<unknown>;

// ─── Logging ──────────────────────────────────────────────

/** 处理 SDK 消息并写入日志流 */
export declare function logMessage(
  message: SDKMessage,
  logStream: WriteStream,
  indicator?: Indicator,
): void;

/** 从消息列表中提取 type='result' 的消息 */
export declare function extractResult(messages: SDKMessage[]): SDKMessage | null;

/** 从消息列表中提取结果文本 */
export declare function extractResultText(messages: SDKMessage[]): string;

// ─── AssetManager ─────────────────────────────────────────

export declare class AssetManager {
  projectRoot: string | null;
  loopDir: string | null;
  assetsDir: string | null;
  bundledDir: string;

  init(projectRoot?: string): void;
  path(name: string): string | null;
  dir(name: string): string | null;
  exists(name: string): boolean;
  read(name: string): string | null;
  readJson(name: string, fallback?: unknown): unknown;
  write(name: string, content: string): void;
  writeJson(name: string, data: unknown): void;
  render(name: string, vars?: Record<string, string>): string;
  ensureDirs(): void;
  deployAll(): string[];
  deployRecipes(): string[];

  /** 解析 recipes 目录：先查项目 .claude-coder/recipes/，再 fallback 到 bundled */
  recipesDir(): string;

  clearCache(): void;
}

export declare const assets: AssetManager;
