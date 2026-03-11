'use strict';

const fs = require('fs');
const { paths, log, COLOR } = require('../common/config');
const { readJson, writeJson } = require('../common/utils');
const { TASK_STATUSES, STATUS_TRANSITIONS } = require('../common/constants');

// 暴露常量供外部使用
const VALID_STATUSES = TASK_STATUSES;
const TRANSITIONS = STATUS_TRANSITIONS;

function loadTasks() {
  const p = paths();
  const data = readJson(p.tasksFile, null);
  if (data === null) return null;
  return data;
}

function saveTasks(data) {
  const p = paths();
  writeJson(p.tasksFile, data);
}

function getFeatures(data) {
  return data?.features || [];
}

function findNextTask(data) {
  const features = getFeatures(data);
  const failed = features.filter(f => f.status === 'failed')
    .sort((a, b) => (a.priority || 999) - (b.priority || 999));
  if (failed.length > 0) return failed[0];

  const pending = features.filter(f => f.status === 'pending')
    .filter(f => {
      const deps = f.depends_on || [];
      return deps.every(depId => {
        const dep = features.find(x => x.id === depId);
        return dep && dep.status === 'done';
      });
    })
    .sort((a, b) => (a.priority || 999) - (b.priority || 999));
  if (pending.length > 0) return pending[0];

  const inProgress = features.filter(f => f.status === 'in_progress')
    .sort((a, b) => (a.priority || 999) - (b.priority || 999));
  return inProgress[0] || null;
}

function setStatus(data, taskId, newStatus) {
  const features = getFeatures(data);
  const task = features.find(f => f.id === taskId);
  if (!task) throw new Error(`任务不存在: ${taskId}`);
  if (!VALID_STATUSES.includes(newStatus)) throw new Error(`无效状态: ${newStatus}`);

  const allowed = TRANSITIONS[task.status];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new Error(`非法状态迁移: ${task.status} → ${newStatus}`);
  }

  task.status = newStatus;
  saveTasks(data);
  return task;
}

/**
 * Harness-level forced status change (bypasses TRANSITIONS validation).
 * Used when harness needs to mark tasks failed after max retries.
 */
function forceStatus(data, status) {
  const features = getFeatures(data);
  for (const f of features) {
    if (f.status === 'in_progress') {
      f.status = status;
      saveTasks(data);
      return f;
    }
  }
  return null;
}

function addTask(data, task) {
  if (!data) {
    data = { project: '', created_at: new Date().toISOString().slice(0, 10), features: [] };
  }
  data.features.push(task);
  saveTasks(data);
  return data;
}

function getStats(data) {
  const features = getFeatures(data);
  return {
    total:       features.length,
    done:        features.filter(f => f.status === 'done').length,
    failed:      features.filter(f => f.status === 'failed').length,
    in_progress: features.filter(f => f.status === 'in_progress').length,
    testing:     features.filter(f => f.status === 'testing').length,
    pending:     features.filter(f => f.status === 'pending').length,
  };
}

function printStats() {
  const data = loadTasks();
  if (!data) return;
  const stats = getStats(data);
  log('info', `进度: ${stats.done}/${stats.total} done, ${stats.in_progress} in_progress, ${stats.testing} testing, ${stats.failed} failed, ${stats.pending} pending`);
}

function showStatus() {
  const p = paths();
  const data = loadTasks();
  if (!data) {
    log('warn', '未找到 .claude-coder/tasks.json，请先运行 claude-coder run');
    return;
  }

  const stats = getStats(data);
  const features = getFeatures(data);

  console.log(`\n${COLOR.blue}═══════════════════════════════════════════════${COLOR.reset}`);
  console.log(`  ${COLOR.blue}📋 任务状态${COLOR.reset}   项目: ${data.project || '(未命名)'}`);
  console.log(`${COLOR.blue}═══════════════════════════════════════════════${COLOR.reset}`);

  const bar = stats.total > 0
    ? `[${'█'.repeat(Math.floor(stats.done / stats.total * 30))}${'░'.repeat(30 - Math.floor(stats.done / stats.total * 30))}]`
    : '[░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░]';
  console.log(`  进度: ${bar} ${stats.done}/${stats.total}`);

  console.log(`\n  ${COLOR.green}✔ done: ${stats.done}${COLOR.reset}  ${COLOR.yellow}⏳ pending: ${stats.pending}${COLOR.reset}  ${COLOR.red}✘ failed: ${stats.failed}${COLOR.reset}`);

  if (stats.in_progress > 0 || stats.testing > 0) {
    console.log(`  ▸ in_progress: ${stats.in_progress}  ▸ testing: ${stats.testing}`);
  }

  // Cost summary from progress.json (harness records SDK cost per session)
  const progress = readJson(p.progressFile, null);
  if (progress) {
    const sessions = (progress.sessions || []).filter(s => typeof s.cost === 'number');
    if (sessions.length > 0) {
      const totalCost = sessions.reduce((sum, s) => sum + s.cost, 0);
      console.log(`\n  ${COLOR.blue}💰 累计成本${COLOR.reset}: $${totalCost.toFixed(4)} (${sessions.length} sessions)`);
    }
  }

  // Task list
  console.log(`\n  ${'─'.repeat(45)}`);
  for (const f of features) {
    const icon = { done: '✔', pending: '○', in_progress: '▸', testing: '⟳', failed: '✘' }[f.status] || '?';
    const color = { done: COLOR.green, failed: COLOR.red, in_progress: COLOR.blue, testing: COLOR.yellow }[f.status] || '';
    console.log(`  ${color}${icon}${COLOR.reset} [${f.id}] ${f.description} (${f.status})`);
  }

  console.log(`${COLOR.blue}═══════════════════════════════════════════════${COLOR.reset}\n`);
}

module.exports = {
  VALID_STATUSES,
  TRANSITIONS,
  loadTasks,
  saveTasks,
  getFeatures,
  findNextTask,
  setStatus,
  forceStatus,
  addTask,
  getStats,
  printStats,
  showStatus,
};
