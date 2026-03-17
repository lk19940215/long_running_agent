'use strict';

const fs = require('fs');
const path = require('path');
const { log } = require('../common/config');
const { assets } = require('../common/assets');
const { buildSystemPrompt, buildScanPrompt } = require('./prompts');
const { RETRY } = require('../common/constants');

/**
 * 检查项目是否包含代码文件
 */
function hasCodeFiles(projectRoot) {
  const markers = [
    'package.json', 'pyproject.toml', 'requirements.txt', 'setup.py',
    'Cargo.toml', 'go.mod', 'pom.xml', 'build.gradle',
    'Makefile', 'Dockerfile', 'docker-compose.yml',
    'README.md', 'main.py', 'app.py', 'index.js', 'index.ts',
  ];
  for (const m of markers) {
    if (fs.existsSync(path.join(projectRoot, m))) return true;
  }
  for (const d of ['src', 'lib', 'app', 'backend', 'frontend', 'web', 'server', 'client']) {
    if (fs.existsSync(path.join(projectRoot, d)) && fs.statSync(path.join(projectRoot, d)).isDirectory()) return true;
  }
  return false;
}

function validateProfile() {
  if (!assets.exists('profile')) return { valid: false, issues: ['profile 不存在'] };

  const profile = assets.readJson('profile', null);
  if (!profile) return { valid: false, issues: ['profile 解析失败'] };
  const issues = [];

  if (!profile.tech_stack?.backend?.framework && !profile.tech_stack?.frontend?.framework) {
    issues.push('tech_stack 缺少 backend 或 frontend 框架');
  }
  if (profile.tech_stack?.backend?.framework && (!profile.services || profile.services.length === 0)) {
    issues.push('有后端框架但 services 为空（缺少启动命令和端口）');
  }
  if (!profile.existing_docs || profile.existing_docs.length === 0) {
    issues.push('existing_docs 为空（至少需要 README.md）');
  }

  return { valid: issues.length === 0, issues };
}

async function executeScan(engine, opts = {}) {
  const maxAttempts = RETRY.SCAN_ATTEMPTS;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    log('info', `初始化尝试 ${attempt} / ${maxAttempts} ...`);

    const projectType = hasCodeFiles(opts.projectRoot || assets.projectRoot) ? 'existing' : 'new';
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    const result = await engine.runSession('scan', {
      logFileName: `scan_${dateStr}.log`,
      label: `scan (${projectType})`,

      async execute(session) {
        log('info', `正在调用 Claude Code 执行项目扫描（${projectType}项目）...`);

        const prompt = buildScanPrompt(projectType);
        const queryOpts = engine.buildQueryOptions(opts);
        queryOpts.systemPrompt = buildSystemPrompt('scan');
        queryOpts.hooks = session.hooks;
        queryOpts.abortController = session.abortController;

        const { cost } = await session.runQuery(prompt, queryOpts);
        return { cost };
      },
    });

    if (assets.exists('profile')) {
      const profileCheck = validateProfile();
      if (!profileCheck.valid) {
        log('warn', `profile 质量问题: ${profileCheck.issues.join('; ')}`);
      }
      log('ok', '项目扫描完成');
      return { success: true, cost: result.cost };
    }

    if (attempt < maxAttempts) {
      log('warn', '初始化未完成，将重试...');
    }
  }

  log('error', `初始化失败：已重试 ${maxAttempts} 次，关键文件仍未生成`);
  return { success: false, cost: null };
}

module.exports = {
  executeScan,
  validateProfile,
};
