'use strict';

const fs = require('fs');
const readline = require('readline');
const { execSync } = require('child_process');
const { log, loadConfig } = require('../common/config');
const { assets } = require('../common/assets');
const { getGitHead, isGitRepo, sleep } = require('../common/utils');
const { RETRY } = require('../common/constants');
const { loadTasks, getFeatures, getStats, findNextTask, forceStatus, printStats } = require('../common/tasks');
const { validate } = require('./validator');
const { runCodingSession } = require('./coding');
const { simplify } = require('./simplify');
const { loadSDK } = require('../common/sdk');

const MAX_RETRY = RETRY.MAX_ATTEMPTS;

function getHead() {
  return getGitHead(assets.projectRoot);
}

function killServicesByProfile() {
  const profile = assets.readJson('profile', null);
  if (!profile) return;
  try {
    const services = profile.services || [];
    const ports = services.map(s => s.port).filter(Boolean);
    if (ports.length === 0) return;

    const isWin = process.platform === 'win32';
    for (const port of ports) {
      try {
        if (isWin) {
          const out = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: 'utf8', stdio: 'pipe' }).trim();
          const pids = [...new Set(out.split('\n').map(l => l.trim().split(/\s+/).pop()).filter(Boolean))];
          for (const pid of pids) { try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'pipe' }); } catch { /* ignore */ } }
        } else {
          execSync(`lsof -ti :${port} | xargs kill -9 2>/dev/null`, { stdio: 'pipe' });
        }
      } catch { /* no process on port */ }
    }
    log('info', `已停止端口 ${ports.join(', ')} 上的服务`);
  } catch { /* ignore profile read errors */ }
}

async function rollback(headBefore, reason) {
  if (!headBefore || headBefore === 'none') return;

  killServicesByProfile();

  if (process.platform === 'win32') await sleep(1500);

  const cwd = assets.projectRoot;
  const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0' };

  log('warn', `回滚到 ${headBefore} ...`);

  let success = false;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      execSync(`git reset --hard ${headBefore}`, { cwd, stdio: 'pipe', env: gitEnv });
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
    timestamp: new Date().toISOString(),
    reason: reason || 'harness 校验失败',
    rollbackTo: headBefore,
    success,
  });
}

function markTaskFailed() {
  const data = loadTasks();
  if (!data) return;
  const result = forceStatus(data, 'failed');
  if (result) {
    log('warn', `已将任务 ${result.id} 强制标记为 failed`);
  }
}

function tryPush() {
  try {
    const cwd = assets.projectRoot;
    const remotes = execSync('git remote', { cwd, encoding: 'utf8' }).trim();
    if (!remotes) return;
    log('info', '正在推送代码...');
    execSync('git push', { cwd, stdio: 'inherit' });
    log('ok', '推送成功');
  } catch {
    log('warn', '推送失败 (请检查网络或权限)，继续执行...');
  }
}

function appendProgress(entry) {
  let progress = assets.readJson('progress', { sessions: [] });
  if (!Array.isArray(progress.sessions)) progress.sessions = [];
  progress.sessions.push(entry);
  assets.writeJson('progress', progress);
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

async function run(opts = {}) {
  assets.ensureDirs();
  const projectRoot = assets.projectRoot;

  const maxSessions = opts.max || 50;
  const pauseEvery = opts.pause ?? 0;
  const dryRun = opts.dryRun || false;

  console.log('');
  console.log('============================================');
  console.log(`  Claude Coder${dryRun ? ' (预览模式)' : ''}`);
  console.log('============================================');
  console.log('');

  const config = loadConfig();
  if (config.provider !== 'claude' && config.baseUrl) {
    log('ok', `模型配置已加载: ${config.provider}${config.model ? ` (${config.model})` : ''}`);
  }

  if (!isGitRepo(projectRoot)) {
    log('info', '初始化 git 仓库...');
    execSync('git init', { cwd: projectRoot, stdio: 'inherit' });
    execSync('git add -A && git commit -m "init: 项目初始化" --allow-empty', {
      cwd: projectRoot,
      stdio: 'inherit',
    });
  }

  if (!assets.exists('profile')) {
    log('error', 'profile 不存在，请先运行 claude-coder init 初始化项目');
    process.exit(1);
  }

  if (!assets.exists('tasks')) {
    log('error', 'tasks.json 不存在，请先运行 claude-coder plan 生成任务');
    process.exit(1);
  }

  printStats();

  if (!dryRun) await loadSDK();
  log('info', `开始编码循环 (最多 ${maxSessions} 个会话) ...`);
  console.log('');

  let consecutiveFailures = 0;

  for (let session = 1; session <= maxSessions; session++) {
    console.log('');
    console.log('--------------------------------------------');
    log('info', `Session ${session} / ${maxSessions}`);
    console.log('--------------------------------------------');

    const taskData = loadTasks();
    if (!taskData) {
      log('error', 'tasks.json 无法读取，终止循环');
      break;
    }

    const features = getFeatures(taskData);
    if (features.length > 0 && features.every(f => f.status === 'done')) {
      console.log('');
      log('ok', '所有任务已完成！');
      printStats();
      break;
    }

    const stats = getStats(taskData);
    log('info', `进度: ${stats.done}/${stats.total} done, ${stats.in_progress} in_progress, ${stats.testing} testing, ${stats.failed} failed, ${stats.pending} pending`);

    if (dryRun) {
      const next = findNextTask(taskData);
      log('info', `[DRY-RUN] 下一个任务: ${next ? `${next.id} - ${next.description}` : '无待处理任务'}`);
      if (!next) {
        log('ok', '[DRY-RUN] 无可执行任务，预览结束');
      } else {
        console.log('');
        log('info', '[DRY-RUN] 任务队列:');
        const allFeatures = getFeatures(taskData);
        for (const f of allFeatures) {
          const st = f.status || 'unknown';
          const statusTag = { done: '✓', in_progress: '▸', pending: '○', failed: '✗', testing: '◇' }[st] || '?';
          log('info', `  ${statusTag} [${st.padEnd(11)}] ${f.id} - ${f.description || ''}`);
        }
      }
      break;
    }

    const headBefore = getHead();
    const nextTask = findNextTask(taskData);
    const taskId = nextTask?.id || 'unknown';

    const sessionResult = await runCodingSession(session, {
      projectRoot,
      taskId,
      consecutiveFailures,
      maxSessions,
      lastValidateLog: consecutiveFailures > 0 ? '上次校验失败' : '',
    });

    if (sessionResult.stalled) {
      log('warn', `Session ${session} 因停顿超时中断，跳过校验直接重试`);
      consecutiveFailures++;
      await rollback(headBefore, '停顿超时');
      if (consecutiveFailures >= MAX_RETRY) {
        log('error', `连续失败 ${MAX_RETRY} 次，跳过当前任务`);
        markTaskFailed();
        consecutiveFailures = 0;
      }
      appendProgress({
        session,
        timestamp: new Date().toISOString(),
        result: 'stalled',
        cost: sessionResult.cost,
        taskId,
      });
      continue;
    }

    log('info', '开始 harness 校验 ...');
    const validateResult = await validate(headBefore, taskId);

    if (!validateResult.fatal) {
      if (validateResult.hasWarnings) {
        log('warn', `Session ${session} 校验通过 (有自动修复或警告)`);
      } else {
        log('ok', `Session ${session} 校验通过`);
      }

      // 定期运行 simplify 代码审查
      const simplifyInterval = config.simplifyInterval;
      if (simplifyInterval > 0 && session % simplifyInterval === 0) {
        log('info', `每 ${simplifyInterval} 个 session 运行代码审查...`);
        await simplify(null, { n: config.simplifyCommits });

        // 检查是否有代码变更
        try {
          execSync('git diff --quiet HEAD', { cwd: projectRoot, stdio: 'pipe' });
        } catch {
          // 有变更，自动提交
          execSync('git add -A && git commit -m "style: simplify optimization"', { cwd: projectRoot, stdio: 'pipe' });
          log('ok', '代码优化已提交');
        }
      }

      tryPush();
      consecutiveFailures = 0;

      appendProgress({
        session,
        timestamp: new Date().toISOString(),
        result: 'success',
        cost: sessionResult.cost,
        taskId,
        statusAfter: validateResult.sessionData?.status_after || null,
        notes: validateResult.sessionData?.notes || null,
      });

    } else {
      consecutiveFailures++;
      log('error', `Session ${session} 校验失败 (连续失败: ${consecutiveFailures}/${MAX_RETRY})`);

      appendProgress({
        session,
        timestamp: new Date().toISOString(),
        result: 'fatal',
        cost: sessionResult.cost,
        taskId,
        reason: validateResult.sessionData?.reason || '校验失败',
      });

      await rollback(headBefore, '校验失败');

      if (consecutiveFailures >= MAX_RETRY) {
        log('error', `连续失败 ${MAX_RETRY} 次，跳过当前任务`);
        markTaskFailed();
        consecutiveFailures = 0;
        log('warn', '已将任务标记为 failed，继续下一个任务');
      }
    }

    if (pauseEvery > 0 && session % pauseEvery === 0) {
      console.log('');
      printStats();
      const shouldContinue = await promptContinue();
      if (!shouldContinue) {
        log('info', '手动停止');
        break;
      }
    }
  }

  killServicesByProfile();

  console.log('');
  console.log('============================================');
  console.log('  运行结束');
  console.log('============================================');
  console.log('');
  printStats();
}

module.exports = { run };
