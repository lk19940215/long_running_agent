'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execSync } = require('child_process');
const { log } = require('../common/display');
const { loadConfig } = require('../common/config');
const { assets } = require('../common/assets');
const { appendGitignore } = require('../common/utils');

function resolvePlaywright() {
  const { createRequire } = require('module');
  const pkg = 'playwright';

  try {
    return path.dirname(require.resolve(`${pkg}/package.json`));
  } catch {}

  try {
    const r = createRequire(path.join(process.cwd(), 'noop.js'));
    return path.dirname(r.resolve(`${pkg}/package.json`));
  } catch {}

  try {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const pkgJsonPath = path.join(globalRoot, pkg, 'package.json');
    if (fs.existsSync(pkgJsonPath)) return path.join(globalRoot, pkg);
  } catch {}

  return null;
}

function normalizeUrl(url) {
  if (!url) return null;
  return /^https?:\/\//.test(url) ? url : `http://${url}`;
}

function updateGitignore(entry) {
  if (appendGitignore(assets.projectRoot, entry)) {
    log('ok', `.gitignore 已添加: ${entry}`);
  }
}

// ─────────────────────────────────────────────────────────────
// .mcp.json 配置（Playwright / Chrome DevTools 共用）
// ─────────────────────────────────────────────────────────────

function updateMcpConfig(mcpPath, tool, mode) {
  let mcpConfig = {};
  if (fs.existsSync(mcpPath)) {
    try { mcpConfig = JSON.parse(fs.readFileSync(mcpPath, 'utf8')); } catch {}
  }

  if (!mcpConfig.mcpServers) mcpConfig.mcpServers = {};

  if (tool === 'chrome-devtools') {
    delete mcpConfig.mcpServers.playwright;
    mcpConfig.mcpServers['chrome-devtools'] = {
      command: 'npx',
      args: ['-y', 'chrome-devtools-mcp@latest', '--autoConnect'],
    };
    fs.writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2) + '\n', 'utf8');
    log('ok', '.mcp.json 已配置 Chrome DevTools MCP (autoConnect)');
    return;
  }

  // Playwright MCP
  delete mcpConfig.mcpServers['chrome-devtools'];
  const args = ['@playwright/mcp@latest'];
  const projectRoot = assets.projectRoot;

  switch (mode) {
    case 'persistent': {
      const browserProfilePath = assets.path('browserProfile');
      const relProfile = path.relative(projectRoot, browserProfilePath).split(path.sep).join('/');
      args.push(`--user-data-dir=${relProfile}`);
      break;
    }
    case 'isolated': {
      const playwrightAuthPath = assets.path('playwrightAuth');
      const relAuth = path.relative(projectRoot, playwrightAuthPath).split(path.sep).join('/');
      args.push('--isolated', `--storage-state=${relAuth}`);
      break;
    }
    case 'extension':
      args.push('--extension');
      break;
  }

  mcpConfig.mcpServers.playwright = { command: 'npx', args };
  fs.writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2) + '\n', 'utf8');
  log('ok', `.mcp.json 已配置 Playwright MCP (${mode} 模式)`);
}

function enableWebTestEnv(tool) {
  const envPath = assets.path('env');
  if (!envPath || !fs.existsSync(envPath)) return;

  let content = fs.readFileSync(envPath, 'utf8');
  if (/^WEB_TEST_TOOL=/m.test(content)) {
    content = content.replace(/^WEB_TEST_TOOL=.*/m, `WEB_TEST_TOOL=${tool}`);
  } else {
    const suffix = content.endsWith('\n') ? '' : '\n';
    content += `${suffix}WEB_TEST_TOOL=${tool}\n`;
  }
  fs.writeFileSync(envPath, content, 'utf8');
  log('ok', `.claude-coder/.env 已设置 WEB_TEST_TOOL=${tool}`);
}

// ─────────────────────────────────────────────────────────────
// 浏览器脚本（Playwright persistent 模式用）
// ─────────────────────────────────────────────────────────────

function buildBrowserScript(playwrightDir, profileDir, url) {
  const thirtyDays = Math.floor(Date.now() / 1000) + 86400 * 30;
  return [
    `const { chromium } = require(${JSON.stringify(playwrightDir)});`,
    `(async () => {`,
    `  const ctx = await chromium.launchPersistentContext(${JSON.stringify(profileDir)}, { headless: false });`,
    `  const page = ctx.pages()[0] || await ctx.newPage();`,
    `  try { await page.goto(${JSON.stringify(url)}); } catch {}`,
    `  console.log('请在浏览器中完成操作后关闭窗口...');`,
    `  const persistSessionCookies = async () => {`,
    `    try {`,
    `      const cookies = await ctx.cookies();`,
    `      const session = cookies.filter(c => c.expires === -1);`,
    `      if (session.length > 0) {`,
    `        await ctx.addCookies(session.map(c => ({ ...c, expires: ${thirtyDays} })));`,
    `        console.log('已将 ' + session.length + ' 个 session cookie 转为持久化');`,
    `      }`,
    `    } catch {}`,
    `  };`,
    `  ctx.on('page', p => p.on('close', () => persistSessionCookies()));`,
    `  for (const p of ctx.pages()) p.on('close', () => persistSessionCookies());`,
    `  await new Promise(r => {`,
    `    ctx.on('close', r);`,
    `    const t = setInterval(async () => {`,
    `      try {`,
    `        if (!ctx.pages().length) { clearInterval(t); await persistSessionCookies(); r(); }`,
    `      } catch { clearInterval(t); r(); }`,
    `    }, 2000);`,
    `  });`,
    `  try { await ctx.close(); } catch {}`,
    `})().then(() => process.exit(0)).catch(() => process.exit(0));`,
  ].join('\n');
}

function runBrowserScript(script, cwd) {
  const tmpScript = path.join(os.tmpdir(), `pw-auth-${Date.now()}.js`);
  fs.writeFileSync(tmpScript, script);
  try {
    execSync(`node "${tmpScript}"`, { stdio: 'inherit', cwd });
    return true;
  } catch {
    return false;
  } finally {
    try { fs.unlinkSync(tmpScript); } catch {}
  }
}

// ─────────────────────────────────────────────────────────────
// auth 模式实现
// ─────────────────────────────────────────────────────────────

async function authPersistent(url) {
  const playwrightDir = resolvePlaywright();
  if (!playwrightDir) {
    log('error', '未找到 playwright 模块');
    log('info', '请安装: npm install -g playwright && npx playwright install chromium');
    return;
  }

  const profileDir = assets.path('browserProfile');
  if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });

  const lockFile = path.join(profileDir, 'SingletonLock');
  if (fs.existsSync(lockFile)) {
    fs.unlinkSync(lockFile);
    log('warn', '已清理残留的 SingletonLock（上次浏览器未正常关闭）');
  }

  console.log('操作步骤:');
  console.log('  1. 浏览器将自动打开，请手动完成登录');
  console.log('  2. 登录成功后关闭浏览器窗口');
  console.log('  3. 登录状态将保存在持久化配置中（session cookie 自动转持久化）');
  console.log('  4. MCP 后续会话自动复用此登录状态');
  console.log('');

  const script = buildBrowserScript(playwrightDir, profileDir, url);
  const projectRoot = assets.projectRoot;

  const ok = runBrowserScript(script, projectRoot);
  if (!ok) {
    const profileFiles = fs.readdirSync(profileDir);
    if (profileFiles.length <= 2) {
      log('error', 'Playwright 启动失败，且未检测到有效的浏览器配置');
      log('info', '请确保已安装 Chromium: npx playwright install chromium');
      return;
    }
    log('warn', '浏览器退出码非零，但已检测到有效配置，继续...');
  }

  const mcpPath = assets.path('mcpConfig');
  log('ok', '登录状态已保存到持久化配置');
  updateMcpConfig(mcpPath, 'playwright', 'persistent');
  updateGitignore('.claude-coder/.runtime/browser-profile');
  enableWebTestEnv('playwright');

  console.log('');
  log('ok', '配置完成！');
  const relProfile = path.relative(projectRoot, profileDir);
  log('info', `MCP 使用 persistent 模式 (user-data-dir: ${relProfile})`);
  log('info', '验证: 再次运行 claude-coder auth <URL>，浏览器应直接进入已登录状态');
}

async function authIsolated(url) {
  const playwrightAuthPath = assets.path('playwrightAuth');
  const projectRoot = assets.projectRoot;

  console.log('操作步骤:');
  console.log('  1. 浏览器将自动打开，请手动完成登录');
  console.log('  2. 登录成功后关闭浏览器窗口');
  console.log('  3. 登录状态（cookies + localStorage）将保存到 playwright-auth.json');
  console.log('  4. MCP 每次会话自动从此文件加载初始状态');
  console.log('');

  try {
    execSync(
      `npx playwright codegen --save-storage="${playwrightAuthPath}" "${url}"`,
      { stdio: 'inherit', cwd: projectRoot }
    );
  } catch (err) {
    if (!fs.existsSync(playwrightAuthPath)) {
      log('error', `Playwright 登录状态导出失败: ${err.message}`);
      log('info', '请确保已安装: npx playwright install chromium');
      return;
    }
  }

  if (!fs.existsSync(playwrightAuthPath)) {
    log('error', '未检测到导出的登录状态文件');
    return;
  }

  const mcpPath = assets.path('mcpConfig');
  log('ok', '登录状态已保存到 playwright-auth.json');
  updateMcpConfig(mcpPath, 'playwright', 'isolated');
  updateGitignore('.claude-coder/playwright-auth.json');
  enableWebTestEnv('playwright');

  console.log('');
  log('ok', '配置完成！');
  log('info', 'MCP 使用 isolated 模式 (storage-state)');
  log('info', 'cookies 和 localStorage 每次会话自动从 playwright-auth.json 加载');
}

function authExtension() {
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

  const mcpPath = assets.path('mcpConfig');
  updateMcpConfig(mcpPath, 'playwright', 'extension');
  enableWebTestEnv('playwright');

  console.log('');
  log('ok', '配置完成！');
  log('info', 'MCP 使用 extension 模式（连接真实浏览器）');
  log('info', '确保 Chrome/Edge 已运行且 Playwright MCP Bridge 扩展已启用');
}

function getChromeCommand() {
  if (process.platform === 'win32') {
    const prefixes = [
      process.env['PROGRAMFILES(X86)'],
      process.env.PROGRAMFILES,
      process.env.LOCALAPPDATA,
    ].filter(Boolean);
    for (const prefix of prefixes) {
      const p = path.join(prefix, 'Google', 'Chrome', 'Application', 'chrome.exe');
      if (fs.existsSync(p)) return `"${p}"`;
    }
    return 'start chrome';
  }
  if (process.platform === 'darwin') return 'open -a "Google Chrome" --args';
  return 'google-chrome';
}

function checkCdpConnection(port = 9222, timeoutMs = 5000) {
  return new Promise(resolve => {
    const req = http.get(`http://127.0.0.1:${port}/json/version`, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const info = JSON.parse(data);
          resolve({ ok: true, browser: info.Browser || 'Chrome', wsUrl: info.webSocketDebuggerUrl || '' });
        } catch {
          resolve({ ok: false });
        }
      });
    });
    req.on('error', () => resolve({ ok: false }));
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve({ ok: false }); });
  });
}

async function authChromeDevTools(url) {
  const mcpPath = assets.path('mcpConfig');
  updateMcpConfig(mcpPath, 'chrome-devtools');
  enableWebTestEnv('chrome-devtools');

  log('ok', '.mcp.json 已配置完成');
  console.log('');

  log('info', '正在检测 Chrome DevTools 连接...');
  let conn = await checkCdpConnection();

  if (!conn.ok && url) {
    log('info', '未检测到 Chrome 远程调试实例，尝试启动 Chrome...');
    const chromeCmd = getChromeCommand();
    const launchCmd = `${chromeCmd} --remote-debugging-port=9222 "${url}"`;
    try {
      const { spawn } = require('child_process');
      const child = spawn(launchCmd, { shell: true, detached: true, stdio: 'ignore' });
      child.unref();
    } catch (err) {
      log('warn', `Chrome 启动失败: ${err.message}`);
    }

    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 2000));
      conn = await checkCdpConnection();
      if (conn.ok) break;
    }
  }

  console.log('');
  if (conn.ok) {
    log('ok', `Chrome DevTools 连接成功: ${conn.browser}`);
    if (conn.wsUrl) log('info', `WebSocket: ${conn.wsUrl}`);
    log('ok', '配置验证通过！MCP 可以正常连接 Chrome。');
  } else {
    log('warn', '未检测到 Chrome 远程调试实例');
    console.log('');
    console.log('  请确保:');
    console.log('  1. Chrome 144+ 已安装');
    console.log('  2. 打开 chrome://inspect/#remote-debugging 启用远程调试');
    console.log('  3. 允许传入调试连接');
    console.log('');
    console.log('  或手动启动带远程调试的 Chrome:');
    const chromeCmd = getChromeCommand();
    console.log(`    ${chromeCmd} --remote-debugging-port=9222`);
    console.log('');
    log('info', '.mcp.json 已配置，Chrome 就绪后 MCP 会自动连接 (autoConnect)');
  }
}

async function auth(url) {
  assets.ensureDirs();
  const config = loadConfig();
  const tool = config.webTestTool;

  if (!tool) {
    log('error', '未配置浏览器测试工具');
    log('info', '请先运行 claude-coder setup 选择 Playwright MCP 或 Chrome DevTools MCP');
    return;
  }

  if (tool === 'chrome-devtools') {
    const [major, minor] = process.versions.node.split('.').map(Number);
    if (major < 20 || (major === 20 && minor < 19)) {
      log('warn', `当前 Node.js 版本 v${process.versions.node}，Chrome DevTools MCP 要求 v20.19+`);
      log('info', 'nvm 用户请执行: nvm alias default 22 && nvm use 22');
      log('info', '升级后重新运行此命令');
      return;
    }
    const targetUrl = normalizeUrl(url) || null;
    log('info', '浏览器工具: Chrome DevTools MCP');
    if (targetUrl) log('info', `目标 URL: ${targetUrl}`);
    console.log('');
    await authChromeDevTools(targetUrl);
    return;
  }

  // Playwright MCP
  const mode = config.webTestMode;
  const targetUrl = normalizeUrl(url) || 'http://localhost:3000';

  log('info', `浏览器工具: Playwright MCP (${mode} 模式)`);
  log('info', `目标 URL: ${targetUrl}`);
  console.log('');

  switch (mode) {
    case 'persistent':
      await authPersistent(targetUrl);
      break;
    case 'isolated':
      await authIsolated(targetUrl);
      break;
    case 'extension':
      authExtension();
      break;
    default:
      log('error', `未知的 Playwright 模式: ${mode}`);
      log('info', '请运行 claude-coder setup 重新配置');
      return;
  }
}

module.exports = { auth, updateMcpConfig };
