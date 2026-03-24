'use strict';

const { log, COLOR } = require('../../common/display');
const { updateEnvVar } = require('../../common/config');
const { ask, askChoice, askApiKey } = require('./helpers');

// ── 提供商菜单 ──

const PROVIDER_MENU = `
请选择模型提供商:

  1) 默认        Claude 官方模型，使用系统登录态
  2) Coding Plan 自建 API，使用推荐的多模型路由配置
  3) API         DeepSeek 或其他 Anthropic 兼容 API
`;

// ── 提供商配置函数 ──

async function configureDefault() {
  return {
    lines: [
      '# Claude Coder 模型配置',
      '# 提供商: Claude 官方',
      '',
      'MODEL_PROVIDER=claude',
      'API_TIMEOUT_MS=3000000',
    ],
    summary: 'Claude 官方模型',
  };
}

async function configureCodingPlan(rl, existing) {
  // 1. 选择或输入 BASE_URL
  console.log('请选择或输入 BASE_URL:');
  console.log('');
  console.log('  1) 智谱 GLM        https://open.bigmodel.cn/api/anthropic');
  console.log('  2) Z.AI           https://api.z.ai/api/anthropic');
  console.log('  3) 阿里云百炼      https://coding.dashscope.aliyuncs.com/apps/anthropic');
  console.log('  4) 其他（手动输入）');
  console.log('');

  const urlChoice = await askChoice(rl, '选择 [1-4，默认 1]: ', 1, 4, 1);
  let finalUrl = '';

  if (urlChoice === 4) {
    const defaultUrl = existing.ANTHROPIC_BASE_URL || '';
    console.log('');
    let baseUrl = await ask(rl, `  BASE_URL${defaultUrl ? ` (回车保留: ${defaultUrl})` : ''}: `);
    finalUrl = baseUrl.trim() || defaultUrl;
  } else {
    const urlMap = {
      1: 'https://open.bigmodel.cn/api/anthropic',
      2: 'https://api.z.ai/api/anthropic',
      3: 'https://coding.dashscope.aliyuncs.com/apps/anthropic',
    };
    finalUrl = urlMap[urlChoice];
  }

  if (!finalUrl) {
    console.error('BASE_URL 不能为空');
    process.exit(1);
  }

  // 2. 输入 API_KEY（提示获取地址）
  const apiUrlMap = {
    'open.bigmodel.cn': 'https://open.bigmodel.cn/usercenter/proj-mgmt/apikeys',
    'api.z.ai': 'https://z.ai/manage-apikey/apikey-list',
    'dashscope.aliyuncs.com': 'https://bailian.console.aliyun.com/?tab=model#/api-key',
  };

  let apiUrlHint = '';
  for (const [host, url] of Object.entries(apiUrlMap)) {
    if (finalUrl.includes(host)) {
      apiUrlHint = url;
      break;
    }
  }

  console.log('');
  if (apiUrlHint) {
    console.log(`  ${COLOR.blue}API Key 获取地址: ${apiUrlHint}${COLOR.reset}`);
  }
  const apiKey = await askApiKey(rl, 'Coding Plan', '', existing.ANTHROPIC_API_KEY);

  // 3. 返回配置（使用「长时间自运行Agent」推荐配置）
  return {
    lines: [
      '# Claude Coder 模型配置',
      '# 提供商: Coding Plan',
      '',
      'MODEL_PROVIDER=coding-plan',
      `ANTHROPIC_BASE_URL=${finalUrl}`,
      `ANTHROPIC_API_KEY=${apiKey}`,
      '',
      'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1',
      '',
      '# 模型路由配置（可在 .claude-coder/.env 修改）',
      'ANTHROPIC_DEFAULT_OPUS_MODEL=glm-5',
      'ANTHROPIC_DEFAULT_SONNET_MODEL=qwen3-coder-next',
      'ANTHROPIC_DEFAULT_HAIKU_MODEL=qwen3-coder-plus',
      'ANTHROPIC_MODEL=kimi-k2.5',
      '',
      'API_TIMEOUT_MS=3000000',
    ],
    summary: `Coding Plan (${finalUrl})`,
  };
}

async function configureAPI(rl, existing) {
  console.log('请选择 API 模式:');
  console.log('');
  console.log('  1) DeepSeek Chat (V3) - 速度快成本低 [推荐]');
  console.log('  2) DeepSeek Reasoner (R1) - 全链路推理');
  console.log('  3) DeepSeek Hybrid (R1+V3) - 规划用R1，执行用V3');
  console.log('  4) 自定义 - 输入其他 API');
  console.log('');
  const choice = await askChoice(rl, '选择 [1-4，默认 1]: ', 1, 4, 1);

  if (choice === 4) {
    return await configureCustomAPI(rl, existing);
  }

  return await configureDeepSeekMode(rl, existing, choice);
}

async function configureDeepSeekMode(rl, existing, choice) {
  const existingKey = existing.MODEL_PROVIDER === 'deepseek' ? existing.ANTHROPIC_API_KEY : '';
  const apiKey = await askApiKey(rl, 'DeepSeek', 'https://platform.deepseek.com/api_keys', existingKey);

  const dsModel = ['deepseek-chat', 'deepseek-reasoner', 'deepseek-hybrid'][choice - 1];

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
      'ANTHROPIC_DEFAULT_OPUS_MODEL=deepseek-chat',
      'ANTHROPIC_DEFAULT_SONNET_MODEL=deepseek-chat',
      'ANTHROPIC_DEFAULT_HAIKU_MODEL=deepseek-chat'
    );
  } else if (dsModel === 'deepseek-reasoner') {
    lines.push(
      '# [DeepSeek Pure Reasoner 模式]',
      'ANTHROPIC_MODEL=deepseek-reasoner',
      'ANTHROPIC_DEFAULT_OPUS_MODEL=deepseek-reasoner',
      'ANTHROPIC_DEFAULT_SONNET_MODEL=deepseek-reasoner',
      'ANTHROPIC_DEFAULT_HAIKU_MODEL=deepseek-reasoner'
    );
  } else {
    lines.push(
      '# [DeepSeek Hybrid 混合模式]',
      'ANTHROPIC_MODEL=deepseek-reasoner',
      'ANTHROPIC_DEFAULT_OPUS_MODEL=deepseek-reasoner',
      'ANTHROPIC_DEFAULT_SONNET_MODEL=deepseek-chat',
      'ANTHROPIC_DEFAULT_HAIKU_MODEL=deepseek-chat'
    );
  }

  lines.push('API_TIMEOUT_MS=600000');

  return { lines, summary: `DeepSeek (${dsModel})` };
}

async function configureCustomAPI(rl, existing) {
  const defaultUrl = existing.MODEL_PROVIDER === 'custom' ? existing.ANTHROPIC_BASE_URL || '' : '';
  console.log('请输入 Anthropic 兼容的 BASE_URL:');
  let baseUrl = await ask(rl, `  URL${defaultUrl ? ` (回车保留: ${defaultUrl})` : ''}: `);
  baseUrl = baseUrl.trim() || defaultUrl;

  if (!baseUrl) {
    console.error('BASE_URL 不能为空');
    process.exit(1);
  }

  const existingKey = existing.MODEL_PROVIDER === 'custom' ? existing.ANTHROPIC_API_KEY : '';
  const apiKey = await askApiKey(rl, '自定义 API', '', existingKey);

  console.log('');
  const modelInput = await ask(rl, '默认模型名称（回车跳过）: ');
  const model = modelInput.trim();

  const lines = [
    '# Claude Coder 模型配置',
    '# 提供商: 自定义 API',
    '',
    'MODEL_PROVIDER=custom',
    `ANTHROPIC_BASE_URL=${baseUrl}`,
    `ANTHROPIC_API_KEY=${apiKey}`,
    '',
    'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1',
  ];

  if (model) {
    lines.push(`ANTHROPIC_MODEL=${model}`);
  }

  lines.push('API_TIMEOUT_MS=3000000');

  return { lines, summary: `自定义 API (${baseUrl})` };
}

// ── 提供商选择 ──

const PROVIDER_CONFIG = [configureDefault, configureCodingPlan, configureAPI];

async function selectProvider(rl, existing, showHeader = true) {
  if (showHeader) console.log(PROVIDER_MENU);
  const choice = await askChoice(rl, '选择 [1-3]: ', 1, 3);
  console.log('');
  return PROVIDER_CONFIG[choice - 1](rl, existing);
}

// ── 更新 API Key ──

async function updateApiKeyOnly(rl, existing) {
  const provider = existing.MODEL_PROVIDER;
  if (!provider || provider === 'claude') {
    log('warn', 'Claude 官方无需配置 API Key（使用系统登录态）');
    return;
  }

  const apiUrlMap = {
    'coding-plan': '',
    'deepseek': 'https://platform.deepseek.com/api_keys',
    'custom': '',
  };

  const apiKey = await askApiKey(rl, provider, apiUrlMap[provider] || '', existing.ANTHROPIC_API_KEY);
  if (apiKey === null) {
    log('info', '已取消，返回菜单');
    return;
  }
  updateEnvVar('ANTHROPIC_API_KEY', apiKey);
  if (provider === 'deepseek') {
    updateEnvVar('ANTHROPIC_AUTH_TOKEN', apiKey);
  }
  log('ok', 'API Key 已更新');
}

module.exports = {
  PROVIDER_MENU,
  PROVIDER_CONFIG,
  configureDefault,
  configureCodingPlan,
  configureAPI,
  configureDeepSeekMode,
  configureCustomAPI,
  selectProvider,
  updateApiKeyOnly,
};