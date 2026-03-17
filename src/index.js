'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { loadConfig, buildEnvVars, log } = require('./common/config');
const { Indicator } = require('./common/indicator');
const { logMessage: baseLogMessage, extractResult, writeSessionSeparator } = require('./common/logging');
const { createHooks } = require('./core/hooks');
const { assets } = require('./common/assets');

// ─── Session（轻量会话作用域）────────────────────────────

class Session {
  constructor(engine, type, { logFileName, logStream, sessionNum = 0, label = '' }) {
    this.engine = engine;
    this.config = engine.config;
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
    this.indicator.start(sessionNum, stallTimeoutMin, this.engine.projectRoot);
  }

  isStalled() {
    return this._isStalled();
  }

  async runQuery(prompt, queryOpts, opts = {}) {
    const messages = [];
    const querySession = this.engine.sdk.query({ prompt, options: queryOpts });

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

  finish() {
    if (this.cleanup) this.cleanup();
    if (this.logStream && !this._externalLogStream) this.logStream.end();
    this.indicator.stop();
  }
}

// ─── Engine（统一编排器）──────────────────────────────────

class Engine {
  constructor(command, opts = {}) {
    assets.init(opts.projectRoot || process.cwd());
    assets.ensureDirs();
    this.config = loadConfig();
    this.opts = this._resolveModel(opts);
    this.projectRoot = assets.projectRoot;
    this.sdk = null;

    this._checkReady(command);
  }

  _resolveModel(opts) {
    if (!opts.model) {
      opts.model = this.config.defaultOpus || this.config.model;
    }
    return opts;
  }

  _checkReady(command) {
    if (['init', 'scan', 'setup'].includes(command)) return;

    const missing = [];
    if (!assets.exists('profile')) missing.push('project_profile.json');

    const recipesDir = path.join(this.projectRoot, '.claude-coder', 'recipes');
    if (!fs.existsSync(recipesDir) || fs.readdirSync(recipesDir).length === 0) {
      missing.push('recipes/');
    }

    if (missing.length > 0) {
      log('error', `文件缺失: ${missing.join(', ')}，请运行 claude-coder init 初始化项目`);
      process.exit(1);
    }
  }

  buildQueryOptions(opts = {}) {
    const mode = opts.permissionMode || 'bypassPermissions';
    const base = {
      permissionMode: mode,
      cwd: opts.projectRoot || this.projectRoot,
      env: buildEnvVars(this.config),
      settingSources: ['project'],
    };
    if (mode === 'bypassPermissions') {
      base.allowDangerouslySkipPermissions = true;
    }
    if (this.config.maxTurns > 0) base.maxTurns = this.config.maxTurns;
    if (opts.model) base.model = opts.model;
    else if (this.config.model) base.model = this.config.model;
    return base;
  }

  async _ensureSDK() {
    if (!this.sdk) {
      Object.assign(process.env, buildEnvVars(this.config));
      const { loadSDK } = require('./common/sdk');
      this.sdk = await loadSDK();
    }
  }

  // ─── Session Lifecycle ──────────────────────────────────

  async runSession(type, { logFileName, logStream, sessionNum = 0, label = '', execute }) {
    await this._ensureSDK();
    const session = new Session(this, type, { logFileName, logStream, sessionNum, label });
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
      log('error', err.message);
      return { exitCode: 1, error: err.message, logFile: session.logFile };
    }
  }

  // ─── Environment Utilities ──────────────────────────────

  tryPush() {
    try {
      const remotes = execSync('git remote', { cwd: this.projectRoot, encoding: 'utf8' }).trim();
      if (!remotes) return;
      log('info', '正在推送代码...');
      execSync('git push', { cwd: this.projectRoot, stdio: 'inherit' });
      log('ok', '推送成功');
    } catch {
      log('warn', '推送失败 (请检查网络或权限)，继续执行...');
    }
  }

  killServices() {
    const profile = assets.readJson('profile', null);
    if (!profile) return;
    const ports = (profile.services || []).map(s => s.port).filter(Boolean);
    if (ports.length === 0) return;

    for (const port of ports) {
      try {
        if (process.platform === 'win32') {
          const out = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: 'utf8', stdio: 'pipe' }).trim();
          const pids = [...new Set(out.split('\n').map(l => l.trim().split(/\s+/).pop()).filter(Boolean))];
          for (const pid of pids) { try { execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'pipe' }); } catch { /* ignore */ } }
        } else {
          execSync(`lsof -ti :${port} | xargs kill -9 2>/dev/null`, { stdio: 'pipe' });
        }
      } catch { /* no process on port */ }
    }
    log('info', `已停止端口 ${ports.join(', ')} 上的服务`);
  }

  // ─── Command Entry Points ─────────────────────────────

  async plan(input, opts) {
    const { executePlan } = require('./core/plan');
    return executePlan(this, input, { ...this.opts, ...opts });
  }

  async go(input, opts) {
    const { executeGo } = require('./core/go');
    return executeGo(this, input, { ...this.opts, ...opts });
  }

  async coding(sessionNum, opts) {
    const { executeCoding } = require('./core/coding');
    return executeCoding(this, sessionNum, { ...this.opts, ...opts });
  }

  async run(opts) {
    const { executeRun } = require('./core/runner');
    return executeRun(this, { ...this.opts, ...opts });
  }

  async scan(opts) {
    const { executeScan } = require('./core/scan');
    return executeScan(this, { ...this.opts, ...opts });
  }

  async simplify(focus, opts) {
    const { executeSimplify } = require('./core/simplify');
    return executeSimplify(this, focus, { ...this.opts, ...opts });
  }

  async repair(filePath) {
    const { executeRepair } = require('./core/repair');
    return executeRepair(this, filePath);
  }

  async initProject() {
    const { executeInit } = require('./core/init');
    return executeInit(this);
  }
}

module.exports = { Engine };
