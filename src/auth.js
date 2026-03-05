'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { paths, log, getProjectRoot, ensureLoopDir } = require('./config');

function updateGitignore(entry) {
  const gitignorePath = path.join(getProjectRoot(), '.gitignore');
  let content = '';
  if (fs.existsSync(gitignorePath)) {
    content = fs.readFileSync(gitignorePath, 'utf8');
  }
  if (content.includes(entry)) return;

  const suffix = content.endsWith('\n') || content === '' ? '' : '\n';
  fs.appendFileSync(gitignorePath, `${suffix}${entry}\n`, 'utf8');
  log('ok', `.gitignore 已添加: ${entry}`);
}

function updateMcpConfig(browserProfileDir) {
  const p = paths();
  let mcpConfig = {};
  if (fs.existsSync(p.mcpConfig)) {
    try {
      mcpConfig = JSON.parse(fs.readFileSync(p.mcpConfig, 'utf8'));
    } catch {
      log('warn', '.mcp.json 解析失败，将覆盖');
    }
  }

  if (!mcpConfig.mcpServers) mcpConfig.mcpServers = {};

  const relProfileDir = path.relative(getProjectRoot(), browserProfileDir);
  mcpConfig.mcpServers.playwright = {
    command: 'npx',
    args: [
      '@playwright/mcp@latest',
      `--user-data-dir=${relProfileDir}`,
    ],
  };

  fs.writeFileSync(p.mcpConfig, JSON.stringify(mcpConfig, null, 2) + '\n', 'utf8');
  log('ok', `.mcp.json 已配置 Playwright MCP (user-data-dir: ${relProfileDir})`);
}

function enableMcpPlaywrightEnv() {
  const p = paths();
  if (!fs.existsSync(p.envFile)) return;

  let content = fs.readFileSync(p.envFile, 'utf8');
  if (/^MCP_PLAYWRIGHT=/m.test(content)) {
    content = content.replace(/^MCP_PLAYWRIGHT=.*/m, 'MCP_PLAYWRIGHT=true');
  } else {
    const suffix = content.endsWith('\n') ? '' : '\n';
    content += `${suffix}MCP_PLAYWRIGHT=true\n`;
  }
  fs.writeFileSync(p.envFile, content, 'utf8');
  log('ok', '.claude-coder/.env 已设置 MCP_PLAYWRIGHT=true');
}

async function auth(url) {
  ensureLoopDir();
  const p = paths();
  const targetUrl = url || 'http://localhost:3000';

  if (!fs.existsSync(p.browserProfile))
    fs.mkdirSync(p.browserProfile, { recursive: true });

  log('info', '启动 Playwright 浏览器，请手动登录...');
  log('info', `目标 URL: ${targetUrl}`);
  log('info', `浏览器配置将持久化到: ${p.browserProfile}`);
  console.log('');
  console.log('操作步骤:');
  console.log('  1. 浏览器将自动打开，请手动完成登录');
  console.log('  2. 登录成功后关闭浏览器窗口');
  console.log('  3. 登录状态（cookies + localStorage）将保存为快照备份');
  console.log('');

  try {
    execSync(
      `npx playwright codegen --save-storage="${p.playwrightAuth}" "${targetUrl}"`,
      { stdio: 'inherit', cwd: getProjectRoot() }
    );
  } catch (err) {
    if (!fs.existsSync(p.playwrightAuth)) {
      log('error', `Playwright 登录状态导出失败: ${err.message}`);
      log('info', '请确保已安装 playwright: npx playwright install');
      return;
    }
  }

  if (!fs.existsSync(p.playwrightAuth)) {
    log('error', '未检测到导出的登录状态文件');
    return;
  }

  log('ok', '登录状态快照已保存（备份参考）');

  updateMcpConfig(p.browserProfile);
  updateGitignore('.claude-coder/playwright-auth.json');
  updateGitignore('.claude-coder/browser-profile/');
  enableMcpPlaywrightEnv();

  console.log('');
  log('ok', '持久化浏览器配置完成！');
  log('info', 'MCP 使用 --user-data-dir 持久化模式，登录状态跨会话保持');
  log('info', '首次 MCP 会话时需在浏览器窗口中登录一次，之后永久保持');
  log('info', 'cookies 自动续期，无需手动重新运行 claude-coder auth');
}

module.exports = { auth };
