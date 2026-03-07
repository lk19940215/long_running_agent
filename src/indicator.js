'use strict';

const { COLOR } = require('./config');

const SPINNERS = ['⠋', '⠙', '⠸', '⠴', '⠦', '⠇'];

/**
 * 中间截断字符串，保留首尾
 */
function truncateMiddle(str, maxLen) {
  if (str.length <= maxLen) return str;
  const startLen = Math.ceil((maxLen - 1) / 2);
  const endLen = Math.floor((maxLen - 1) / 2);
  return str.slice(0, startLen) + '…' + str.slice(-endLen);
}

/**
 * 路径感知截断：优先保留文件名，截断目录中间
 */
function truncatePath(path, maxLen) {
  if (path.length <= maxLen) return path;

  const lastSlash = path.lastIndexOf('/');
  if (lastSlash === -1) {
    // 无路径分隔符，普通中间截断
    return truncateMiddle(path, maxLen);
  }

  const fileName = path.slice(lastSlash + 1);
  const dirPath = path.slice(0, lastSlash);

  // 文件名本身超长，截断文件名
  if (fileName.length >= maxLen - 2) {
    return truncateMiddle(path, maxLen);
  }

  // 保留文件名，截断目录
  const availableForDir = maxLen - fileName.length - 2; // -2 for '…/'
  if (availableForDir <= 0) {
    return '…/' + fileName.slice(0, maxLen - 2);
  }

  // 目录两端保留
  const dirStart = Math.ceil(availableForDir / 2);
  const dirEnd = Math.floor(availableForDir / 2);
  const truncatedDir = dirPath.slice(0, dirStart) + '…' + (dirEnd > 0 ? dirPath.slice(-dirEnd) : '');

  return truncatedDir + '/' + fileName;
}

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
    this.stallTimeoutMin = 30;
  }

  start(sessionNum, stallTimeoutMin) {
    this.sessionNum = sessionNum;
    this.startTime = Date.now();
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
      line += ` | ${COLOR.red}${idleMin}分无工具调用（等待模型响应, ${this.stallTimeoutMin}分钟超时自动中断）${COLOR.reset}`;
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
  if (cmd.includes('curl') || cmd.includes('pytest') || cmd.includes('jest') || /\btest\b/.test(cmd)) return '测试验证';
  if (cmd.includes('python ') || cmd.includes('node ')) return '执行脚本';
  return '执行命令';
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
