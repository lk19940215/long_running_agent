'use strict';

const { ask, askChoice } = require('./helpers');
const { log, COLOR, updateEnvVar } = require('../../common/config');
const { assets } = require('../../common/assets');

// ── MCP 配置 ──

async function configureMCP(rl) {
  console.log('');
  console.log('是否启用 Playwright MCP（浏览器自动化测试）？');
  console.log('');
  console.log('  Playwright MCP 由微软官方维护 (github.com/microsoft/playwright-mcp)');
  console.log('  提供 browser_click、browser_snapshot 等 25+ 浏览器自动化工具');
  console.log('  适用于有 Web 前端的项目，Agent 可用它做端到端测试');
  console.log('');
  console.log('  1) 是 - 启用 Playwright MCP（项目有 Web 前端）');
  console.log('  2) 否 - 跳过（纯后端 / CLI 项目）');
  console.log('');

  const mcpChoice = await askChoice(rl, '选择 [1-2]: ', 1, 2);

  const mcpConfig = { enabled: false, mode: null };

  if (mcpChoice === 1) {
    mcpConfig.enabled = true;
    console.log('');
    console.log('请选择 Playwright MCP 浏览器模式:');
    console.log('');
    console.log('  1) persistent - 懒人模式（默认，推荐）');
    console.log('     登录一次永久生效，适合 Google SSO、企业内网 API 拉取等日常开发');
    console.log('');
    console.log('  2) isolated - 开发模式');
    console.log('     每次会话从快照加载，适合验证登录流程的自动化测试');
    console.log('');
    console.log('  3) extension - 连接真实浏览器（实验性）');
    console.log('     通过 Chrome 扩展复用已有登录态和插件');
    console.log('     需要安装 "Playwright MCP Bridge" 扩展');
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
  }

  return mcpConfig;
}

// ── MCP 配置追加到 lines ──

function appendMcpConfig(lines, mcpConfig) {
  lines.push('', '# MCP 工具配置');
  if (mcpConfig.enabled) {
    lines.push('MCP_PLAYWRIGHT=true');
    if (mcpConfig.mode) lines.push(`MCP_PLAYWRIGHT_MODE=${mcpConfig.mode}`);
  } else {
    lines.push('MCP_PLAYWRIGHT=false');
  }
}

// ── 仅更新 MCP 配置 ──

async function updateMCPOnly(rl) {
  const mcpConfig = await configureMCP(rl);
  updateEnvVar('MCP_PLAYWRIGHT', mcpConfig.enabled ? 'true' : 'false');
  if (mcpConfig.enabled && mcpConfig.mode) {
    updateEnvVar('MCP_PLAYWRIGHT_MODE', mcpConfig.mode);
    const { updateMcpConfig } = require('../auth');
    updateMcpConfig(assets.path('mcpConfig'), mcpConfig.mode);
  }
  log('ok', 'MCP 配置已更新');
}

module.exports = {
  configureMCP,
  appendMcpConfig,
  updateMCPOnly,
};