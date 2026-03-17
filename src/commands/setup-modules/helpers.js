'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { log, COLOR, updateEnvVar } = require('../../common/config');
const { ensureGitignore: ensureGitignoreBase } = require('../../common/utils');
const { assets } = require('../../common/assets');

function createInterface() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function ask(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

function askChoice(rl, prompt, min, max, defaultVal) {
  return new Promise(async (resolve) => {
    while (true) {
      const raw = await ask(rl, prompt);
      const val = raw.trim() || String(defaultVal ?? '');
      const num = parseInt(val, 10);
      if (num >= min && num <= max) return resolve(num);
      console.log(`请输入 ${min}-${max}`);
    }
  });
}

async function askApiKey(rl, platform, apiUrl, existingKey) {
  if (existingKey) {
    console.log('回车保留当前 API Key，输入新 Key 更新，输入 q 返回上层菜单:');
  } else {
    console.log(`请输入 ${platform} 的 API Key:`);
  }
  if (apiUrl) {
    console.log(`  ${COLOR.blue}获取入口: ${apiUrl}${COLOR.reset}`);
    console.log('');
  }
  const key = await ask(rl, '  API Key: ');
  const trimmed = key.trim();
  if (trimmed.toLowerCase() === 'q') {
    return null;
  }
  if (!trimmed) {
    if (existingKey) return existingKey;
    console.error('API Key 不能为空');
    process.exit(1);
  }
  return trimmed;
}

function writeConfig(filePath, lines) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (fs.existsSync(filePath)) {
    const ts = new Date().toISOString().replace(/[:\-T]/g, '').slice(0, 14);
    const backup = `${filePath}.bak.${ts}`;
    fs.copyFileSync(filePath, backup);
    log('info', `已备份旧配置到: ${backup}`);
  }

  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf8');
}

function ensureGitignore() {
  if (ensureGitignoreBase(assets.projectRoot)) {
    log('info', '已更新 .gitignore');
  }
}

function showCurrentConfig(existing) {
  console.log('');
  console.log(`${COLOR.blue}当前配置:${COLOR.reset}`);
  console.log(`  提供商:     ${existing.MODEL_PROVIDER || '未配置'}`);
  console.log(`  BASE_URL:   ${existing.ANTHROPIC_BASE_URL || '默认'}`);
  console.log(`  模型:       ${existing.ANTHROPIC_MODEL || '默认'}`);
  console.log(`  MCP:        ${existing.MCP_PLAYWRIGHT === 'true' ? `已启用 (${existing.MCP_PLAYWRIGHT_MODE || 'persistent'})` : '未启用'}`);
  const turns = existing.SESSION_MAX_TURNS || '0';
  console.log(`  停顿超时:   ${existing.SESSION_STALL_TIMEOUT || '600'} 秒`);
  console.log(`  完成检测:   Stop hook（SDK 原生）`);
  console.log(`  工具轮次:   ${turns === '0' ? '无限制' : turns}`);
  const simplifyInterval = existing.SIMPLIFY_INTERVAL ?? '5';
  const simplifyCommits = existing.SIMPLIFY_COMMITS ?? '5';
  console.log(`  自动审查:   ${simplifyInterval === '0' ? '禁用' : `每 ${simplifyInterval} 个 session`}${simplifyInterval !== '0' ? `，审查 ${simplifyCommits} 个 commit` : ''}`);
  console.log('');
}

module.exports = {
  createInterface,
  ask,
  askChoice,
  askApiKey,
  writeConfig,
  ensureGitignore,
  showCurrentConfig,
};
