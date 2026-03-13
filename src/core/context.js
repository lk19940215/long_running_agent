'use strict';

const fs = require('fs');
const path = require('path');
const { loadConfig, buildEnvVars, log } = require('../common/config');
const { Indicator } = require('../common/indicator');
const { logMessage: baseLogMessage } = require('../common/logging');
const { createHooks } = require('./hooks');
const { assets } = require('../common/assets');

class SessionContext {
  constructor(type, opts = {}) {
    this.type = type;
    this.opts = opts;
    assets.init(opts.projectRoot || process.cwd());
    this.config = loadConfig();
    this._applyEnvConfig();
    this.indicator = new Indicator();
    this.logStream = null;
    this.logFile = null;
    this.hooks = null;
    this.cleanup = null;
    this._isStalled = () => false;
    this.abortController = new AbortController();
    this._lastStatusKey = '';
    this._needsNewline = false;
  }

  _applyEnvConfig() {
    Object.assign(process.env, buildEnvVars(this.config));
  }

  initLogging(logFileName, externalLogStream) {
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

  initHooks(hookType) {
    const stallTimeoutMs = this.config.stallTimeout * 1000;
    const completionTimeoutMs = this.config.completionTimeout * 1000;
    const result = createHooks(hookType, this.indicator, this.logStream, {
      stallTimeoutMs,
      abortController: this.abortController,
      editThreshold: this.config.editThreshold,
      completionTimeoutMs,
    });
    this.hooks = result.hooks;
    this.cleanup = result.cleanup;
    this._isStalled = result.isStalled;
    return Math.floor(stallTimeoutMs / 60000);
  }

  startIndicator(sessionNum, stallTimeoutMin) {
    this.indicator.start(sessionNum, stallTimeoutMin);
  }

  isStalled() {
    return this._isStalled();
  }

  async runQuery(sdk, prompt, queryOpts) {
    const collected = [];
    const session = sdk.query({ prompt, options: queryOpts });

    for await (const message of session) {
      if (this._isStalled()) {
        log('warn', '停顿超时，中断消息循环');
        break;
      }
      collected.push(message);
      this._logMessage(message);
    }

    return collected;
  }

  _logMessage(message) {
    const hasText = message.type === 'assistant'
      && message.message?.content?.some(b => b.type === 'text' && b.text);

    if (hasText && this.indicator) {
      this.indicator.pauseRendering();
      process.stderr.write('\r\x1b[K');
    }

    baseLogMessage(message, this.logStream, this.indicator);

    if (hasText) {
      const textBlocks = message.message.content.filter(b => b.type === 'text' && b.text);
      const lastText = textBlocks[textBlocks.length - 1];
      this._needsNewline = lastText && !lastText.text.endsWith('\n');
    }

    if (hasText && this.indicator) {
      if (this._needsNewline) {
        process.stdout.write('\n');
        this._needsNewline = false;
      }
      const contentKey = `${this.indicator.phase}|${this.indicator.step}|${this.indicator.toolTarget}`;
      if (contentKey !== this._lastStatusKey) {
        this._lastStatusKey = contentKey;
        const statusLine = this.indicator.getStatusLine();
        if (statusLine) process.stderr.write(statusLine + '\n');
      }
      this.indicator.resumeRendering();
    }
  }

  finish() {
    if (this._needsNewline) {
      process.stdout.write('\n');
      this._needsNewline = false;
    }
    if (this.cleanup) this.cleanup();
    if (this.logStream && !this._externalLogStream) this.logStream.end();
    this.indicator.stop();
  }

  errorFinish(err) {
    this.finish();
    log('error', err.message);
  }
}

module.exports = { SessionContext };
