'use strict';

const fs = require('fs');
const { paths, COLOR } = require('./config');

const SPINNERS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

class Indicator {
  constructor() {
    this.phase = 'thinking';
    this.step = '';
    this.toolTarget = '';
    this.spinnerIndex = 0;
    this.timer = null;
    this.lastActivity = '';
    this.lastToolTime = Date.now();
    this.sessionNum = 0;
    this.startTime = Date.now();
    this._lastContentKey = '';
  }

  start(sessionNum) {
    this.sessionNum = sessionNum;
    this.startTime = Date.now();
    this.timer = setInterval(() => this._render(), 500);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    process.stderr.write('\r\x1b[K');
  }

  updatePhase(phase) {
    this.phase = phase;
    this._writePhaseFile();
  }

  updateStep(step) {
    this.step = step;
    this._writeStepFile();
  }

  appendActivity(toolName, summary) {
    this.lastActivity = `${toolName}: ${summary}`;
  }

  _writePhaseFile() {
    try { fs.writeFileSync(paths().phaseFile, this.phase, 'utf8'); } catch { /* ignore */ }
  }

  _writeStepFile() {
    try { fs.writeFileSync(paths().stepFile, this.step, 'utf8'); } catch { /* ignore */ }
  }

  getStatusLine() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mi = String(now.getMinutes()).padStart(2, '0');
    const sc = String(now.getSeconds()).padStart(2, '0');
    const clock = `${hh}:${mi}:${sc}`;

    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const ss = String(elapsed % 60).padStart(2, '0');
    const spinner = SPINNERS[this.spinnerIndex % SPINNERS.length];

    const phaseLabel = this.phase === 'thinking'
      ? `${COLOR.yellow}思考中${COLOR.reset}`
      : `${COLOR.green}编码中${COLOR.reset}`;

    const idleMs = Date.now() - this.lastToolTime;
    const idleMin = Math.floor(idleMs / 60000);

    let line = `${spinner} [Session ${this.sessionNum}] ${clock} ${phaseLabel} ${mm}:${ss}`;
    if (idleMin >= 2) {
      line += ` | ${COLOR.red}${idleMin}分无工具调用${COLOR.reset}`;
    }
    if (this.step) {
      line += ` | ${this.step}`;
      if (this.toolTarget) line += `: ${this.toolTarget}`;
    }
    return line;
  }

  _render() {
    this.spinnerIndex++;
    const line = this.getStatusLine();
    const maxWidth = process.stderr.columns || 80;
    const truncated = line.length > maxWidth + 20 ? line.slice(0, maxWidth + 20) : line;

    process.stderr.write(`\r\x1b[K${truncated}`);
  }
}

function extractFileTarget(toolInput) {
  const raw = typeof toolInput === 'object'
    ? (toolInput.file_path || toolInput.path || '')
    : '';
  if (!raw) return '';
  return raw.split('/').slice(-2).join('/').slice(0, 40);
}

function extractBashLabel(cmd) {
  if (cmd.includes('git ')) return 'Git 操作';
  if (cmd.includes('npm ') || cmd.includes('pip ') || cmd.includes('pnpm ') || cmd.includes('yarn ')) return '安装依赖';
  if (cmd.includes('curl') || cmd.includes('pytest') || cmd.includes('jest') || /\btest\b/.test(cmd)) return '测试验证';
  if (cmd.includes('python ') || cmd.includes('node ')) return '执行脚本';
  return '执行命令';
}

function extractBashTarget(cmd) {
  let clean = cmd.replace(/^(?:cd\s+\S+\s*&&\s*)+/g, '').trim();
  clean = clean.split(/\s*(?:\|{1,2}|;|&&|2>&1|>\s*\/dev\/null)\s*/)[0].trim();
  return clean.slice(0, 40);
}

function inferPhaseStep(indicator, toolName, toolInput) {
  const name = (toolName || '').toLowerCase();

  indicator.lastToolTime = Date.now();

  if (name === 'write' || name === 'edit' || name === 'multiedit' || name === 'str_replace_editor' || name === 'strreplace') {
    indicator.updatePhase('coding');
    indicator.updateStep('编辑文件');
    indicator.toolTarget = extractFileTarget(toolInput);
  } else if (name === 'bash' || name === 'shell') {
    const cmd = typeof toolInput === 'object' ? (toolInput.command || '') : String(toolInput || '');
    const label = extractBashLabel(cmd);
    indicator.updateStep(label);
    indicator.toolTarget = extractBashTarget(cmd);
    if (label === '测试验证' || label === '执行脚本' || label === '执行命令') {
      indicator.updatePhase('coding');
    }
  } else if (name === 'read' || name === 'glob' || name === 'grep' || name === 'ls') {
    indicator.updatePhase('thinking');
    indicator.updateStep('读取文件');
    indicator.toolTarget = extractFileTarget(toolInput);
  } else if (name === 'task') {
    indicator.updatePhase('thinking');
    indicator.updateStep('子 Agent 搜索');
    indicator.toolTarget = '';
  } else if (name === 'websearch' || name === 'webfetch') {
    indicator.updatePhase('thinking');
    indicator.updateStep('查阅文档');
    indicator.toolTarget = '';
  } else {
    indicator.updateStep('工具调用');
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
