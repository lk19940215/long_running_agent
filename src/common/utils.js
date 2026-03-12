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
function truncatePath(path, maxLen) {
  if (!path || path.length <= maxLen) return path || '';

  const lastSlash = path.lastIndexOf('/');
  if (lastSlash === -1) {
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

// ─────────────────────────────────────────────────────────────
// 进程工具
// ─────────────────────────────────────────────────────────────

/**
 * 休眠
 * @param {number} ms - 毫秒
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


// ─────────────────────────────────────────────────────────────
// 日志工具 - 统一的日志处理
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
  getGitHead,
  isGitRepo,
  appendGitignore,
  sleep,
  localTimestamp,
};