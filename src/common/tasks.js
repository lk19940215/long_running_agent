'use strict';

const { log, COLOR } = require('./display');
const { assets } = require('./assets');

function loadTasks() {
  return assets.readJson('tasks', null);
}

function saveTasks(data) {
  assets.writeJson('tasks', data);
}

function getFeatures(data) {
  return data?.features || [];
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

  const progress = assets.readJson('progress', null);
  if (progress) {
    const sessions = (progress.sessions || []).filter(s => typeof s.cost === 'number');
    if (sessions.length > 0) {
      const totalCost = sessions.reduce((sum, s) => sum + s.cost, 0);
      console.log(`\n  ${COLOR.blue}💰 累计成本${COLOR.reset}: $${totalCost.toFixed(4)} (${sessions.length} sessions)`);
    }
  }

  console.log(`\n  ${'─'.repeat(45)}`);
  for (const f of features) {
    const icon = { done: '✔', pending: '○', in_progress: '▸', testing: '⟳', failed: '✘' }[f.status] || '?';
    const color = { done: COLOR.green, failed: COLOR.red, in_progress: COLOR.blue, testing: COLOR.yellow }[f.status] || '';
    console.log(`  ${color}${icon}${COLOR.reset} [${f.id}] ${f.description} (${f.status})`);
  }

  console.log(`${COLOR.blue}═══════════════════════════════════════════════${COLOR.reset}\n`);
}

module.exports = {
  loadTasks,
  saveTasks,
  getFeatures,
  getStats,
  printStats,
  showStatus,
};
