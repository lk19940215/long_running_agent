'use strict';

const { execSync } = require('child_process');
const { log } = require('../common/config');
const { getGitHead } = require('../common/utils');
const { assets } = require('../common/assets');
const { TASK_STATUSES } = require('../common/constants');
const { loadTasks, getFeatures } = require('../common/tasks');

function inferFromTasks(taskId) {
  if (!taskId) return null;
  const data = loadTasks();
  if (!data) return null;
  const task = getFeatures(data).find(f => f.id === taskId);
  return task ? task.status : null;
}

function validateSessionResult() {
  if (!assets.exists('sessionResult')) {
    log('error', 'Agent 未生成 session_result.json');
    return { valid: false, fatal: true, recoverable: false, reason: 'session_result.json 不存在' };
  }

  const data = assets.readJson('sessionResult', null);
  if (data === null) {
    log('warn', 'session_result.json 解析失败');
    return { valid: false, fatal: false, recoverable: true, reason: 'JSON 解析失败' };
  }

  const sessionData = data.current && typeof data.current === 'object' ? data.current : data;

  const required = ['session_result', 'status_after'];
  const missing = required.filter(k => !(k in sessionData));
  if (missing.length > 0) {
    log('warn', `session_result.json 缺少字段: ${missing.join(', ')}`);
    return { valid: false, fatal: false, recoverable: true, reason: `缺少字段: ${missing.join(', ')}` };
  }

  if (!['success', 'failed'].includes(sessionData.session_result)) {
    log('warn', `session_result 必须是 success 或 failed，实际是: ${sessionData.session_result}`);
    return { valid: false, fatal: false, recoverable: true, reason: `无效 session_result: ${sessionData.session_result}`, data: sessionData };
  }

  if (!TASK_STATUSES.includes(sessionData.status_after)) {
    log('warn', `status_after 不合法: ${sessionData.status_after}`);
    return { valid: false, fatal: false, recoverable: true, reason: `无效 status_after: ${sessionData.status_after}`, data: sessionData };
  }

  if (sessionData.session_result === 'success') {
    log('ok', 'session_result.json 合法 (success)');
  } else {
    log('warn', 'session_result.json 合法，但 Agent 报告失败 (failed)');
  }

  return { valid: true, fatal: false, recoverable: false, data: sessionData };
}

function checkGitProgress(headBefore) {
  if (!headBefore) {
    log('info', '未提供 head_before，跳过 git 检查');
    return { hasCommit: false, warning: false };
  }

  const projectRoot = assets.projectRoot;
  const headAfter = getGitHead(projectRoot);

  if (headBefore === headAfter) {
    log('warn', '本次会话没有新的 git 提交');
    return { hasCommit: false, warning: true };
  }

  try {
    const msg = execSync('git log --oneline -1', { cwd: projectRoot, encoding: 'utf8' }).trim();
    log('ok', `检测到新提交: ${msg}`);
  } catch { /* ignore */ }

  return { hasCommit: true, warning: false };
}

function checkTestCoverage(taskId, statusAfter) {
  if (statusAfter !== 'done' || !taskId) return;
  if (!assets.exists('tests')) return;

  const tests = assets.readJson('tests', null);
  if (!tests) return;
  const testCases = tests.test_cases || [];
  const taskTests = testCases.filter(t => t.feature_id === taskId);
  if (taskTests.length > 0) {
    const failed = taskTests.filter(t => t.last_result === 'fail');
    if (failed.length > 0) {
      log('warn', `tests.json 中有失败的验证记录: ${failed.map(t => t.id).join(', ')}`);
    } else {
      log('ok', `${taskTests.length} 条验证记录覆盖任务 ${taskId}`);
    }
  }
}

function validate(headBefore, taskId) {
  log('info', '========== 开始校验 ==========');

  const srResult = validateSessionResult();
  const gitResult = checkGitProgress(headBefore);

  let fatal = false;
  let hasWarnings = false;

  if (srResult.valid) {
    hasWarnings = gitResult.warning;
  } else {
    if (gitResult.hasCommit) {
      const taskStatus = inferFromTasks(taskId);
      if (taskStatus === 'done' || taskStatus === 'testing') {
        log('warn', `session_result.json 异常，但 tasks.json 显示 ${taskId} 已 ${taskStatus}，且有新提交，降级为警告`);
      } else {
        log('warn', 'session_result.json 异常，但有新提交，降级为警告（不回滚代码）');
      }
      hasWarnings = true;
    } else {
      log('error', '无新提交且 session_result.json 异常，视为致命');
      fatal = true;
    }
  }

  const statusAfter = srResult.data?.status_after || inferFromTasks(taskId) || null;
  checkTestCoverage(taskId, statusAfter);

  if (fatal) {
    log('error', '========== 校验失败 (致命) ==========');
  } else if (hasWarnings) {
    log('warn', '========== 校验通过 (有警告) ==========');
  } else {
    log('ok', '========== 校验全部通过 ==========');
  }

  return { fatal, hasWarnings, sessionData: srResult.data };
}

module.exports = { validate, validateSessionResult, checkGitProgress };
