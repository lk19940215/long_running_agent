'use strict';

const fs = require('fs');
const path = require('path');
const { buildEnvVars, log } = require('../common/config');
const { Indicator } = require('../common/indicator');
const { logMessage: baseLogMessage, extractResult, writeSessionSeparator } = require('../common/logging');
const { createHooks } = require('./hooks');
const { assets } = require('../common/assets');

/**
 * @typedef {Object} SessionRunOptions
 * @property {string} logFileName - 日志文件名
 * @property {import('fs').WriteStream} [logStream] - 外部日志流（与 logFileName 二选一）
 * @property {number} [sessionNum=0] - 会话编号
 * @property {string} [label=''] - 会话标签
 * @property {(session: Session) => Promise<Object>} execute - 执行回调，接收 session 实例
 */

/**
 * @typedef {Object} QueryResult
 * @property {Array<Object>} messages - 所有 SDK 消息
 * @property {boolean} success - 是否成功完成
 * @property {string|null} subtype - 结果子类型
 * @property {number|null} cost - 美元费用
 * @property {Object|null} usage - token 用量 { input_tokens, output_tokens }
 * @property {number|null} turns - 对话轮次
 */

/**
 * @typedef {Object} RunQueryOpts
 * @property {(message: Object, messages: Array<Object>) => void|'break'} [onMessage] - 每条消息的回调，返回 'break' 中断
 */

/**
 * SDK 会话管理类。通过 Session.run() 创建和管理一次完整的 AI 会话生命周期。
 *
 * 使用方式：
 * ```js
 * const result = await Session.run('coding', config, {
 *   logFileName: 'coding.log',
 *   async execute(session) {
 *     const queryOpts = session.buildQueryOptions();
 *     const { messages, success } = await session.runQuery(prompt, queryOpts);
 *     return { success };
 *   },
 * });
 * ```
 */
class Session {
  /** @type {Object|null} SDK 单例 */
  static _sdk = null;

  /**
   * 确保 SDK 已加载（懒加载单例）
   * @param {Object} config - 项目配置
   * @returns {Promise<Object>} SDK 实例
   */
  static async ensureSDK(config) {
    if (!Session._sdk) {
      Object.assign(process.env, buildEnvVars(config));
      const { loadSDK } = require('../common/sdk');
      Session._sdk = await loadSDK();
    }
    return Session._sdk;
  }

  /**
   * 创建 Session 实例并执行回调，自动管理生命周期（日志、hooks、indicator）
   * @param {string} type - 会话类型（coding | plan | scan | go | simplify | repair 等）
   * @param {Object} config - 项目配置
   * @param {SessionRunOptions} options - 运行选项
   * @returns {Promise<Object>} 包含 exitCode、logFile、stalled 以及 execute 返回值
   */
  static async run(type, config, { logFileName, logStream, sessionNum = 0, label = '', execute }) {
    await Session.ensureSDK(config);
    const session = new Session(type, config, { logFileName, logStream, sessionNum, label });
    try {
      const result = await execute(session);
      session.finish();
      return {
        exitCode: session.isStalled() ? 2 : 0,
        logFile: session.logFile,
        stalled: session.isStalled(),
        ...result,
      };
    } catch (err) {
      session.finish();
      throw err;
    }
  }

  /**
   * @param {string} type - 会话类型
   * @param {Object} config - 项目配置
   * @param {Object} options
   * @param {string} options.logFileName - 日志文件名
   * @param {import('fs').WriteStream} [options.logStream] - 外部日志流
   * @param {number} [options.sessionNum=0]
   * @param {string} [options.label='']
   */
  constructor(type, config, { logFileName, logStream, sessionNum = 0, label = '' }) {
    this.config = config;
    this.type = type;
    this.indicator = new Indicator();
    /** @type {import('fs').WriteStream|null} */
    this.logStream = null;
    /** @type {string|null} */
    this.logFile = null;
    /** @type {Object|null} */
    this.hooks = null;
    /** @type {Function|null} */
    this.cleanup = null;
    this._isStalled = () => false;
    this.abortController = new AbortController();
    this._lastStatusKey = '';

    this._initLogging(logFileName, logStream);
    writeSessionSeparator(this.logStream, sessionNum, label);
    const stallTimeoutMin = this._initHooks(type);
    this._startIndicator(sessionNum, stallTimeoutMin);
  }

  /**
   * 构建 SDK query 选项，自动附加 hooks、abortController、权限模式
   * @param {Object} [overrides={}] - 覆盖选项（permissionMode, projectRoot, model 等）
   * @returns {Object} SDK query options
   */
  buildQueryOptions(overrides = {}) {
    const mode = overrides.permissionMode || 'bypassPermissions';
    const base = {
      permissionMode: mode,
      cwd: overrides.projectRoot || assets.projectRoot,
      env: buildEnvVars(this.config),
      settingSources: ['project'],
      hooks: this.hooks,
      abortController: this.abortController,
    };
    if (mode === 'bypassPermissions') {
      base.allowDangerouslySkipPermissions = true;
    }
    if (this.config.maxTurns > 0) base.maxTurns = this.config.maxTurns;
    if (overrides.model) base.model = overrides.model;
    else if (this.config.model) base.model = this.config.model;
    return base;
  }

  /**
   * 执行一次 SDK 查询，遍历消息流并收集结果
   * @param {string} prompt - 用户提示
   * @param {Object} queryOpts - SDK query 选项（通常来自 buildQueryOptions）
   * @param {RunQueryOpts} [opts={}] - 额外选项（onMessage 回调）
   * @returns {Promise<QueryResult>}
   */
  async runQuery(prompt, queryOpts, opts = {}) {
    const sdk = Session._sdk;
    const messages = [];
    const querySession = sdk.query({ prompt, options: queryOpts });

    for await (const message of querySession) {
      if (this._isStalled()) {
        log('warn', '停顿超时，中断消息循环');
        break;
      }
      messages.push(message);
      this._logMessage(message);

      if (opts.onMessage) {
        const action = opts.onMessage(message, messages);
        if (action === 'break') break;
      }
    }

    const sdkResult = extractResult(messages);
    const cost = sdkResult?.total_cost_usd || null;
    const usage = sdkResult?.usage || null;
    const turns = sdkResult?.num_turns || null;

    if (cost != null || turns != null) {
      const parts = [];
      if (turns != null) parts.push(`turns: ${turns}`);
      if (cost != null) parts.push(`cost: $${cost}`);
      if (usage) {
        const inp = usage.input_tokens || 0;
        const out = usage.output_tokens || 0;
        parts.push(`tokens: ${inp}+${out}`);
      }
      const summary = parts.join(', ');
      log('info', `session 统计: ${summary}`);
      if (this.logStream?.writable) {
        this.logStream.write(`[SESSION_STATS] ${summary}\n`);
      }
    }

    return {
      messages,
      success: sdkResult?.subtype === 'success',
      subtype: sdkResult?.subtype || null,
      cost, usage, turns,
    };
  }

  /** 检查会话是否因停顿超时 */
  isStalled() {
    return this._isStalled();
  }

  /** 结束会话：清理 hooks、关闭日志流、停止 indicator */
  finish() {
    if (this.cleanup) this.cleanup();
    if (this.logStream && !this._externalLogStream) this.logStream.end();
    this.indicator.stop();
  }

  // ─── Private ────────────────────────────────────────────

  _initLogging(logFileName, externalLogStream) {
    if (externalLogStream) {
      this.logStream = externalLogStream;
      this._externalLogStream = true;
    } else {
      const logsDir = assets.dir('logs');
      this.logFile = path.join(logsDir, logFileName);
      this.logStream = fs.createWriteStream(this.logFile, { flags: 'a' });
      this._externalLogStream = false;
    }
  }

  _initHooks(hookType) {
    const stallTimeoutMs = this.config.stallTimeout * 1000;
    const result = createHooks(hookType, this.indicator, this.logStream, {
      stallTimeoutMs,
      abortController: this.abortController,
      editThreshold: this.config.editThreshold,
    });
    this.hooks = result.hooks;
    this.cleanup = result.cleanup;
    this._isStalled = result.isStalled;
    return Math.floor(stallTimeoutMs / 60000);
  }

  _startIndicator(sessionNum, stallTimeoutMin) {
    this.indicator.start(sessionNum, stallTimeoutMin, assets.projectRoot);
  }

  _logMessage(message) {
    const hasText = message.type === 'assistant'
      && message.message?.content?.some(b => b.type === 'text' && b.text);

    if (hasText && this.indicator) {
      this.indicator.pauseRendering();
      process.stderr.write('\r\x1b[K');
    }

    baseLogMessage(message, this.logStream, this.indicator);

    if (hasText && this.indicator) {
      const contentKey = `${this.indicator.phase}|${this.indicator.step}|${this.indicator.toolTarget}`;
      if (contentKey !== this._lastStatusKey) {
        this._lastStatusKey = contentKey;
        const statusLine = this.indicator.getStatusLine();
        if (statusLine) process.stderr.write(statusLine + '\n');
      }
      this.indicator.resumeRendering();
    }
  }
}

module.exports = { Session };
