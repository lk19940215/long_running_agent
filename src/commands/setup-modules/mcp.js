'use strict';

const { log, COLOR } = require('../../common/display');
const { updateEnvVar } = require('../../common/config');
const { assets } = require('../../common/assets');
const { askChoice } = require('./helpers');

// ── MCP 配置 ──

async function configureMCP(rl) {
  console.log('');
  console.log('是否启用浏览器测试工具？');
  console.log('');
  console.log('  1) Playwright MCP — 微软官方，25+ 浏览器自动化工具，支持多实例并行');
  console.log('  2) Chrome DevTools MCP — Google 官方，连接已打开的 Chrome，调试能力更强');
  console.log('     （单实例限制，多开请配置 Playwright MCP）');
  console.log('  3) 跳过（纯后端 / CLI 项目）');
  console.log('');

  const toolChoice = await askChoice(rl, '选择 [1-3]: ', 1, 3);

  const mcpConfig = { tool: '', mode: '' };

  if (toolChoice === 1) {
    mcpConfig.tool = 'playwright';
    console.log('');
    console.log('请选择 Playwright MCP 浏览器模式:');
    console.log('');
    console.log('  1) persistent - 懒人模式（默认，推荐）');
    console.log('     登录一次永久生效，适合 Google SSO、企业内网等日常开发');
    console.log('');
    console.log('  2) isolated - 开发模式');
    console.log('     每次会话从快照加载，适合验证登录流程的自动化测试');
    console.log('');
    console.log('  3) extension - 连接真实浏览器（实验性）');
    console.log('     通过 Chrome 扩展复用已有登录态和插件');
    console.log('');

    const modeChoice = await askChoice(rl, '选择 [1-3，默认 1]: ', 1, 3, 1);
    const modeMap = { 1: 'persistent', 2: 'isolated', 3: 'extension' };
    mcpConfig.mode = modeMap[modeChoice];

    console.log('');
    if (mcpConfig.mode === 'extension') {
      console.log(`  ${COLOR.yellow}⚠ 前置条件：安装 Playwright MCP Bridge 浏览器扩展${COLOR.reset}`);
      console.log(`  ${COLOR.blue}  https://chromewebstore.google.com/detail/playwright-mcp-bridge/mmlmfjhmonkocbjadbfplnigmagldckm${COLOR.reset}`);
      console.log('');
      console.log('  安装扩展后，运行 claude-coder auth 生成 .mcp.json 配置');
    } else if (mcpConfig.mode === 'persistent') {
      console.log('  使用 claude-coder auth <URL> 打开浏览器完成首次登录');
      console.log('  登录状态将持久保存，后续 MCP 会话自动复用');
      console.log('');
      console.log('  请确保已安装 Playwright:');
      console.log(`  ${COLOR.blue}npx playwright install chromium${COLOR.reset}`);
    } else {
      console.log('  使用 claude-coder auth <URL> 录制登录状态到 playwright-auth.json');
      console.log('  MCP 每次会话从此文件加载初始 cookies/localStorage');
    }
  } else if (toolChoice === 2) {
    mcpConfig.tool = 'chrome-devtools';

    const [major, minor] = process.versions.node.split('.').map(Number);
    if (major < 20 || (major === 20 && minor < 19)) {
      console.log('');
      console.log(`  ${COLOR.yellow}⚠ 当前 Node.js v${process.versions.node}，Chrome DevTools MCP 要求 v20.19+${COLOR.reset}`);
      console.log(`  ${COLOR.blue}  nvm 用户: nvm alias default 22 && nvm use 22${COLOR.reset}`);
    }

    console.log('');
    console.log('  Chrome DevTools MCP 将连接已打开的 Chrome 浏览器。');
    console.log('');
    console.log('  前置条件:');
    console.log('  1. Node.js v20.19+（npx 自动下载 chrome-devtools-mcp 包）');
    console.log('  2. Chrome 144+');
    console.log('  3. 打开 chrome://inspect/#remote-debugging 启用远程调试');
    console.log('');
    console.log('  运行 claude-coder auth 自动配置 .mcp.json');
  }

  return mcpConfig;
}

// ── MCP 配置追加到 lines ──

function appendMcpConfig(lines, mcpConfig) {
  lines.push('', '# 浏览器测试工具配置');
  if (mcpConfig.tool) {
    lines.push(`WEB_TEST_TOOL=${mcpConfig.tool}`);
    if (mcpConfig.mode) lines.push(`WEB_TEST_MODE=${mcpConfig.mode}`);
  } else {
    lines.push('WEB_TEST_TOOL=');
  }
}

// ── 仅更新 MCP 配置 ──

async function updateMCPOnly(rl) {
  const mcpConfig = await configureMCP(rl);
  updateEnvVar('WEB_TEST_TOOL', mcpConfig.tool);
  if (mcpConfig.tool === 'playwright' && mcpConfig.mode) {
    updateEnvVar('WEB_TEST_MODE', mcpConfig.mode);
    const { updateMcpConfig } = require('../auth');
    updateMcpConfig(assets.path('mcpConfig'), 'playwright', mcpConfig.mode);
  } else if (mcpConfig.tool === 'chrome-devtools') {
    updateEnvVar('WEB_TEST_MODE', '');
    const { updateMcpConfig } = require('../auth');
    updateMcpConfig(assets.path('mcpConfig'), 'chrome-devtools');
  }
  log('ok', 'MCP 配置已更新');
}

module.exports = {
  configureMCP,
  appendMcpConfig,
  updateMCPOnly,
};
