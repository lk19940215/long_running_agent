'use strict';

const fs = require('fs');
const { execSync } = require('child_process');

// ─────────────────────────────────────────────────────────────
// 字符串工具
// ─────────────────────────────────────────────────────────────

/**
 * 中间截断字符串，保留首尾
 * @param {string} str - 原字符串
 * @param {number} maxLen - 最大长度
 * @returns {string}
 */
function truncateMiddle(str, maxLen) {
  if (!str || str.length <= maxLen) return str || '';
  const startLen = Math.ceil((maxLen - 1) / 2);
  const endLen = Math.floor((maxLen - 1) / 2);
  return str.slice(0, startLen) + '…' + str.slice(-endLen);
}

/**
 * 路径感知截断：优先保留文件名，截断目录中间
 * @param {string} path - 文件路径
 * @param {number} maxLen - 最大长度
 * @returns {string}
 */
function truncatePath(p, maxLen) {
  if (!p || p.length <= maxLen) return p || '';

  const lastSlashFwd = p.lastIndexOf('/');
  const lastSlashBwd = p.lastIndexOf('\\');
  const lastSlash = Math.max(lastSlashFwd, lastSlashBwd);
  if (lastSlash === -1) {
    return truncateMiddle(p, maxLen);
  }

  const sep = p[lastSlash];
  const fileName = p.slice(lastSlash + 1);
  const dirPath = p.slice(0, lastSlash);

  if (fileName.length >= maxLen - 2) {
    return truncateMiddle(p, maxLen);
  }

  const availableForDir = maxLen - fileName.length - 2;
  if (availableForDir <= 0) {
    return '…' + sep + fileName.slice(0, maxLen - 2);
  }

  const dirStart = Math.ceil(availableForDir / 2);
  const dirEnd = Math.floor(availableForDir / 2);
  const truncatedDir = dirPath.slice(0, dirStart) + '…' + (dirEnd > 0 ? dirPath.slice(-dirEnd) : '');

  return truncatedDir + sep + fileName;
}

/**
 * 命令字符串截断：保留头部，超长时截断
 * @param {string} cmd - 命令字符串
 * @param {number} maxLen - 最大长度
 * @returns {string}
 */
function truncateCommand(cmd, maxLen) {
  if (!cmd || cmd.length <= maxLen) return cmd || '';
  return cmd.slice(0, maxLen - 1) + '…';
}

// ─────────────────────────────────────────────────────────────
// Git 工具
// ─────────────────────────────────────────────────────────────

/**
 * 获取当前 git HEAD commit hash
 * @param {string} cwd - 工作目录
 * @returns {string} commit hash 或 'none'
 */
function getGitHead(cwd) {
  try {
    return execSync('git rev-parse HEAD', { cwd, encoding: 'utf8' }).trim();
  } catch {
    return 'none';
  }
}

/**
 * 检查是否在 git 仓库中
 * @param {string} cwd - 工作目录
 * @returns {boolean}
 */
function isGitRepo(cwd) {
  try {
    execSync('git rev-parse --is-inside-work-tree', { cwd, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// .gitignore 工具
// ─────────────────────────────────────────────────────────────

/**
 * 向 .gitignore 追加条目（如果不存在）
 * @param {string} projectRoot - 项目根目录
 * @param {string} entry - 要添加的条目
 * @returns {boolean} 是否有新增
 */
function appendGitignore(projectRoot, entry) {
  const path = require('path');
  const gitignorePath = path.join(projectRoot, '.gitignore');
  let content = '';
  if (fs.existsSync(gitignorePath)) {
    content = fs.readFileSync(gitignorePath, 'utf8');
  }
  if (content.includes(entry)) return false;

  const suffix = content.endsWith('\n') || content === '' ? '' : '\n';
  fs.appendFileSync(gitignorePath, `${suffix}${entry}\n`, 'utf8');
  return true;
}

/**
 * 确保 .gitignore 包含 claude-coder 的忽略规则
 * 使用通配符忽略整个目录，仅白名单放行需要版本控制的文件
 * @param {string} projectRoot - 项目根目录
 * @returns {boolean} 是否有新增
 */
function ensureGitignore(projectRoot) {
  const patterns = [
    '.claude-coder/*',
    '!.claude-coder/tasks.json',
    '!.claude-coder/project_profile.json',
    '!.claude-coder/design/',
  ];
  let added = false;
  for (const p of patterns) {
    if (appendGitignore(projectRoot, p)) added = true;
  }
  return added;
}

// ─────────────────────────────────────────────────────────────
// 进程工具
// ─────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────────────────────
// 项目服务管理
// ─────────────────────────────────────────────────────────────

function tryPush(projectRoot) {
  const { log } = require('./display');
  try {
    const remotes = execSync('git remote', { cwd: projectRoot, encoding: 'utf8' }).trim();
    if (!remotes) return;
    log('info', '正在推送代码...');
    execSync('git push', { cwd: projectRoot, stdio: 'inherit' });
    log('ok', '推送成功');
  } catch {
    log('warn', '推送失败 (请检查网络或权限)，继续执行...');
  }
}

function killServices(projectRoot) {
  const { log } = require('./display');
  const { assets } = require('./assets');
  const profile = assets.readJson('profile', null);
  if (!profile) return;
  const ports = (profile.services || []).map(s => s.port).filter(p => p && /^\d+$/.test(String(p)));
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

// ─────────────────────────────────────────────────────────────
// 日志工具
// ─────────────────────────────────────────────────────────────
function localTimestamp() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

module.exports = {
  truncateMiddle,
  truncatePath,
  truncateCommand,
  getGitHead,
  isGitRepo,
  appendGitignore,
  ensureGitignore,
  sleep,
  tryPush,
  killServices,
  localTimestamp,
};