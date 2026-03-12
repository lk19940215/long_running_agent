'use strict';

const fs = require('fs');

const COLOR = {
  red: '\x1b[0;31m',
  green: '\x1b[0;32m',
  yellow: '\x1b[1;33m',
  blue: '\x1b[0;34m',
  magenta: '\x1b[0;35m',
  cyan: '\x1b[0;36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  reset: '\x1b[0m',
};

function log(level, msg) {
  const tags = {
    info:  `${COLOR.blue}[INFO]${COLOR.reset} `,
    ok:    `${COLOR.green}[OK]${COLOR.reset}   `,
    warn:  `${COLOR.yellow}[WARN]${COLOR.reset} `,
    error: `${COLOR.red}[ERROR]${COLOR.reset}`,
  };
  console.error(`${tags[level] || ''} ${msg}`);
}

// --------------- .env parsing ---------------

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

// --------------- Model mapping ---------------

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
    mcpPlaywright: env.MCP_PLAYWRIGHT === 'true',
    playwrightMode: env.MCP_PLAYWRIGHT_MODE || 'persistent',
    disableNonessential: env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC || '',
    effortLevel: env.CLAUDE_CODE_EFFORT_LEVEL || '',
    defaultOpus: env.ANTHROPIC_DEFAULT_OPUS_MODEL || '',
    defaultSonnet: env.ANTHROPIC_DEFAULT_SONNET_MODEL || '',
    defaultHaiku: env.ANTHROPIC_DEFAULT_HAIKU_MODEL || '',
    thinkingBudget: env.ANTHROPIC_THINKING_BUDGET || '',
    stallTimeout: parseInt(env.SESSION_STALL_TIMEOUT, 10) || 1200,
    completionTimeout: parseInt(env.SESSION_COMPLETION_TIMEOUT, 10) || 300,
    maxTurns: parseInt(env.SESSION_MAX_TURNS, 10) || 0,
    editThreshold: parseInt(env.EDIT_THRESHOLD, 10) || 15,
    simplifyInterval: parseInt(env.SIMPLIFY_INTERVAL, 10) || 0,
    simplifyCommits: parseInt(env.SIMPLIFY_COMMITS, 10) || 3,
    raw: env,
  };

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

// --------------- Allowed tools ---------------

function getAllowedTools(config) {
  const tools = [
    'Read', 'Edit', 'MultiEdit', 'Write',
    'Bash', 'Glob', 'Grep', 'LS',
    'Task',
    'WebSearch', 'WebFetch',
  ];
  if (config.mcpPlaywright) tools.push('mcp__playwright__*');
  return tools;
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
  COLOR,
  log,
  parseEnvFile,
  loadConfig,
  buildEnvVars,
  getAllowedTools,
  updateEnvVar,
};
