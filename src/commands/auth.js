'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { paths, loadConfig, log, getProjectRoot, ensureLoopDir } = require('../common/config');
const { appendGitignore } = require('../common/utils');

function updateGitignore(entry) {
  if (appendGitignore(getProjectRoot(), entry)) {
    log('ok', `.gitignore 已添加: ${entry}`);
  }
}

function updateMcpConfig(p, mode) {
  let mcpConfig = {};
  if (fs.existsSync(p.mcpConfig)) {
    try { mcpConfig = JSON.parse(fs.readFileSync(p.mcpConfig, 'utf8')); } catch {}
  }

  if (!mcpConfig.mcpServers) mcpConfig.mcpServers = {};

  const args = ['@playwright/mcp@latest'];

  switch (mode) {
    case 'persistent': {
      const relProfile = path.relative(getProjectRoot(), p.browserProfile).split(path.sep).join('/');
      args.push(`--user-data-dir=${relProfile}`);
      break;
    }
    case 'isolated': {
      const relAuth = path.relative(getProjectRoot(), p.playwrightAuth).split(path.sep).join('/');
      args.push('--isolated', `--storage-state=${relAuth}`);
      break;
    }
    case 'extension':
      args.push('--extension');
      break;
  }

  mcpConfig.mcpServers.playwright = { command: 'npx', args };
  fs.writeFileSync(p.mcpConfig, JSON.stringify(mcpConfig, null, 2) + '\n', 'utf8');
  log('ok', `.mcp.json 已配置 Playwright MCP (${mode} 模式)`);
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

// ── persistent 模式：启动持久化浏览器让用户登录 ──

async function authPersistent(url, p) {
  const profileDir = p.browserProfile;
  if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });

  const lockFile = path.join(profileDir, 'SingletonLock');
  if (fs.existsSync(lockFile)) {
    fs.unlinkSync(lockFile);
    log('warn', '已清理残留的 SingletonLock（上次浏览器未正常关闭）');
  }

  console.log('操作步骤:');
  console.log('  1. 浏览器将自动打开，请手动完成登录');
  console.log('  2. 登录成功后关闭浏览器窗口');
  console.log('  3. 登录状态将保存在持久化配置中');
  console.log('  4. MCP 后续会话自动复用此登录状态');
  console.log('');

  const scriptContent = [
    `let chromium;`,
    `try { chromium = require('playwright').chromium; } catch {`,
    `  try { chromium = require('@playwright/test').chromium; } catch {`,
    `    console.error('错误: 未找到 playwright 模块');`,
    `    console.error('请安装: npx playwright install chromium');`,
    `    process.exit(1);`,
    `  }`,
    `}`,
    `(async () => {`,
    `  const ctx = await chromium.launchPersistentContext(${JSON.stringify(profileDir)}, { headless: false });`,
    `  const page = ctx.pages()[0] || await ctx.newPage();`,
    `  try { await page.goto(${JSON.stringify(url)}); } catch {}`,
    `  console.log('请在浏览器中完成登录后关闭窗口...');`,
    `  await new Promise(r => {`,
    `    ctx.on('close', r);`,
    `    const t = setInterval(() => { try { if (!ctx.pages().length) { clearInterval(t); r(); } } catch { clearInterval(t); r(); } }, 2000);`,
    `  });`,
    `  try { await ctx.close(); } catch {}`,
    `})().then(() => process.exit(0)).catch(() => process.exit(0));`,
  ].join('\n');

  const tmpScript = path.join(os.tmpdir(), `pw-auth-${Date.now()}.js`);
  fs.writeFileSync(tmpScript, scriptContent);

  const helperModules = path.join(__dirname, '..', 'node_modules');
  const existingNodePath = process.env.NODE_PATH || '';
  const nodePath = existingNodePath ? `${helperModules}:${existingNodePath}` : helperModules;

  let scriptOk = false;
  try {
    execSync(`node "${tmpScript}"`, {
      stdio: 'inherit',
      cwd: getProjectRoot(),
      env: { ...process.env, NODE_PATH: nodePath },
    });
    scriptOk = true;
  } catch {
    // 浏览器关闭时可能返回非零退出码，只要 profile 目录有内容就认为成功
    const profileFiles = fs.readdirSync(profileDir);
    scriptOk = profileFiles.length > 2;
    if (!scriptOk) {
      log('error', 'Playwright 启动失败，且未检测到有效的浏览器配置');
      log('info', '请确保已安装 Chromium: npx playwright install chromium');
      try { fs.unlinkSync(tmpScript); } catch {}
      return;
    }
    log('warn', '浏览器退出码非零，但已检测到有效配置，继续...');
  }

  try { fs.unlinkSync(tmpScript); } catch {}

  log('ok', '登录状态已保存到持久化配置');
  updateMcpConfig(p, 'persistent');
  updateGitignore('.claude-coder/.runtime/browser-profile');
  enableMcpPlaywrightEnv();

  console.log('');
  log('ok', '配置完成！');
  const relProfile = path.relative(getProjectRoot(), profileDir);
  log('info', `MCP 使用 persistent 模式 (user-data-dir: ${relProfile})`);
  log('info', '如需更新登录状态，重新运行 claude-coder auth');
}

// ── isolated 模式：使用 codegen 录制 storage-state ──

async function authIsolated(url, p) {
  console.log('操作步骤:');
  console.log('  1. 浏览器将自动打开，请手动完成登录');
  console.log('  2. 登录成功后关闭浏览器窗口');
  console.log('  3. 登录状态（cookies + localStorage）将保存到 playwright-auth.json');
  console.log('  4. MCP 每次会话自动从此文件加载初始状态');
  console.log('');

  try {
    execSync(
      `npx playwright codegen --save-storage="${p.playwrightAuth}" "${url}"`,
      { stdio: 'inherit', cwd: getProjectRoot() }
    );
  } catch (err) {
    if (!fs.existsSync(p.playwrightAuth)) {
      log('error', `Playwright 登录状态导出失败: ${err.message}`);
      log('info', '请确保已安装: npx playwright install chromium');
      return;
    }
  }

  if (!fs.existsSync(p.playwrightAuth)) {
    log('error', '未检测到导出的登录状态文件');
    return;
  }

  log('ok', '登录状态已保存到 playwright-auth.json');
  updateMcpConfig(p, 'isolated');
  updateGitignore('.claude-coder/playwright-auth.json');
  enableMcpPlaywrightEnv();

  console.log('');
  log('ok', '配置完成！');
  log('info', 'MCP 使用 isolated 模式 (storage-state)');
  log('info', 'cookies 和 localStorage 每次会话自动从 playwright-auth.json 加载');
  log('info', '如需更新登录状态，重新运行 claude-coder auth');
}

// ── extension 模式：连接真实浏览器 ──

function authExtension(p) {
  console.log('Extension 模式说明:');
  console.log('');
  console.log('  此模式通过 Chrome 扩展连接到您正在运行的浏览器。');
  console.log('  MCP 将直接使用浏览器中已有的登录态和扩展。');
  console.log('');
  console.log('  前置条件:');
  console.log('  1. 安装 "Playwright MCP Bridge" Chrome/Edge 扩展');
  console.log('     https://chromewebstore.google.com/detail/playwright-mcp-bridge/mmlmfjhmonkocbjadbfplnigmagldckm');
  console.log('  2. 确保浏览器已启动且扩展已启用');
  console.log('  3. 无需额外认证操作，您的浏览器登录态将自动可用');
  console.log('');

  updateMcpConfig(p, 'extension');
  enableMcpPlaywrightEnv();

  console.log('');
  log('ok', '配置完成！');
  log('info', 'MCP 使用 extension 模式（连接真实浏览器）');
  log('info', '确保 Chrome/Edge 已运行且 Playwright MCP Bridge 扩展已启用');
}

// ── 主入口 ──

async function auth(url) {
  ensureLoopDir();
  const config = loadConfig();
  const p = paths();
  const mode = config.playwrightMode;
  const targetUrl = url || 'http://localhost:3000';

  log('info', `Playwright 模式: ${mode}`);
  log('info', `目标 URL: ${targetUrl}`);
  console.log('');

  switch (mode) {
    case 'persistent':
      await authPersistent(targetUrl, p);
      break;
    case 'isolated':
      await authIsolated(targetUrl, p);
      break;
    case 'extension':
      authExtension(p);
      break;
    default:
      log('error', `未知的 Playwright 模式: ${mode}`);
      log('info', '请运行 claude-coder setup 重新配置');
      return;
  }
}

module.exports = { auth, updateMcpConfig };
