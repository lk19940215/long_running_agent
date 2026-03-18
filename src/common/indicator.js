'use strict';

const { COLOR } = require('./config');
const { localTimestamp, truncateMiddle } = require('./utils');

const SPINNERS = ['⠋', '⠙', '⠸', '⠴', '⠦', '⠇'];

function termCols() {
  return process.stderr.columns
    || process.stdout.columns
    || parseInt(process.env.COLUMNS, 10)
    || 70;
}

class Indicator {
  constructor() {
    this.phase = 'thinking';
    this.spinnerIndex = 0;
    this.timer = null;
    this.lastActivityTime = Date.now();
    this.sessionNum = 0;
    this.startTime = Date.now();
    this.stallTimeoutMin = 30;
    this.toolRunning = false;
    this.toolStartTime = 0;
    this._paused = false;
    this.projectRoot = '';
  }

  start(sessionNum, stallTimeoutMin, projectRoot) {
    this.sessionNum = sessionNum;
    this.startTime = Date.now();
    this.lastActivityTime = Date.now();
    if (stallTimeoutMin > 0) this.stallTimeoutMin = stallTimeoutMin;
    if (projectRoot) this.projectRoot = projectRoot;
    this.timer = setInterval(() => this._render(), 1000);
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    process.stderr.write('\r\x1b[K');
  }

  updatePhase(phase) { this.phase = phase; }
  updateActivity() { this.lastActivityTime = Date.now(); }

  startTool() {
    this.toolRunning = true;
    this.toolStartTime = Date.now();
    this.lastActivityTime = Date.now();
  }

  endTool() {
    if (!this.toolRunning) return;
    this.toolRunning = false;
    this.lastActivityTime = Date.now();
  }

  pauseRendering() { this._paused = true; }
  resumeRendering() { this._paused = false; }

  _render() {
    if (this._paused) return;
    this.spinnerIndex++;
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const ss = String(elapsed % 60).padStart(2, '0');
    const spinner = SPINNERS[this.spinnerIndex % SPINNERS.length];
    const phaseLabel = this.phase === 'thinking'
      ? `${COLOR.yellow}思考中${COLOR.reset}`
      : `${COLOR.green}编码中${COLOR.reset}`;

    const idleMs = Date.now() - this.lastActivityTime;
    const idleMin = Math.floor(idleMs / 60000);

    let line = `${spinner} S${this.sessionNum} ${mm}:${ss} ${phaseLabel}`;
    if (idleMin >= 2) {
      if (this.toolRunning) {
        const sec = Math.floor((Date.now() - this.toolStartTime) / 1000);
        line += ` ${COLOR.yellow}工具执行中 ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}${COLOR.reset}`;
      } else {
        line += ` ${COLOR.red}${idleMin}分无响应${COLOR.reset}`;
      }
    }
    process.stderr.write(`\r\x1b[K${line}`);
  }
}

// ─── Path helpers ────────────────────────────────────────

function normalizePath(raw, projectRoot) {
  if (!raw) return '';
  if (projectRoot && raw.startsWith(projectRoot)) {
    const rel = raw.slice(projectRoot.length);
    return (rel[0] === '/' || rel[0] === '\\') ? rel.slice(1) : rel;
  }
  const home = process.env.HOME || process.env.USERPROFILE || '';
  if (home && raw.startsWith(home)) return '~' + raw.slice(home.length);
  const parts = raw.split(/[/\\]/).filter(Boolean);
  return parts.length > 3 ? '.../' + parts.slice(-3).join('/') : raw;
}

function stripAbsolutePaths(str, projectRoot) {
  let result = str;
  if (projectRoot) {
    result = result.replace(new RegExp(projectRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[/\\\\]?', 'g'), './');
  }
  const home = process.env.HOME || process.env.USERPROFILE || '';
  if (home) {
    result = result.replace(new RegExp(home.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[/\\\\]?', 'g'), '~/');
  }
  return result;
}

function extractTarget(input, projectRoot) {
  if (!input || typeof input !== 'object') return '';
  const filePath = input.file_path || input.path || '';
  if (filePath) return normalizePath(filePath, projectRoot);
  const cmd = input.command || '';
  if (cmd) return stripAbsolutePaths(extractBashCore(cmd), projectRoot);
  const pattern = input.pattern || '';
  if (pattern) return `pattern: ${pattern}`;
  return '';
}

// ─── Bash helpers ────────────────────────────────────────

function extractBashLabel(cmd) {
  if (cmd.includes('git ')) return 'Git';
  if (/\b(npm|pnpm|yarn|pip)\b/.test(cmd)) return cmd.match(/\b(npm|pnpm|yarn|pip)\b/)[0];
  if (/\b(sleep|Start-Sleep|timeout\s+\/t)\b/i.test(cmd)) return '等待';
  if (cmd.includes('curl')) return '网络';
  if (/\b(pytest|jest|test)\b/.test(cmd)) return '测试';
  if (/\b(python|node)\s/.test(cmd)) return '执行';
  return '执行';
}

function extractCurlUrl(cmd) {
  const m = cmd.match(/https?:\/\/\S+/);
  return m ? m[0].replace(/['";)}\]>]+$/, '') : null;
}

function extractBashCore(cmd) {
  let clean = cmd.replace(/^(?:(?:cd|source|export)\s+\S+\s*&&\s*)+/g, '').trim();
  clean = clean.replace(/"[^"]*"/g, m => m.replace(/[;|&]/g, '\x00'));
  clean = clean.replace(/'[^']*'/g, m => m.replace(/[;|&]/g, '\x00'));
  clean = clean.split(/\s*(?:\|\|?|;|&&|2>&1|2>\/dev\/null|>\s*\/dev\/null)\s*/)[0];
  clean = clean.replace(/\x00/g, ';').trim();
  clean = clean.replace(/\s*<<\s*['"]?\w+['"]?\s*$/, '');
  return clean;
}

// ─── inferPhaseStep: 输出永久工具行 ─────────────────────

function formatElapsed(indicator) {
  const elapsed = Math.floor((Date.now() - indicator.startTime) / 1000);
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

const CODING_TOOLS = /^(write|edit|multiedit|str_replace_editor|strreplace)$/;
const READ_TOOLS = /^(read|glob|grep|ls)$/;

function inferPhaseStep(indicator, toolName, toolInput) {
  const name = (toolName || '').toLowerCase();
  const displayName = toolName || name;
  const pr = indicator.projectRoot || '';
  const cols = termCols();

  indicator.startTool();

  let step, target;

  if (CODING_TOOLS.test(name)) {
    indicator.updatePhase('coding');
    step = displayName;
    target = normalizePath(
      (typeof toolInput === 'object' ? (toolInput.file_path || toolInput.path || '') : ''), pr
    );
  } else if (name === 'bash' || name === 'shell') {
    const cmd = typeof toolInput === 'object' ? (toolInput.command || '') : String(toolInput || '');
    const label = extractBashLabel(cmd);
    step = displayName;
    const url = (label === '网络') ? extractCurlUrl(cmd) : null;
    target = url || stripAbsolutePaths(extractBashCore(cmd), pr);
    if (['测试', '执行'].includes(label)) indicator.updatePhase('coding');
  } else if (READ_TOOLS.test(name)) {
    indicator.updatePhase('thinking');
    step = displayName;
    target = extractTarget(toolInput, pr);
  } else if (name === 'task') {
    indicator.updatePhase('thinking');
    step = displayName;
    target = '';
  } else if (name === 'websearch' || name === 'webfetch') {
    indicator.updatePhase('thinking');
    step = displayName;
    target = '';
  } else if (name.startsWith('mcp__')) {
    indicator.updatePhase('coding');
    step = name.split('__').pop() || displayName;
    target = typeof toolInput === 'object'
      ? String(toolInput.url || toolInput.text || toolInput.element || '').slice(0, 60)
      : '';
  } else {
    step = displayName;
    target = '';
  }

  const time = localTimestamp();
  const el = formatElapsed(indicator);
  let line = `  ${COLOR.dim}${time}${COLOR.reset} ${COLOR.dim}${el}${COLOR.reset} ${step}`;
  if (target) {
    const maxTarget = Math.max(10, cols - displayWidth(stripAnsi(line)) - 3);
    line += ` ${truncateMiddle(target, maxTarget)}`;
  }
  process.stderr.write(`\r\x1b[K${clampLine(line, cols)}\n`);
}

// ─── Terminal width helpers ──────────────────────────────

function stripAnsi(str) {
  return str.replace(/\x1b\[[^m]*m/g, '');
}

function isWideChar(cp) {
  return (cp >= 0x4E00 && cp <= 0x9FFF)
    || (cp >= 0x3400 && cp <= 0x4DBF)
    || (cp >= 0x3000 && cp <= 0x30FF)
    || (cp >= 0xF900 && cp <= 0xFAFF)
    || (cp >= 0xFF01 && cp <= 0xFF60)
    || (cp >= 0xFFE0 && cp <= 0xFFE6)
    || (cp >= 0xAC00 && cp <= 0xD7AF)
    || (cp >= 0x20000 && cp <= 0x2FA1F);
}

function displayWidth(str) {
  let w = 0;
  for (const ch of str) {
    w += isWideChar(ch.codePointAt(0)) ? 2 : 1;
  }
  return w;
}

function clampLine(line, cols) {
  const max = cols - 1;
  if (displayWidth(stripAnsi(line)) <= max) return line;
  let w = 0, cut = 0, esc = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\x1b') esc = true;
    if (esc) { if (line[i] === 'm') esc = false; continue; }
    const cw = isWideChar(line.codePointAt(i)) ? 2 : 1;
    if (w + cw >= max) { cut = i; break; }
    w += cw;
  }
  return line.slice(0, cut) + '…' + COLOR.reset;
}

module.exports = { Indicator, inferPhaseStep };
