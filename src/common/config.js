'use strict';

const fs = require('fs');

// ─── 常量（原 constants.js）─────────────────────────────

const TASK_STATUSES = Object.freeze(['pending', 'in_progress', 'testing', 'done', 'failed']);

const STATUS_TRANSITIONS = Object.freeze({
  pending: ['in_progress'],
  in_progress: ['testing'],
  testing: ['done', 'failed'],
  failed: ['in_progress'],
  done: [],
});

const FILES = Object.freeze({
  SESSION_RESULT: 'session_result.json',
  TASKS: 'tasks.json',
  PROFILE: 'project_profile.json',
  PROGRESS: 'progress.json',
  TEST_ENV: 'test.env',
  PLAYWRIGHT_AUTH: 'playwright-auth.json',
  ENV: '.env',
  MCP_CONFIG: '.mcp.json',
});

const RETRY = Object.freeze({
  MAX_ATTEMPTS: 3,
  SCAN_ATTEMPTS: 3,
});

const EDIT_THRESHOLD = 15;

// ─── .env 解析 ───────────────────────────────────────────

function parseEnvFile(filepath) {
  if (!fs.existsSync(filepath)) return {};
  const content = fs.readFileSync(filepath, 'utf8');
  const vars = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) {
      vars[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  return vars;
}

// ─── 配置加载 ────────────────────────────────────────────

function loadConfig() {
  const { assets } = require('./assets');
  const envPath = assets.path('env');
  const env = envPath ? parseEnvFile(envPath) : {};
  const config = {
    provider: env.MODEL_PROVIDER || 'claude',
    baseUrl: env.ANTHROPIC_BASE_URL || '',
    apiKey: env.ANTHROPIC_API_KEY || '',
    authToken: env.ANTHROPIC_AUTH_TOKEN || '',
    model: env.ANTHROPIC_MODEL || '',
    timeoutMs: parseInt(env.API_TIMEOUT_MS, 10) || 3000000,
    webTestTool: env.WEB_TEST_TOOL || '',
    webTestMode: env.WEB_TEST_MODE || 'persistent',
    disableNonessential: env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC || '',
    effortLevel: env.CLAUDE_CODE_EFFORT_LEVEL || '',
    defaultOpus: env.ANTHROPIC_DEFAULT_OPUS_MODEL || '',
    defaultSonnet: env.ANTHROPIC_DEFAULT_SONNET_MODEL || '',
    defaultHaiku: env.ANTHROPIC_DEFAULT_HAIKU_MODEL || '',
    thinkingBudget: env.ANTHROPIC_THINKING_BUDGET || '',
    stallTimeout: parseInt(env.SESSION_STALL_TIMEOUT, 10) || 600,
    completionTimeout: parseInt(env.SESSION_COMPLETION_TIMEOUT, 10) || 300,
    maxTurns: parseInt(env.SESSION_MAX_TURNS, 10) || 0,
    editThreshold: parseInt(env.EDIT_THRESHOLD, 10) || 15,
    simplifyInterval: env.SIMPLIFY_INTERVAL !== undefined ? parseInt(env.SIMPLIFY_INTERVAL, 10) : 5,
    simplifyCommits: env.SIMPLIFY_COMMITS !== undefined ? parseInt(env.SIMPLIFY_COMMITS, 10) : 5,
    raw: env,
  };

  // 以下是兼容deepseek最实惠的而改写的配置，不一定正确。只是多次调用后得出的结果。
  if (config.baseUrl && config.baseUrl.includes('deepseek') && config.model === 'deepseek-chat') {
    config.model = 'claude-3-haiku-20240307';
    config.defaultOpus = 'claude-3-haiku-20240307';
    config.defaultSonnet = 'claude-3-haiku-20240307';
    config.defaultHaiku = 'claude-3-haiku-20240307';
    config.thinkingBudget = '0';
  }

  return config;
}

function buildEnvVars(config) {
  const env = { ...process.env };
  if (config.baseUrl) env.ANTHROPIC_BASE_URL = config.baseUrl;
  if (config.apiKey) env.ANTHROPIC_API_KEY = config.apiKey;
  if (config.authToken) env.ANTHROPIC_AUTH_TOKEN = config.authToken;
  if (config.model) env.ANTHROPIC_MODEL = config.model;
  if (config.timeoutMs) env.API_TIMEOUT_MS = String(config.timeoutMs);
  if (config.disableNonessential) env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = config.disableNonessential;
  if (config.effortLevel) env.CLAUDE_CODE_EFFORT_LEVEL = config.effortLevel;
  if (config.defaultOpus) env.ANTHROPIC_DEFAULT_OPUS_MODEL = config.defaultOpus;
  if (config.defaultSonnet) env.ANTHROPIC_DEFAULT_SONNET_MODEL = config.defaultSonnet;
  if (config.defaultHaiku) env.ANTHROPIC_DEFAULT_HAIKU_MODEL = config.defaultHaiku;
  if (config.thinkingBudget) env.ANTHROPIC_THINKING_BUDGET = config.thinkingBudget;
  return env;
}

function updateEnvVar(key, value) {
  const { assets } = require('./assets');
  const envPath = assets.path('env');
  if (!envPath || !fs.existsSync(envPath)) return false;
  let content = fs.readFileSync(envPath, 'utf8');
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    const suffix = content.endsWith('\n') ? '' : '\n';
    content += `${suffix}${key}=${value}\n`;
  }
  fs.writeFileSync(envPath, content, 'utf8');
  return true;
}

module.exports = {
  TASK_STATUSES,
  STATUS_TRANSITIONS,
  FILES,
  RETRY,
  EDIT_THRESHOLD,
  parseEnvFile,
  loadConfig,
  buildEnvVars,
  updateEnvVar,
};
