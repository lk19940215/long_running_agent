'use strict';

// ─── Colors ──────────────────────────────────────────────

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

// ─── Log ─────────────────────────────────────────────────

const LOG_TAGS = {
  info:  `${COLOR.blue}[INFO]${COLOR.reset} `,
  ok:    `${COLOR.green}[OK]${COLOR.reset}   `,
  warn:  `${COLOR.yellow}[WARN]${COLOR.reset} `,
  error: `${COLOR.red}[ERROR]${COLOR.reset}`,
};

function log(level, msg) {
  console.error(`${LOG_TAGS[level] || ''} ${msg}`);
}

// ─── Banner ──────────────────────────────────────────────

const REPO_URL = 'https://lk19940215.github.io/claude-coder';

/**
 * @param {string} command - 命令名（run / plan / design / go / simplify / scan）
 * @param {string} detail  - 右侧附加信息（模式、范围等）
 * @param {string} [model] - 模型名
 */
function printModeBanner(command, detail, model) {
  const sep = `  ${COLOR.dim}│${COLOR.reset}  `;
  const parts = [`${COLOR.bold}Claude Coder${COLOR.reset}`, command];
  if (model)  parts.push(`model: ${model}`);
  if (detail) parts.push(detail);
  const inner = parts.join(sep);
  console.error('');
  console.error(`${COLOR.cyan}╔══════════════════════════════════════════════╗${COLOR.reset}`);
  console.error(`${COLOR.cyan}║${COLOR.reset}  ${inner}`);
  console.error(`${COLOR.cyan}║${COLOR.reset}  ${COLOR.dim}${REPO_URL}${COLOR.reset}`);
  console.error(`${COLOR.cyan}╚══════════════════════════════════════════════╝${COLOR.reset}`);
  console.error('');
}

module.exports = { COLOR, log, printModeBanner };
