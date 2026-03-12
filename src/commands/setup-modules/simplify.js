'use strict';

const { ask } = require('./helpers');
const { log, COLOR, updateEnvVar } = require('../../common/config');

// ── 自动审查配置 ──

async function updateSimplifyConfig(rl, existing) {
  const currentInterval = existing.SIMPLIFY_INTERVAL ?? '5';
  const currentCommits = existing.SIMPLIFY_COMMITS ?? '5';

  console.log(`${COLOR.blue}自动代码审查配置:${COLOR.reset}`);
  console.log(`  当前状态:     ${currentInterval === '0' ? '禁用' : `每 ${currentInterval} 个 session 运行一次`}`);
  console.log(`  审查范围:     ${currentCommits} 个 commit`);
  console.log('');
  console.log(`${COLOR.yellow}说明:${COLOR.reset}`);
  console.log('  自动审查 — 在 run() 循环中定期运行代码审查，检查代码复用性、质量、效率');
  console.log('  审查间隔 — 每 N 个成功的 session 后运行一次（0 = 禁用）');
  console.log('  审查范围 — 审查最近 N 个 commit 的代码变更');
  console.log('');

  const intervalInput = await ask(rl, `审查间隔（输入 0 禁用，回车保留 ${currentInterval === '0' ? '禁用' : currentInterval}）: `);
  if (intervalInput.trim()) {
    const interval = parseInt(intervalInput.trim(), 10);
    if (isNaN(interval) || interval < 0) {
      log('warn', '请输入 >= 0 的整数，跳过');
    } else {
      updateEnvVar('SIMPLIFY_INTERVAL', String(interval));
      log('ok', `自动审查已${interval === 0 ? '禁用' : `设置为每 ${interval} 个 session 运行一次`}`);
    }
  }

  const effectiveInterval = intervalInput.trim()
    ? String(parseInt(intervalInput.trim(), 10) || 0)
    : currentInterval;
  if (effectiveInterval !== '0') {
    console.log('');
    const commitsInput = await ask(rl, `审查 commit 数量（回车保留 ${currentCommits}）: `);
    if (commitsInput.trim()) {
      const commits = parseInt(commitsInput.trim(), 10);
      if (isNaN(commits) || commits < 1) {
        log('warn', '请输入 >= 1 的整数，跳过');
      } else {
        updateEnvVar('SIMPLIFY_COMMITS', String(commits));
        log('ok', `审查范围已设置为 ${commits} 个 commit`);
      }
    }
  }
}

module.exports = {
  updateSimplifyConfig,
};