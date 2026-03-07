'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { ensureLoopDir, paths, log, COLOR, getProjectRoot, parseEnvFile, updateEnvVar } = require('./config');

function createInterface() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function ask(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function askChoice(rl, prompt, min, max, defaultVal) {
  while (true) {
    const raw = await ask(rl, prompt);
    const val = raw.trim() || String(defaultVal || '');
    const num = parseInt(val, 10);
    if (num >= min && num <= max) return num;
    console.log(`请输入 ${min}-${max}`);
  }
}

async function askApiKey(rl, platform, apiUrl, existingKey) {
  if (existingKey) {
    console.log('保留当前 API Key 请直接回车，或输入新 Key:');
  } else {
    console.log(`请输入 ${platform} 的 API Key:`);
  }
  if (apiUrl) {
    console.log(`  ${COLOR.blue}获取入口: ${apiUrl}${COLOR.reset}`);
    console.log('');
  }
  const key = await ask(rl, '  API Key: ');
  if (!key.trim()) {
    if (existingKey) return existingKey;
    console.error('API Key 不能为空');
    process.exit(1);
  }
  return key.trim();
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
  const gitignore = path.join(getProjectRoot(), '.gitignore');
  const patterns = ['.claude-coder/.env', '.claude-coder/.runtime/'];
  let content = '';
  if (fs.existsSync(gitignore)) {
    content = fs.readFileSync(gitignore, 'utf8');
  }
  const toAdd = patterns.filter(p => !content.includes(p));
  if (toAdd.length > 0) {
    const block = '\n# Claude Coder（含 API Key 和临时文件）\n' + toAdd.join('\n') + '\n';
    fs.appendFileSync(gitignore, block, 'utf8');
    log('info', '已将 .claude-coder/.env 添加到 .gitignore');
  }
}

// === 提供商配置模块 ===

async function configureClaude(rl) {
  return {
    lines: [
      '# Claude Coder 模型配置',
      '# 提供商: Claude 官方',
      '',
      'MODEL_PROVIDER=claude',
      'API_TIMEOUT_MS=3000000',
      'MCP_TOOL_TIMEOUT=30000',
    ],
    summary: 'Claude 官方模型',
  };
}

async function configureGLM(rl, existing) {
  console.log('请选择 GLM 平台:');
  console.log('');
  console.log('  1) 智谱开放平台 (open.bigmodel.cn) - 国内直连');
  console.log('  2) Z.AI (api.z.ai) - 海外节点');
  console.log('');
  const platChoice = await askChoice(rl, '选择 [1-2，默认 1]: ', 1, 2, 1);
  const isBigmodel = platChoice === 1;
  const glmProvider = isBigmodel ? 'glm-bigmodel' : 'glm-zai';
  const glmBaseUrl = isBigmodel
    ? 'https://open.bigmodel.cn/api/anthropic'
    : 'https://api.z.ai/api/anthropic';
  const glmApiUrl = isBigmodel
    ? 'https://open.bigmodel.cn/usercenter/proj-mgmt/apikeys'
    : 'https://z.ai/manage-apikey/apikey-list';

  console.log('');
  console.log('请选择 GLM 模型版本:');
  console.log('');
  console.log('  1) GLM 4.7  - 旗舰模型，推理与代码能力强');
  console.log('  2) GLM 5    - 最新模型（2026），能力更强');
  console.log('');
  const modelChoice = await askChoice(rl, '选择 [1-2，默认 1]: ', 1, 2, 1);
  const glmModel = modelChoice === 1 ? 'glm-4.7' : 'glm-5';

  const existingKey = existing.MODEL_PROVIDER === glmProvider ? existing.ANTHROPIC_API_KEY : '';
  const apiKey = await askApiKey(rl, glmProvider, glmApiUrl, existingKey);

  return {
    lines: [
      '# Claude Coder 模型配置',
      `# 提供商: GLM (${glmProvider})`,
      `# 模型: ${glmModel}`,
      '',
      `MODEL_PROVIDER=${glmProvider}`,
      `ANTHROPIC_MODEL=${glmModel}`,
      `ANTHROPIC_BASE_URL=${glmBaseUrl}`,
      `ANTHROPIC_API_KEY=${apiKey}`,
      'API_TIMEOUT_MS=3000000',
      'MCP_TOOL_TIMEOUT=30000',
    ],
    summary: `GLM (${glmProvider}, ${glmModel})`,
  };
}

async function configureAliyun(rl, existing) {
  console.log('请选择阿里云百炼区域:');
  console.log('');
  console.log('  1) 国内版 (coding.dashscope.aliyuncs.com)');
  console.log('  2) 国际版 (coding-intl.dashscope.aliyuncs.com)');
  console.log('');
  const regionChoice = await askChoice(rl, '选择 [1-2，默认 1]: ', 1, 2, 1);
  const aliyunBaseUrl = regionChoice === 1
    ? 'https://coding.dashscope.aliyuncs.com/apps/anthropic'
    : 'https://coding-intl.dashscope.aliyuncs.com/apps/anthropic';

  const existingKey = existing.MODEL_PROVIDER === 'aliyun-coding' ? existing.ANTHROPIC_API_KEY : '';
  const apiKey = await askApiKey(rl, '阿里云百炼', 'https://bailian.console.aliyun.com/?tab=model#/api-key', existingKey);

  return {
    lines: [
      '# Claude Coder 模型配置',
      '# 提供商: 阿里云 Coding Plan (百炼)',
      '# Opus: glm-5 | Sonnet/Haiku: qwen3-coder-plus | Fallback: qwen3.5-plus',
      '',
      'MODEL_PROVIDER=aliyun-coding',
      `ANTHROPIC_BASE_URL=${aliyunBaseUrl}`,
      `ANTHROPIC_API_KEY=${apiKey}`,
      '',
      'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1',
      '# Planner (规划/推理) → glm-5',
      'ANTHROPIC_DEFAULT_OPUS_MODEL=glm-5',
      '# Executor (写代码/编辑/工具调用) → qwen3-coder-plus',
      'ANTHROPIC_DEFAULT_SONNET_MODEL=qwen3-coder-plus',
      'ANTHROPIC_DEFAULT_HAIKU_MODEL=qwen3-coder-plus',
      'ANTHROPIC_SMALL_FAST_MODEL=qwen3-coder-plus',
      '# Fallback (通用) → qwen3.5-plus',
      'ANTHROPIC_MODEL=qwen3.5-plus',
      'API_TIMEOUT_MS=3000000',
      'MCP_TOOL_TIMEOUT=30000',
    ],
    summary: '阿里云 Coding Plan (百炼)',
  };
}

async function configureDeepSeek(rl, existing) {
  const existingKey = existing.MODEL_PROVIDER === 'deepseek' ? existing.ANTHROPIC_API_KEY : '';
  const apiKey = await askApiKey(rl, 'DeepSeek', 'https://platform.deepseek.com/api_keys', existingKey);

  console.log('');
  console.log('请选择 DeepSeek 模型:');
  console.log('');
  console.log('  1) deepseek-chat     - 通用对话 (V3)，速度快成本低 [推荐日常使用]');
  console.log('  2) deepseek-reasoner - 纯推理模式 (R1)，全链路使用 R1，成本最高 [适合攻坚]');
  console.log('  3) deepseek-hybrid   - 混合模式 (R1 + V3)，规划用 R1，执行用 V3 [性价比之选]');
  console.log('');
  const dsChoice = await askChoice(rl, '选择 [1-3，默认 1]: ', 1, 3, 1);
  const dsModel = ['deepseek-chat', 'deepseek-reasoner', 'deepseek-hybrid'][dsChoice - 1];

  const lines = [
    '# Claude Coder 模型配置',
    `# 提供商: DeepSeek`,
    `# 模型: ${dsModel} | API_TIMEOUT_MS=600000 防止长输出超时（10分钟）`,
    '',
    'MODEL_PROVIDER=deepseek',
    'ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic',
    `ANTHROPIC_API_KEY=${apiKey}`,
    `ANTHROPIC_AUTH_TOKEN=${apiKey}`,
    '',
    'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1',
  ];

  if (dsModel === 'deepseek-chat') {
    lines.push(
      '# [DeepSeek Chat 降本策略]',
      'ANTHROPIC_MODEL=deepseek-chat',
      'ANTHROPIC_SMALL_FAST_MODEL=deepseek-chat',
      'ANTHROPIC_DEFAULT_OPUS_MODEL=deepseek-chat',
      'ANTHROPIC_DEFAULT_SONNET_MODEL=deepseek-chat',
      'ANTHROPIC_DEFAULT_HAIKU_MODEL=deepseek-chat'
    );
  } else if (dsModel === 'deepseek-reasoner') {
    lines.push(
      '# [DeepSeek Pure Reasoner 模式]',
      'ANTHROPIC_MODEL=deepseek-reasoner',
      'ANTHROPIC_SMALL_FAST_MODEL=deepseek-reasoner',
      'ANTHROPIC_DEFAULT_OPUS_MODEL=deepseek-reasoner',
      'ANTHROPIC_DEFAULT_SONNET_MODEL=deepseek-reasoner',
      'ANTHROPIC_DEFAULT_HAIKU_MODEL=deepseek-reasoner'
    );
  } else {
    lines.push(
      '# [DeepSeek Hybrid 混合模式]',
      'ANTHROPIC_MODEL=deepseek-reasoner',
      'ANTHROPIC_DEFAULT_OPUS_MODEL=deepseek-reasoner',
      'ANTHROPIC_SMALL_FAST_MODEL=deepseek-chat',
      'ANTHROPIC_DEFAULT_SONNET_MODEL=deepseek-chat',
      'ANTHROPIC_DEFAULT_HAIKU_MODEL=deepseek-chat'
    );
  }

  lines.push('API_TIMEOUT_MS=600000', 'MCP_TOOL_TIMEOUT=30000');

  return { lines, summary: `DeepSeek (${dsModel})` };
}

async function configureCustom(rl, existing) {
  const defaultUrl = existing.MODEL_PROVIDER === 'custom' ? existing.ANTHROPIC_BASE_URL || '' : '';
  console.log(`请输入 Anthropic 兼容的 BASE_URL${defaultUrl ? `（回车保留: ${defaultUrl}）` : ''}:`);
  let baseUrl = await ask(rl, '  URL: ');
  baseUrl = baseUrl.trim() || defaultUrl;
  console.log('');

  const existingKey = existing.MODEL_PROVIDER === 'custom' ? existing.ANTHROPIC_API_KEY : '';
  const apiKey = await askApiKey(rl, '自定义平台', '', existingKey);

  return {
    lines: [
      '# Claude Coder 模型配置',
      '# 提供商: 自定义',
      '',
      'MODEL_PROVIDER=custom',
      `ANTHROPIC_BASE_URL=${baseUrl}`,
      `ANTHROPIC_API_KEY=${apiKey}`,
      'API_TIMEOUT_MS=3000000',
      'MCP_TOOL_TIMEOUT=30000',
    ],
    summary: `自定义 (${baseUrl})`,
  };
}

// === MCP 配置模块 ===

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

// === 显示当前配置 ===

function showCurrentConfig(existing) {
  console.log('');
  console.log(`${COLOR.blue}当前配置:${COLOR.reset}`);
  console.log(`  提供商:     ${existing.MODEL_PROVIDER || '未配置'}`);
  console.log(`  BASE_URL:   ${existing.ANTHROPIC_BASE_URL || '默认'}`);
  console.log(`  模型:       ${existing.ANTHROPIC_MODEL || '默认'}`);
  console.log(`  MCP:        ${existing.MCP_PLAYWRIGHT === 'true' ? `已启用 (${existing.MCP_PLAYWRIGHT_MODE || 'persistent'})` : '未启用'}`);
  console.log(`  超时中断:   ${existing.SESSION_STALL_TIMEOUT || '1800'} 秒`);
  console.log('');
}

// === 提供商选择 ===

const PROVIDER_MENU = `
请选择模型提供商:

  1) Claude 官方
  2) GLM Coding Plan (智谱/Z.AI)      ${COLOR.blue}https://open.bigmodel.cn${COLOR.reset}
  3) 阿里云 Coding Plan (百炼)         ${COLOR.blue}https://bailian.console.aliyun.com${COLOR.reset}
  4) DeepSeek                          ${COLOR.blue}https://platform.deepseek.com${COLOR.reset}
  5) 自定义 (Anthropic 兼容)
`;

const PROVIDER_CONFIG = [configureClaude, configureGLM, configureAliyun, configureDeepSeek, configureCustom];

async function selectProvider(rl, existing, showHeader = true) {
  if (showHeader) console.log(PROVIDER_MENU);
  const choice = await askChoice(rl, '选择 [1-5]: ', 1, 5);
  console.log('');
  return PROVIDER_CONFIG[choice - 1](rl, existing);
}

// === MCP 配置追加 ===

function appendMcpConfig(lines, mcpConfig) {
  lines.push('', '# MCP 工具配置');
  if (mcpConfig.enabled) {
    lines.push('MCP_PLAYWRIGHT=true');
    if (mcpConfig.mode) lines.push(`MCP_PLAYWRIGHT_MODE=${mcpConfig.mode}`);
  } else {
    lines.push('MCP_PLAYWRIGHT=false');
  }
}

// === 更新单项配置 ===

async function updateApiKeyOnly(rl, existing) {
  const provider = existing.MODEL_PROVIDER;
  if (!provider || provider === 'claude') {
    log('warn', 'Claude 官方无需配置 API Key（使用系统登录态）');
    return;
  }

  const apiUrlMap = {
    'glm-bigmodel': 'https://open.bigmodel.cn/usercenter/proj-mgmt/apikeys',
    'glm-zai': 'https://z.ai/manage-apikey/apikey-list',
    'aliyun-coding': 'https://bailian.console.aliyun.com/?tab=model#/api-key',
    'deepseek': 'https://platform.deepseek.com/api_keys',
  };

  const apiKey = await askApiKey(rl, provider, apiUrlMap[provider] || '', existing.ANTHROPIC_API_KEY);
  updateEnvVar('ANTHROPIC_API_KEY', apiKey);
  if (provider === 'deepseek') {
    updateEnvVar('ANTHROPIC_AUTH_TOKEN', apiKey);
  }
  log('ok', 'API Key 已更新');
}

async function updateMCPOnly(rl) {
  const mcpConfig = await configureMCP(rl);
  updateEnvVar('MCP_PLAYWRIGHT', mcpConfig.enabled ? 'true' : 'false');
  if (mcpConfig.enabled && mcpConfig.mode) {
    updateEnvVar('MCP_PLAYWRIGHT_MODE', mcpConfig.mode);
    const { updateMcpConfig } = require('./auth');
    updateMcpConfig(paths(), mcpConfig.mode);
  }
  log('ok', 'MCP 配置已更新');
}

async function updateStallTimeout(rl, existing) {
  const current = existing.SESSION_STALL_TIMEOUT || '1800';
  console.log(`当前超时设置: ${current} 秒 (${Math.floor(parseInt(current) / 60)} 分钟)`);
  console.log('');
  console.log('无工具调用超过此时间将自动中断 session');
  console.log('');

  const input = await ask(rl, '输入新的超时秒数（回车保留当前）: ');
  const val = input.trim();

  if (!val) {
    log('info', '保留当前设置');
    return;
  }

  const seconds = parseInt(val, 10);
  if (isNaN(seconds) || seconds < 60) {
    log('warn', '请输入 >= 60 的数字');
    return;
  }

  updateEnvVar('SESSION_STALL_TIMEOUT', String(seconds));
  log('ok', `超时已设置为 ${seconds} 秒 (${Math.floor(seconds / 60)} 分钟)`);
}

// === 主函数 ===

async function setup() {
  const p = paths();
  ensureLoopDir();
  const rl = createInterface();

  // 加载现有配置
  let existing = {};
  if (fs.existsSync(p.envFile)) {
    existing = parseEnvFile(p.envFile);
  }

  console.log('');
  console.log('============================================');
  console.log('  Claude Coder 配置');
  console.log('============================================');

  // 首次配置：引导完整流程
  if (!fs.existsSync(p.envFile) || !existing.MODEL_PROVIDER) {
    console.log('');
    console.log('  检测到未配置，开始初始化...');
    console.log('');

    const configResult = await selectProvider(rl, existing);
    const mcpConfig = await configureMCP(rl);

    appendMcpConfig(configResult.lines, mcpConfig);
    writeConfig(p.envFile, configResult.lines);
    ensureGitignore();

    // 如果启用了 MCP，生成 .mcp.json
    if (mcpConfig.enabled && mcpConfig.mode) {
      const { updateMcpConfig } = require('./auth');
      updateMcpConfig(p, mcpConfig.mode);
    }

    console.log('');
    log('ok', `配置完成！提供商: ${configResult.summary}`);
    console.log('');
    console.log(`  配置文件: ${p.envFile}`);
    console.log('  使用方式: claude-coder run "你的需求"');
    console.log('  重新配置: claude-coder setup');
    console.log('');

    rl.close();
    return;
  }

  // 已有配置：循环菜单
  while (true) {
    existing = parseEnvFile(p.envFile);
    showCurrentConfig(existing);

    console.log('请选择要执行的操作:');
    console.log('');
    console.log('  1) 切换模型提供商');
    console.log('  2) 更新 API Key');
    console.log('  3) 配置 MCP');
    console.log('  4) 配置超时中断');
    console.log('  5) 完全重新配置');
    console.log('  6) 退出');
    console.log('');

    const action = await askChoice(rl, '选择 [1-6]: ', 1, 6);
    console.log('');

    if (action === 6) {
      log('info', '退出配置');
      break;
    }

    switch (action) {
      case 1: {
        const configResult = await selectProvider(rl, existing);
        appendMcpConfig(configResult.lines, {
          enabled: existing.MCP_PLAYWRIGHT === 'true',
          mode: existing.MCP_PLAYWRIGHT_MODE || null,
        });
        writeConfig(p.envFile, configResult.lines);
        log('ok', `已切换到: ${configResult.summary}`);
        break;
      }
      case 2: {
        await updateApiKeyOnly(rl, existing);
        break;
      }
      case 3: {
        await updateMCPOnly(rl);
        break;
      }
      case 4: {
        await updateStallTimeout(rl, existing);
        break;
      }
      case 5: {
        const configResult = await selectProvider(rl, existing);
        const mcpConfig = await configureMCP(rl);
        appendMcpConfig(configResult.lines, mcpConfig);
        writeConfig(p.envFile, configResult.lines);

        if (mcpConfig.enabled && mcpConfig.mode) {
          const { updateMcpConfig } = require('./auth');
          updateMcpConfig(p, mcpConfig.mode);
        }

        log('ok', '配置已更新');
        break;
      }
    }
  }

  rl.close();
}

module.exports = { setup };
