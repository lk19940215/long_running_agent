'use strict';

const { COLOR } = require('./config');
const { localTimestamp, truncatePath } = require('./utils');

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
    this.completionTimeoutMin = null;
    this.toolRunning = false;
    this.toolStartTime = 0;
    this.currentToolName = '';
    this._paused = false;
  }

  start(sessionNum, stallTimeoutMin) {
    this.sessionNum = sessionNum;
    this.startTime = Date.now();
    this.lastActivityTime = Date.now();
    if (stallTimeoutMin > 0) this.stallTimeoutMin = stallTimeoutMin;
    this.timer = setInterval(() => this._render(), 1000);
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
  }

  updateStep(step) {
    this.step = step;
  }

  appendActivity(toolName, summary) {
    this.lastActivity = `${toolName}: ${summary}`;
  }

  setCompletionDetected(timeoutMin) {
    this.completionTimeoutMin = timeoutMin;
  }

  updateActivity() {
    this.lastActivityTime = Date.now();
  }

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

    let line = `${spinner} [Session ${this.sessionNum}] ${clock} ${phaseLabel} ${mm}:${ss}`;
    if (idleMin >= 2) {
      if (this.toolRunning) {
        const toolSec = Math.floor((Date.now() - this.toolStartTime) / 1000);
        const toolMm = Math.floor(toolSec / 60);
        const toolSs = toolSec % 60;
        line += ` | ${COLOR.yellow}工具执行中 ${toolMm}:${String(toolSs).padStart(2, '0')}${COLOR.reset}`;
      } else if (this.completionTimeoutMin) {
        line += ` | ${COLOR.red}${idleMin}分无响应（session_result 已写入, ${this.completionTimeoutMin}分钟超时自动中断）${COLOR.reset}`;
      } else {
        line += ` | ${COLOR.red}${idleMin}分无响应（等待模型响应, ${this.stallTimeoutMin}分钟超时自动中断）${COLOR.reset}`;
      }
    }
    if (this.step) {
      line += ` | ${this.step}`;
      if (this.toolTarget) {
        // 动态获取终端宽度，默认 120 适配现代终端
        const cols = process.stderr.columns || 120;
        const usedWidth = line.replace(/\x1b\[[^m]*m/g, '').length;
        const availWidth = Math.max(20, cols - usedWidth - 4);
        const target = truncatePath(this.toolTarget, availWidth);
        line += `: ${target}`;
      }
    }
    return line;
  }

  _render() {
    if (this._paused) return;
    this.spinnerIndex++;
    process.stderr.write(`\r\x1b[K${this.getStatusLine()}`);
  }
}

function extractFileTarget(toolInput) {
  const raw = typeof toolInput === 'object'
    ? (toolInput.file_path || toolInput.path || '')
    : '';
  if (!raw) return '';
  return raw.split('/').slice(-2).join('/');
}

function extractBashLabel(cmd) {
  if (cmd.includes('git ')) return 'Git 操作';
  if (cmd.includes('npm ') || cmd.includes('pip ') || cmd.includes('pnpm ') || cmd.includes('yarn ')) return '安装依赖';
  if (/\b(sleep|Start-Sleep|timeout\s+\/t)\b/i.test(cmd)) return '等待就绪';
  if (cmd.includes('curl')) return '网络请求';
  if (cmd.includes('pytest') || cmd.includes('jest') || /\btest\b/.test(cmd)) return '测试验证';
  if (cmd.includes('python ') || cmd.includes('node ')) return '执行脚本';
  return '执行命令';
}

function extractMcpTarget(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return '';
  return String(toolInput.url || toolInput.text || toolInput.element || '').slice(0, 60);
}

/**
 * 提取 Bash 命令的主体部分（移除管道、重定向等）
 * 正确处理引号内的内容，不会错误分割引号内的分隔符
 */
function extractBashTarget(cmd) {
  // 移除开头的 cd xxx && 部分
  let clean = cmd.replace(/^(?:cd\s+\S+\s*&&\s*)+/g, '').trim();

  // 临时替换引号内的分隔符为占位符
  const unescape = (s) => s.replace(/\x00/g, ';');
  clean = clean.replace(/"[^"]*"/g, m => m.replace(/[;|&]/g, '\x00'));
  clean = clean.replace(/'[^']*'/g, m => m.replace(/[;|&]/g, '\x00'));

  // 分割并取第一部分
  clean = clean.split(/\s*(?:\|\|?|;|&&|2>&1|2>\/dev\/null|>\s*\/dev\/null)\s*/)[0];

  // 还原占位符
  return unescape(clean).trim();
}

function inferPhaseStep(indicator, toolName, toolInput) {
  const name = (toolName || '').toLowerCase();

  indicator.startTool(toolName);

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
  } else if (name.startsWith('mcp__')) {
    indicator.updatePhase('coding');
    const action = name.split('__').pop() || name;
    indicator.updateStep(`浏览器: ${action}`);
    indicator.toolTarget = extractMcpTarget(toolInput);
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
