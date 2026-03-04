'use strict';

const fs = require('fs');
const { paths, log, ensureLoopDir } = require('./config');
const { runScanSession } = require('./session');

function validateProfile() {
  const p = paths();
  if (!fs.existsSync(p.profile)) return { valid: false, issues: ['profile 不存在'] };

  let profile;
  try {
    profile = JSON.parse(fs.readFileSync(p.profile, 'utf8'));
  } catch {
    return { valid: false, issues: ['profile JSON 格式错误'] };
  }

  const issues = [];

  if (!profile.tech_stack?.backend?.framework && !profile.tech_stack?.frontend?.framework) {
    issues.push('tech_stack 缺少 backend 或 frontend 框架');
  }
  if (profile.tech_stack?.backend?.framework &&
      (!profile.services || profile.services.length === 0)) {
    issues.push('有后端框架但 services 为空（缺少启动命令和端口）');
  }
  if (!profile.existing_docs || profile.existing_docs.length === 0) {
    issues.push('existing_docs 为空（至少需要 README.md）');
  }

  return { valid: issues.length === 0, issues };
}

async function scan(requirement, opts = {}) {
  const p = paths();
  ensureLoopDir();

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    log('info', `初始化尝试 ${attempt} / ${maxAttempts} ...`);

    const result = await runScanSession(requirement, opts);

    if (fs.existsSync(p.profile) && fs.existsSync(p.tasksFile)) {
      const profileCheck = validateProfile();
      if (!profileCheck.valid) {
        log('warn', `profile 质量问题: ${profileCheck.issues.join('; ')}`);
      }
      log('ok', '初始化完成');
      return { success: true, cost: result.cost };
    }

    if (attempt < maxAttempts) {
      log('warn', '初始化未完成，将重试...');
    }
  }

  log('error', `初始化失败：已重试 ${maxAttempts} 次，关键文件仍未生成`);
  return { success: false, cost: null };
}

module.exports = { scan, validateProfile };
