'use strict';

const fs = require('fs');
const path = require('path');
const { buildEnvVars, log } = require('../common/config');
const { Indicator } = require('../common/indicator');
const { logMessage: baseLogMessage, extractResult, writeSessionSeparator } = require('../common/logging');
const { createHooks } = require('./hooks');
const { assets } = require('../common/assets');

class Session {
  static _sdk = null;

  static async ensureSDK(config) {
    if (!Session._sdk) {
      Object.assign(process.env, buildEnvVars(config));
      const { loadSDK } = require('../common/sdk');
      Session._sdk = await loadSDK();
    }
    return Session._sdk;
  }

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

  constructor(type, config, { logFileName, logStream, sessionNum = 0, label = '' }) {
    this.config = config;
    this.type = type;
    this.indicator = new Indicator();
    this.logStream = null;
    this.logFile = null;
    this.hooks = null;
    this.cleanup = null;
    this._isStalled = () => false;
    this.abortController = new AbortController();
    this._lastStatusKey = '';

    this._initLogging(logFileName, logStream);
    writeSessionSeparator(this.logStream, sessionNum, label);
    const stallTimeoutMin = this._initHooks(type);
    this._startIndicator(sessionNum, stallTimeoutMin);
  }

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

  isStalled() {
    return this._isStalled();
  }

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
