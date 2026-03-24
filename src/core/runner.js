'use strict';

const { execSync } = require('child_process');
const readline = require('readline');
const { log, COLOR, printModeBanner } = require('../common/display');
const { RETRY, TASK_STATUSES } = require('../common/config');
const { assets } = require('../common/assets');
const { loadTasks, saveTasks, getFeatures, getStats, printStats } = require('../common/tasks');
const { getGitHead, sleep, tryPush, killServices } = require('../common/utils');
const {
  loadState, saveState, selectNextTask, isAllDone,
  appendProgress, incrementSession, markSimplifyDone,
} = require('./state');

const MAX_RETRY = RETRY.MAX_ATTEMPTS;

// ─── Display Helpers ──────────────────────────────────────

function printBanner(dryRun, config, maxSessions) {
  const mode = dryRun ? '预览模式' : `max: ${maxSessions}`;
  printModeBanner('run', mode, config?.model);
}

function _progressBar(done, total, width = 24) {
  if (total === 0) return `${COLOR.dim}[${'░'.repeat(width)}]${COLOR.reset}`;
  const filled = Math.round(done / total * width);
  return `${COLOR.green}[${'█'.repeat(filled)}${COLOR.dim}${'░'.repeat(width - filled)}${COLOR.reset}${COLOR.green}]${COLOR.reset}`;
}

function printSessionHeader(session, maxSessions, taskData, taskId) {
  const stats = getStats(taskData);
  const task = taskId ? getFeatures(taskData).find(f => f.id === taskId) : null;
  const bar = _progressBar(stats.done, stats.total);

  console.error('');
  console.error(`${COLOR.cyan}┌─ Session ${session} / ${maxSessions} ${'─'.repeat(32)}┐${COLOR.reset}`);
  if (task) {
    console.error(`${COLOR.cyan}│${COLOR.reset}  任务: ${COLOR.bold}${task.id}${COLOR.reset} ${COLOR.dim}-${COLOR.reset} ${task.description || ''}`);
  }
  console.error(`${COLOR.cyan}│${COLOR.reset}  进度: ${bar} ${stats.done}/${stats.total}  ${COLOR.green}✔${stats.done}${COLOR.reset} ${COLOR.yellow}○${stats.pending}${COLOR.reset} ${COLOR.red}✘${stats.failed}${COLOR.reset}`);
  console.error(`${COLOR.cyan}└${'─'.repeat(46)}┘${COLOR.reset}`);
}

function printDryRun(taskData) {
  const next = selectNextTask(taskData);
  log('info', `[DRY-RUN] 下一个任务: ${next ? `${next.id} - ${next.description}` : '无待处理任务'}`);

  if (!next) {
    log('ok', '[DRY-RUN] 无可执行任务，预览结束');
    return;
  }

  console.log('');
  log('info', '[DRY-RUN] 任务队列:');
  const features = getFeatures(taskData);
  for (const f of features) {
    const st = f.status || 'unknown';
    const icon = { done: '✓', in_progress: '▸', pending: '○', failed: '✗', testing: '◇' }[st] || '?';
    const color = { done: COLOR.green, failed: COLOR.red, in_progress: COLOR.blue, testing: COLOR.yellow, pending: COLOR.dim }[st] || '';
    log('info', `  ${color}${icon}${COLOR.reset} [${st.padEnd(11)}] ${f.id} - ${f.description || ''}`);
  }
}

function printEndBanner() {
  console.error('');
  console.error(`${COLOR.cyan}╔══════════════════════════════════════════════╗${COLOR.reset}`);
  console.error(`${COLOR.cyan}║${COLOR.reset}  ${COLOR.bold}运行结束${COLOR.reset}`);
  console.error(`${COLOR.cyan}╚══════════════════════════════════════════════╝${COLOR.reset}`);
  console.error('');
}

async function promptContinue() {
  if (!process.stdin.isTTY) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question('是否继续？(y/n) ', answer => {
      rl.close();
      resolve(/^[Yy]/.test(answer.trim()));
    });
  });
}

// ─── Utilities ────────────────────────────────────────────

function _timestamp() {
  return new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
}

// ─── Lifecycle: Snapshot ──────────────────────────────────

function snapshot(projectRoot, taskData) {
  const nextTask = selectNextTask(taskData);
  const taskId = nextTask?.id || 'unknown';

  const state = loadState();
  state.current_task_id = taskId;
  saveState(state);

  return {
    headBefore: getGitHead(projectRoot),
    taskId,
  };
}

// ─── Lifecycle: Validation ────────────────────────────────

function _validateSessionResult() {
  if (!assets.exists('sessionResult')) {
    log('error', 'Agent 未生成 session_result.json');
    return { valid: false, reason: 'session_result.json 不存在' };
  }

  const raw = assets.readJson('sessionResult', null);
  if (raw === null) {
    log('warn', 'session_result.json 解析失败');
    return { valid: false, reason: 'JSON 解析失败', rawContent: assets.read('sessionResult') };
  }

  const data = raw.current && typeof raw.current === 'object' ? raw.current : raw;

  const required = ['session_result', 'status_after'];
  const missing = required.filter(k => !(k in data));
  if (missing.length > 0) {
    log('warn', `session_result.json 缺少字段: ${missing.join(', ')}`);
    return { valid: false, reason: `缺少字段: ${missing.join(', ')}`, data };
  }

  if (!['success', 'failed'].includes(data.session_result)) {
    return { valid: false, reason: `无效 session_result: ${data.session_result}`, data };
  }

  if (!TASK_STATUSES.includes(data.status_after)) {
    return { valid: false, reason: `无效 status_after: ${data.status_after}`, data };
  }

  const level = data.session_result === 'success' ? 'ok' : 'warn';
  log(level, `session_result.json 合法 (${data.session_result})`);
  return { valid: true, data };
}

function _checkGitProgress(headBefore, projectRoot) {
  if (!headBefore) {
    log('info', '未提供 head_before，跳过 git 检查');
    return { hasCommit: false, warning: false };
  }

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

function _inferFromTasks(taskId) {
  if (!taskId) return null;
  const data = loadTasks();
  if (!data) return null;
  const task = getFeatures(data).find(f => f.id === taskId);
  return task ? task.status : null;
}

async function validate(config, headBefore, taskId) {
  const projectRoot = assets.projectRoot;
  log('info', '校验中...');

  let srResult = _validateSessionResult();
  const gitResult = _checkGitProgress(headBefore, projectRoot);

  if (!srResult.valid && srResult.rawContent) {
    const srPath = assets.path('sessionResult');
    if (srPath) {
      const { executeRepair } = require('./repair');
      await executeRepair(config, srPath);
      srResult = _validateSessionResult();
    }
  }

  let fatal = false;
  let hasWarnings = false;

  if (srResult.valid) {
    hasWarnings = gitResult.warning;
  } else {
    if (gitResult.hasCommit) {
      const taskStatus = _inferFromTasks(taskId);
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

  if (fatal) {
    log('error', '校验失败 (致命)');
  } else if (hasWarnings) {
    log('warn', '校验通过 (有警告)');
  } else {
    log('ok', '校验通过 ✓');
  }

  const reason = fatal ? (srResult.reason || '无新提交且 session_result.json 异常') : '';
  return { fatal, hasWarnings, sessionData: srResult.data, reason };
}

// ─── Lifecycle: Rollback ──────────────────────────────────

async function rollback(headBefore, reason) {
  if (!headBefore || headBefore === 'none') return;

  const projectRoot = assets.projectRoot;
  killServices(projectRoot);
  if (process.platform === 'win32') await sleep(1500);

  const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0' };

  log('warn', `回滚到 ${headBefore} ...`);

  let success = false;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      execSync(`git reset --hard ${headBefore}`, { cwd: projectRoot, stdio: 'pipe', env: gitEnv });
      execSync('git clean -fd', { cwd: projectRoot, stdio: 'pipe', env: gitEnv });
      log('ok', '回滚完成');
      success = true;
      break;
    } catch (err) {
      if (attempt === 1) {
        log('warn', `回滚首次失败，等待后重试: ${err.message}`);
        await sleep(2000);
      } else {
        log('error', `回滚失败: ${err.message}`);
      }
    }
  }

  appendProgress({
    type: 'rollback',
    timestamp: _timestamp(),
    reason: reason || 'harness 校验失败',
    rollbackTo: headBefore,
    success,
  });
}

// ─── Lifecycle: Retry / Skip ──────────────────────────────

function _markTaskFailed(taskId) {
  if (!taskId) return;
  const data = loadTasks();
  if (!data) return;
  const features = getFeatures(data);
  const task = features.find(f => f.id === taskId);
  if (task && task.status !== 'done') {
    task.status = 'failed';
    saveTasks(data);
    log('warn', `已将任务 ${taskId} 强制标记为 failed`);
  }
}

async function _handleRetryOrSkip(session, {
  headBefore, taskId, sessionResult, consecutiveFailures, result, reason, lastFailMsg,
}) {
  const newFailures = consecutiveFailures + 1;
  const exceeded = newFailures >= MAX_RETRY;

  await rollback(headBefore, reason);

  if (exceeded) {
    log('error', `连续失败 ${MAX_RETRY} 次，跳过当前任务`);
    _markTaskFailed(taskId);
  }

  const entry = { session, timestamp: _timestamp(), result, cost: sessionResult.cost, taskId };
  if (result === 'fatal') entry.reason = reason;
  appendProgress(entry);

  if (exceeded) return { consecutiveFailures: 0, lastFailReason: '' };
  return { consecutiveFailures: newFailures, lastFailReason: lastFailMsg };
}

// ─── Lifecycle: Session Outcome ───────────────────────────

async function onSuccess(session, { taskId, sessionResult, validateResult }) {
  incrementSession();

  appendProgress({
    session,
    timestamp: _timestamp(),
    result: 'success',
    cost: sessionResult.cost,
    taskId,
    statusAfter: validateResult.sessionData?.status_after || null,
    notes: validateResult.sessionData?.notes || null,
  });

  return { consecutiveFailures: 0, lastFailReason: '' };
}

async function onFailure(session, { headBefore, taskId, sessionResult, validateResult, consecutiveFailures }) {
  const reason = validateResult.reason || '校验失败';
  log('error', `Session ${session} 校验失败 (连续失败: ${consecutiveFailures + 1}/${MAX_RETRY})`);
  return _handleRetryOrSkip(session, {
    headBefore, taskId, sessionResult, consecutiveFailures,
    result: 'fatal', reason,
    lastFailMsg: `上次校验失败: ${reason}，代码已回滚`,
  });
}

async function onStall(session, { headBefore, taskId, sessionResult, consecutiveFailures, config }) {
  log('warn', `Session ${session} 因停顿超时中断，尝试校验任务是否已完成...`);

  const validateResult = await validate(config, headBefore, taskId);

  if (!validateResult.fatal) {
    log('ok', `停顿超时但任务已完成，按成功处理${validateResult.hasWarnings ? ' (有警告)' : ''}`);
    return onSuccess(session, { taskId, sessionResult, validateResult });
  }

  log('warn', '停顿超时且校验未通过，回滚重试');
  return _handleRetryOrSkip(session, {
    headBefore, taskId, sessionResult, consecutiveFailures,
    result: 'stalled', reason: '停顿超时',
    lastFailMsg: '上次会话停顿超时，已回滚',
  });
}

// ─── Lifecycle: Simplify Scheduling ───────────────────────

function shouldSimplify(config) {
  const { simplifyInterval } = config;
  if (simplifyInterval <= 0) return false;
  const state = loadState();
  return state.session_count % simplifyInterval === 0;
}

function needsFinalSimplify(config) {
  const { simplifyInterval } = config;
  if (simplifyInterval <= 0) return false;
  const state = loadState();
  return state.last_simplify_session < state.session_count;
}

async function tryRunSimplify(config, msg) {
  log('info', msg || `每 ${config.simplifyInterval} 个成功 session 运行代码审查...`);
  try {
    const { executeSimplify } = require('./simplify');
    await executeSimplify(config, null, { n: config.simplifyCommits });
    markSimplifyDone();
  } catch (err) {
    log('warn', `代码审查失败，跳过: ${err.message}`);
  }
}

// ─── Main Orchestration Loop ──────────────────────────────

async function executeRun(config, opts = {}) {
  if (!assets.exists('tasks')) {
    throw new Error('tasks.json 不存在，请先运行 claude-coder plan 生成任务');
  }

  const projectRoot = assets.projectRoot;
  const dryRun = opts.dryRun || false;
  const maxSessions = opts.max || 50;
  const pauseEvery = opts.pause ?? 0;
  printBanner(dryRun, config, maxSessions);

  printStats();

  log('info', `开始编码循环 (最多 ${maxSessions} 个会话) ...`);

  let state = { consecutiveFailures: 0, lastFailReason: '' };

  for (let session = 1; session <= maxSessions; session++) {
    let taskData = loadTasks();
    if (!taskData) {
      const tasksPath = assets.path('tasks');
      if (tasksPath) {
        const { executeRepair } = require('./repair');
        await executeRepair(config, tasksPath);
      }
      taskData = loadTasks();
      if (!taskData) {
        log('error', 'tasks.json 无法读取且修复失败，终止循环');
        break;
      }
    }

    if (isAllDone(taskData)) {
      if (!dryRun) {
        if (needsFinalSimplify(config)) {
          await tryRunSimplify(config, '所有任务完成，运行最终代码审查...');
        }
        tryPush(projectRoot);
      }
      console.error('');
      log('ok', '所有任务已完成！');
      printStats();
      break;
    }

    const { headBefore, taskId } = dryRun ? { headBefore: null, taskId: null } : snapshot(projectRoot, taskData);

    printSessionHeader(session, maxSessions, taskData, taskId);

    if (dryRun) {
      printDryRun(taskData);
      break;
    }

    const { executeCoding } = require('./coding');
    const sessionResult = await executeCoding(config, session, {
      projectRoot,
      taskId,
      consecutiveFailures: state.consecutiveFailures,
      maxSessions,
      lastValidateLog: state.lastFailReason,
      continue: true,
    });

    if (sessionResult.stalled) {
      state = await onStall(session, { headBefore, taskId, sessionResult, config, ...state });
      if (state.consecutiveFailures === 0) {
        if (shouldSimplify(config)) await tryRunSimplify(config);
      }
      continue;
    }

    const validateResult = await validate(config, headBefore, taskId);

    if (!validateResult.fatal) {
      const level = validateResult.hasWarnings ? 'warn' : 'ok';
      log(level, `Session ${session} ${validateResult.hasWarnings ? '校验通过 (有警告)' : '校验通过 ✓'}`);
      state = await onSuccess(session, { taskId, sessionResult, validateResult });

      if (shouldSimplify(config)) {
        await tryRunSimplify(config);
      }
    } else {
      state = await onFailure(session, { headBefore, taskId, sessionResult, validateResult, ...state });
    }

    if (pauseEvery > 0 && session % pauseEvery === 0) {
      console.log('');
      printStats();
      if (!await promptContinue()) {
        log('info', '手动停止');
        break;
      }
    }
  }

  killServices(projectRoot);
  printEndBanner();
  printStats();
}

module.exports = { executeRun };
