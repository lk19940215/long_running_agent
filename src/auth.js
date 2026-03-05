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

function updateMcpConfig(authFilePath) {
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

  const relAuthPath = path.relative(getProjectRoot(), authFilePath);
  mcpConfig.mcpServers.playwright = {
    command: 'npx',
    args: [
      '@playwright/mcp@latest',
      `--storage-state=${relAuthPath}`,
    ],
  };

  fs.writeFileSync(p.mcpConfig, JSON.stringify(mcpConfig, null, 2) + '\n', 'utf8');
  log('ok', `.mcp.json 已配置 Playwright MCP (storage-state: ${relAuthPath})`);
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

  log('info', '启动 Playwright 浏览器，请手动登录...');
  log('info', `目标 URL: ${targetUrl}`);
  log('info', `登录状态将保存到: ${p.playwrightAuth}`);
  console.log('');
  console.log('操作步骤:');
  console.log('  1. 浏览器将自动打开，请手动完成登录');
  console.log('  2. 登录成功后关闭浏览器窗口');
  console.log('  3. 登录状态（cookies + localStorage）将自动保存');
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

  log('ok', '登录状态已保存');

  updateMcpConfig(p.playwrightAuth);
  updateGitignore('.claude-coder/playwright-auth.json');
  enableMcpPlaywrightEnv();

  console.log('');
  log('ok', 'Playwright 凭证配置完成！');
  log('info', '后续运行 claude-coder run 时，Agent 的前端测试将自动使用已认证状态');
  log('info', '注意: cookies 有过期时间，需要定期重新运行 claude-coder auth 更新');
}

module.exports = { auth };
