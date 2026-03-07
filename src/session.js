'use strict';

const fs = require('fs');
const path = require('path');
const { paths, loadConfig, buildEnvVars, getAllowedTools, log } = require('./config');
const { Indicator } = require('./indicator');
const { createSessionHooks } = require('./hooks');
const { buildSystemPrompt, buildCodingPrompt, buildScanPrompt, buildAddSystemPrompt, buildAddPrompt } = require('./prompts');

// ── SDK loader (cached, shared across sessions) ──

let _sdkModule = null;
async function loadSDK() {
  if (_sdkModule) return _sdkModule;

  const pkgName = '@anthropic-ai/claude-agent-sdk';
  const attempts = [
    () => import(pkgName),
    () => {
      const { createRequire } = require('module');
      const resolved = createRequire(__filename).resolve(pkgName);
      return import(resolved);
    },
    () => {
      const { createRequire } = require('module');
      const resolved = createRequire(path.join(process.cwd(), 'noop.js')).resolve(pkgName);
      return import(resolved);
    },
    () => {
      const { execSync } = require('child_process');
      const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
      const sdkDir = path.join(globalRoot, pkgName);
      const pkgJson = JSON.parse(fs.readFileSync(path.join(sdkDir, 'package.json'), 'utf8'));
      const entry = pkgJson.exports?.['.'] || pkgJson.main || 'index.js';
      const entryFile = typeof entry === 'object' ? (entry.import || entry.default || entry.node) : entry;
      return import(path.join(sdkDir, entryFile));
    },
  ];

  for (const attempt of attempts) {
    try {
      _sdkModule = await attempt();
      return _sdkModule;
    } catch { /* try next */ }
  }

  log('error', `未找到 ${pkgName}`);
  log('error', `请先安装：npm install -g ${pkgName}`);
  process.exit(1);
}

// ── Helpers ──

function applyEnvConfig(config) {
  Object.assign(process.env, buildEnvVars(config));
}

function buildQueryOptions(config, opts = {}) {
  const base = {
    allowedTools: getAllowedTools(config),
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    cwd: opts.projectRoot || process.cwd(),
    env: buildEnvVars(config),
    settingSources: ['project'],
  };
  if (opts.model) base.model = opts.model;
  else if (config.model) base.model = config.model;
  return base;
}

function extractResult(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].type === 'result') return messages[i];
  }
  return null;
}

function writeSessionSeparator(logStream, sessionNum, label) {
  const sep = '='.repeat(60);
  logStream.write(`\n${sep}\n[Session ${sessionNum}] ${label} ${new Date().toISOString()}\n${sep}\n`);
}

let _lastPrintedStatusKey = '';

function logMessage(message, logStream, indicator) {
  if (message.type === 'assistant' && message.message?.content) {
    for (const block of message.message.content) {
      if (block.type === 'text' && block.text) {
        if (indicator) {
          process.stderr.write('\r\x1b[K');
          const contentKey = `${indicator.phase}|${indicator.step}|${indicator.toolTarget}`;
          if (contentKey !== _lastPrintedStatusKey) {
            _lastPrintedStatusKey = contentKey;
            const statusLine = indicator.getStatusLine();
            if (statusLine) process.stderr.write(statusLine + '\n');
          }
        }
        process.stdout.write(block.text);
        if (logStream) logStream.write(block.text);
      }
      if (block.type === 'tool_use' && logStream) {
        logStream.write(`[TOOL_USE] ${block.name}: ${JSON.stringify(block.input).slice(0, 300)}\n`);
      }
    }
  }

  if (message.type === 'tool_result' && logStream) {
    const isErr = message.is_error || false;
    const content = typeof message.content === 'string'
      ? message.content.slice(0, 500)
      : JSON.stringify(message.content).slice(0, 500);
    if (isErr) {
      logStream.write(`[TOOL_ERROR] ${content}\n`);
    }
  }
}

// ── Session runners ──

async function runCodingSession(sessionNum, opts = {}) {
  const sdk = await loadSDK();
  const config = loadConfig();
  applyEnvConfig(config);
  const indicator = new Indicator();

  const prompt = buildCodingPrompt(sessionNum, opts);
  const systemPrompt = buildSystemPrompt(false);

  const p = paths();
  const taskId = opts.taskId || 'unknown';
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const logFile = path.join(p.logsDir, `${taskId}_session_${sessionNum}_${dateStr}.log`);
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });

  writeSessionSeparator(logStream, sessionNum, `coding task=${taskId}`);

  const stallTimeoutMs = config.stallTimeout * 1000;
  const abortController = new AbortController();
  const { hooks, cleanup, isStalled } = createSessionHooks(indicator, logStream, {
    enableStallDetection: true,
    stallTimeoutMs,
    abortController,
    enableEditGuard: true,
    editThreshold: config.editThreshold,
  });

  const stallTimeoutMin = Math.floor(stallTimeoutMs / 60000);
  indicator.start(sessionNum, stallTimeoutMin);

  try {
    const queryOpts = buildQueryOptions(config, opts);
    queryOpts.systemPrompt = systemPrompt;
    queryOpts.hooks = hooks;
    queryOpts.abortController = abortController;

    const session = sdk.query({ prompt, options: queryOpts });

    const collected = [];
    for await (const message of session) {
      if (isStalled()) {
        log('warn', '停顿超时，中断消息循环');
        break;
      }
      collected.push(message);
      logMessage(message, logStream, indicator);
    }

    cleanup();
    logStream.end();
    indicator.stop();

    const result = extractResult(collected);
    return {
      exitCode: isStalled() ? 2 : 0,
      cost: result?.total_cost_usd ?? null,
      tokenUsage: result?.usage ?? null,
      logFile,
      stalled: isStalled(),
    };
  } catch (err) {
    cleanup();
    logStream.end();
    indicator.stop();
    log('error', `Claude SDK 错误: ${err.message}`);
    return {
      exitCode: 1,
      cost: null,
      tokenUsage: null,
      logFile,
      error: err.message,
    };
  }
}

async function runScanSession(requirement, opts = {}) {
  const sdk = await loadSDK();
  const config = loadConfig();
  applyEnvConfig(config);
  const indicator = new Indicator();

  const projectType = hasCodeFiles(opts.projectRoot || process.cwd()) ? 'existing' : 'new';
  const prompt = buildScanPrompt(projectType, requirement);
  const systemPrompt = buildSystemPrompt(true);

  const p = paths();
  const logFile = path.join(p.logsDir, `scan_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.log`);
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });

  writeSessionSeparator(logStream, 0, `scan (${projectType})`);

  const stallTimeoutMs = config.stallTimeout * 1000;
  const abortController = new AbortController();
  const { hooks, cleanup, isStalled } = createSessionHooks(indicator, logStream, {
    enableStallDetection: true,
    stallTimeoutMs,
    abortController,
  });

  indicator.start(0, Math.floor(stallTimeoutMs / 60000));
  log('info', `正在调用 Claude Code 执行项目扫描（${projectType}项目）...`);

  try {
    const queryOpts = buildQueryOptions(config, opts);
    queryOpts.systemPrompt = systemPrompt;
    queryOpts.hooks = hooks;
    queryOpts.abortController = abortController;

    const session = sdk.query({ prompt, options: queryOpts });

    const collected = [];
    for await (const message of session) {
      if (isStalled()) {
        log('warn', '扫描停顿超时，中断');
        break;
      }
      collected.push(message);
      logMessage(message, logStream, indicator);
    }

    cleanup();
    logStream.end();
    indicator.stop();

    const result = extractResult(collected);
    return {
      exitCode: isStalled() ? 2 : 0,
      cost: result?.total_cost_usd ?? null,
      logFile,
      stalled: isStalled(),
    };
  } catch (err) {
    cleanup();
    logStream.end();
    indicator.stop();
    log('error', `扫描失败: ${err.message}`);
    return { exitCode: 1, cost: null, logFile, error: err.message };
  }
}

async function runAddSession(instruction, opts = {}) {
  const sdk = await loadSDK();
  const config = loadConfig();
  applyEnvConfig(config);
  const indicator = new Indicator();

  const systemPrompt = buildAddSystemPrompt();
  const prompt = buildAddPrompt(instruction);

  const p = paths();
  const logFile = path.join(p.logsDir, `add_tasks_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.log`);
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });

  writeSessionSeparator(logStream, 0, 'add tasks');

  const stallTimeoutMs = config.stallTimeout * 1000;
  const abortController = new AbortController();
  const { hooks, cleanup, isStalled } = createSessionHooks(indicator, logStream, {
    enableStallDetection: true,
    stallTimeoutMs,
    abortController,
  });

  indicator.start(0, Math.floor(stallTimeoutMs / 60000));
  log('info', '正在追加任务...');

  try {
    const queryOpts = buildQueryOptions(config, opts);
    queryOpts.systemPrompt = systemPrompt;
    queryOpts.hooks = hooks;
    queryOpts.abortController = abortController;

    const session = sdk.query({ prompt, options: queryOpts });

    for await (const message of session) {
      if (isStalled()) {
        log('warn', '追加任务停顿超时，中断');
        break;
      }
      logMessage(message, logStream, indicator);
    }

    cleanup();
    logStream.end();
    indicator.stop();
    log('ok', '任务追加完成');
  } catch (err) {
    cleanup();
    logStream.end();
    indicator.stop();
    log('error', `任务追加失败: ${err.message}`);
  }
}

function hasCodeFiles(projectRoot) {
  const markers = [
    'package.json', 'pyproject.toml', 'requirements.txt', 'setup.py',
    'Cargo.toml', 'go.mod', 'pom.xml', 'build.gradle',
    'Makefile', 'Dockerfile', 'docker-compose.yml',
    'README.md', 'main.py', 'app.py', 'index.js', 'index.ts',
  ];
  for (const m of markers) {
    if (fs.existsSync(path.join(projectRoot, m))) return true;
  }
  for (const d of ['src', 'lib', 'app', 'backend', 'frontend', 'web', 'server', 'client']) {
    if (fs.existsSync(path.join(projectRoot, d)) && fs.statSync(path.join(projectRoot, d)).isDirectory()) return true;
  }
  return false;
}

module.exports = {
  loadSDK,
  runCodingSession,
  runScanSession,
  runAddSession,
  hasCodeFiles,
};
