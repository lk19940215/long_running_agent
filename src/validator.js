'use strict';

const fs = require('fs');
const { execSync } = require('child_process');
const { paths, log, getProjectRoot } = require('./config');

function validateSessionResult() {
  const p = paths();

  if (!fs.existsSync(p.sessionResult)) {
    log('error', 'Agent 未生成 session_result.json');
    return { valid: false, fatal: true, recoverable: false, reason: 'session_result.json 不存在' };
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(p.sessionResult, 'utf8'));
  } catch (err) {
    log('error', `session_result.json 解析失败: ${err.message}`);
    return { valid: false, fatal: true, recoverable: false, reason: `JSON 解析失败: ${err.message}` };
  }

  // Backward compat: unwrap legacy { current: {...} } format
  if (data.current && typeof data.current === 'object') {
    data = data.current;
  }

  const required = ['session_result', 'status_after'];
  const missing = required.filter(k => !(k in data));
  if (missing.length > 0) {
    log('warn', `session_result.json 缺少字段: ${missing.join(', ')}`);
    return { valid: false, fatal: false, recoverable: true, reason: `缺少字段: ${missing.join(', ')}` };
  }

  if (!['success', 'failed'].includes(data.session_result)) {
    log('error', `session_result 必须是 success 或 failed，实际是: ${data.session_result}`);
    return { valid: false, fatal: true, recoverable: false, reason: `无效 session_result: ${data.session_result}` };
  }

  const validStatuses = ['pending', 'in_progress', 'testing', 'done', 'failed'];
  if (!validStatuses.includes(data.status_after)) {
    log('error', `status_after 不合法: ${data.status_after}`);
    return { valid: false, fatal: true, recoverable: false, reason: `无效 status_after: ${data.status_after}` };
  }

  if (!data.task_id) {
    log('warn', 'session_result.json 缺少 task_id (建议包含)');
  }

  if (data.session_result === 'success') {
    log('ok', 'session_result.json 合法 (success)');
  } else {
    log('warn', 'session_result.json 合法，但 Agent 报告失败 (failed)');
  }

  return { valid: true, fatal: false, recoverable: false, data };
}

function checkGitProgress(headBefore) {
  if (!headBefore) {
    log('info', '未提供 head_before，跳过 git 检查');
    return { hasCommit: false, warning: false };
  }

  const projectRoot = getProjectRoot();
  let headAfter;
  try {
    headAfter = execSync('git rev-parse HEAD', { cwd: projectRoot, encoding: 'utf8' }).trim();
  } catch {
    headAfter = 'none';
  }

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

function checkTestCoverage() {
  const p = paths();

  if (!fs.existsSync(p.testsFile) || !fs.existsSync(p.sessionResult)) return;

  try {
    const sr = JSON.parse(fs.readFileSync(p.sessionResult, 'utf8'));
    const tests = JSON.parse(fs.readFileSync(p.testsFile, 'utf8'));

    const taskId = sr.task_id || '';
    const testCases = tests.test_cases || [];

    if (sr.status_after === 'done' && sr.tests_passed) {
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
  } catch { /* ignore */ }
}

async function validate(headBefore) {
  log('info', '========== 开始校验 ==========');

  let srResult = validateSessionResult();
  const gitResult = checkGitProgress(headBefore);

  // Tiered: has commit + session_result issue → warn, don't rollback good code
  if (srResult.recoverable && gitResult.hasCommit) {
    log('warn', 'session_result.json 格式异常，但有新提交，降级为警告（不回滚代码）');
  } else if (srResult.recoverable && !gitResult.hasCommit) {
    log('error', '无新提交且 session_result.json 格式错误，视为致命');
    srResult.fatal = true;
  }

  checkTestCoverage();

  const fatal = srResult.fatal;
  const hasWarnings = gitResult.warning || srResult.recoverable;

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
