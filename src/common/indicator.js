'use strict';

const { COLOR } = require('./config');
const { localTimestamp, truncatePath, truncateCommand } = require('./utils');

const SPINNERS = ['⠋', '⠙', '⠸', '⠴', '⠦', '⠇'];

class Indicator {
  constructor() {
    this.phase = 'thinking';
    this.step = '';
    this.toolTarget = '';
    this.spinnerIndex = 0;
    this.timer = null;
    this.lastActivity = '';
    this.lastToolTime = Date.now();
    this.lastActivityTime = Date.now();
    this.sessionNum = 0;
    this.startTime = Date.now();
    this.stallTimeoutMin = 30;
    this.toolRunning = false;
    this.toolStartTime = 0;
    this.currentToolName = '';
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
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    process.stderr.write('\r\x1b[K');
  }

  updatePhase(phase) { this.phase = phase; }
  updateStep(step) { this.step = step; }

  appendActivity(toolName, summary) {
    this.lastActivity = `${toolName}: ${summary}`;
  }

  updateActivity() { this.lastActivityTime = Date.now(); }

  startTool(name) {
    this.toolRunning = true;
    this.toolStartTime = Date.now();
    this.currentToolName = name;
    this.lastActivityTime = Date.now();
  }

  endTool() {
    if (!this.toolRunning) return;
    this.toolRunning = false;
    this.lastActivityTime = Date.now();
  }

  pauseRendering() { this._paused = true; }
  resumeRendering() { this._paused = false; }

  getStatusLine() {
    const cols = process.stderr.columns || 120;
    const clock = localTimestamp();
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const ss = String(elapsed % 60).padStart(2, '0');
    const spinner = SPINNERS[this.spinnerIndex % SPINNERS.length];

    const phaseLabel = this.phase === 'thinking'
      ? `${COLOR.yellow}思考中${COLOR.reset}`
      : `${COLOR.green}编码中${COLOR.reset}`;

    const idleMs = Date.now() - this.lastActivityTime;
    const idleMin = Math.floor(idleMs / 60000);

    let line = `${spinner} ${clock} S${this.sessionNum} ${mm}:${ss} ${phaseLabel}`;

    if (idleMin >= 2) {
      if (this.toolRunning) {
        const toolSec = Math.floor((Date.now() - this.toolStartTime) / 1000);
        const toolMm = Math.floor(toolSec / 60);
        const toolSs = toolSec % 60;
        line += ` ${COLOR.yellow}工具执行中 ${toolMm}:${String(toolSs).padStart(2, '0')}${COLOR.reset}`;
      } else {
        line += ` ${COLOR.red}${idleMin}分无响应(${this.stallTimeoutMin}分钟超时自动中断)${COLOR.reset}`;
      }
    } else if (this.step) {
      line += ` ${this.step}`;
      if (this.toolTarget) {
        const visLen = stripAnsi(line).length;
        const availWidth = Math.max(10, cols - visLen - 3);
        const target = truncatePath(this.toolTarget, availWidth);
        line += `: ${target}`;
      }
    }

    return clampLine(line, cols);
  }

  _render() {
    if (this._paused) return;
    this.spinnerIndex++;
    process.stderr.write(`\r\x1b[K${this.getStatusLine()}`);
  }
}

function stripAnsi(str) {
  return str.replace(/\x1b\[[^m]*m/g, '');
}

function clampLine(line, cols) {
  const maxVisible = cols - 1;
  const visible = stripAnsi(line);
  if (visible.length <= maxVisible) return line;

  let visCount = 0;
  let cutIdx = 0;
  let inEsc = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\x1b') { inEsc = true; }
    if (inEsc) {
      if (line[i] === 'm') inEsc = false;
      continue;
    }
    visCount++;
    if (visCount >= maxVisible) { cutIdx = i; break; }
  }
  return line.slice(0, cutIdx) + '…' + COLOR.reset;
}

function extractFileTarget(toolInput, projectRoot) {
  const raw = typeof toolInput === 'object'
    ? (toolInput.file_path || toolInput.path || '')
    : '';
  if (!raw) return '';
  if (projectRoot && raw.startsWith(projectRoot)) {
    const rel = raw.slice(projectRoot.length);
    return rel.startsWith('/') ? rel.slice(1) : rel;
  }
  return raw.split('/').slice(-2).join('/');
}

function extractBashLabel(cmd) {
  if (cmd.includes('git ')) return 'Git';
  if (cmd.includes('pip ')) return 'pip';
  if (cmd.includes('npm ')) return 'npm';
  if (cmd.includes('pnpm ')) return 'pnpm';
  if (cmd.includes('yarn ')) return 'yarn';
  if (/\b(sleep|Start-Sleep|timeout\s+\/t)\b/i.test(cmd)) return '等待';
  if (cmd.includes('curl')) return '网络';
  if (cmd.includes('pytest') || cmd.includes('jest') || /\btest\b/.test(cmd)) return '测试';
  if (cmd.includes('python ') || cmd.includes('node ')) return '执行';
  return '执行';
}

function extractCurlUrl(cmd) {
  const match = cmd.match(/curl\s+(?:-[^\s]+\s+)*['"]?(https?:\/\/\S+)/);
  return match ? match[1].replace(/['"]$/, '') : null;
}

function extractMcpTarget(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return '';
  return String(toolInput.url || toolInput.text || toolInput.element || '').slice(0, 60);
}

function extractBashTarget(cmd) {
  let clean = cmd.replace(/^(?:(?:cd|source|export)\s+\S+\s*&&\s*)+/g, '').trim();

  const unescape = (s) => s.replace(/\x00/g, ';');
  clean = clean.replace(/"[^"]*"/g, m => m.replace(/[;|&]/g, '\x00'));
  clean = clean.replace(/'[^']*'/g, m => m.replace(/[;|&]/g, '\x00'));

  clean = clean.split(/\s*(?:\|\|?|;|&&|2>&1|2>\/dev\/null|>\s*\/dev\/null)\s*/)[0];
  clean = unescape(clean).trim();

  clean = clean.replace(/\s*<<\s*['"]?\w+['"]?\s*$/, '');

  return clean;
}

function inferPhaseStep(indicator, toolName, toolInput) {
  const name = (toolName || '').toLowerCase();
  const projectRoot = indicator.projectRoot || '';

  indicator.startTool(toolName);

  if (name === 'write' || name === 'edit' || name === 'multiedit' || name === 'str_replace_editor' || name === 'strreplace') {
    indicator.updatePhase('coding');
    indicator.updateStep('编辑');
    indicator.toolTarget = extractFileTarget(toolInput, projectRoot);
  } else if (name === 'bash' || name === 'shell') {
    const cmd = typeof toolInput === 'object' ? (toolInput.command || '') : String(toolInput || '');
    const label = extractBashLabel(cmd);
    indicator.updateStep(label);
    if (label === '网络') {
      indicator.toolTarget = extractCurlUrl(cmd) || truncateCommand(extractBashTarget(cmd), 50);
    } else {
      indicator.toolTarget = truncateCommand(extractBashTarget(cmd), 60);
    }
    if (['测试', '执行'].includes(label)) {
      indicator.updatePhase('coding');
    }
  } else if (name === 'read' || name === 'glob' || name === 'grep' || name === 'ls') {
    indicator.updatePhase('thinking');
    indicator.updateStep('读取');
    indicator.toolTarget = extractFileTarget(toolInput, projectRoot);
  } else if (name === 'task') {
    indicator.updatePhase('thinking');
    indicator.updateStep('Agent');
    indicator.toolTarget = '';
  } else if (name === 'websearch' || name === 'webfetch') {
    indicator.updatePhase('thinking');
    indicator.updateStep('查阅');
    indicator.toolTarget = '';
  } else if (name.startsWith('mcp__')) {
    indicator.updatePhase('coding');
    const action = name.split('__').pop() || name;
    indicator.updateStep(`浏览器: ${action}`);
    indicator.toolTarget = extractMcpTarget(toolInput);
  } else {
    indicator.updateStep('工具');
    indicator.toolTarget = '';
  }

  let summary;
  if (typeof toolInput === 'object') {
    const target = toolInput.file_path || toolInput.path || '';
    const cmd = toolInput.command || '';
    const pattern = toolInput.pattern || '';
    summary = target || (cmd ? cmd.slice(0, 200) : '') || (pattern ? `pattern: ${pattern}` : JSON.stringify(toolInput).slice(0, 200));
  } else {
    summary = String(toolInput || '').slice(0, 200);
  }
  indicator.appendActivity(toolName, summary);
}

module.exports = { Indicator, inferPhaseStep };
