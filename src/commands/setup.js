'use strict';

const fs = require('fs');
const { log, COLOR } = require('../common/display');
const { parseEnvFile } = require('../common/config');
const { assets } = require('../common/assets');
const {
  createInterface,
  ask,
  askChoice,
  writeConfig,
  ensureGitignore,
  showCurrentConfig,
  selectProvider,
  updateApiKeyOnly,
  configureMCP,
  appendMcpConfig,
  updateMCPOnly,
  updateSafetyLimits,
  updateSimplifyConfig,
} = require('./setup-modules');

const PRESERVED_KEYS = [
  'SESSION_STALL_TIMEOUT',
  'SESSION_MAX_TURNS', 'SIMPLIFY_INTERVAL', 'SIMPLIFY_COMMITS',
];

function preserveSafetyConfig(lines, existing) {
  const preserved = PRESERVED_KEYS
    .filter(k => existing[k])
    .map(k => `${k}=${existing[k]}`);
  if (preserved.length > 0) {
    lines.push('', '# 保留的安全限制和审查配置');
    lines.push(...preserved);
  }
}

async function setup() {
  assets.ensureDirs();
  const rl = createInterface();

  const envPath = assets.path('env');
  let existing = {};
  if (fs.existsSync(envPath)) {
    existing = parseEnvFile(envPath);
  }

  console.log('');
  console.log('============================================');
  console.log('  Claude Coder 配置');
  console.log('============================================');

  if (!fs.existsSync(envPath) || !existing.MODEL_PROVIDER) {
    console.log('');
    console.log('  检测到未配置，开始初始化...');
    console.log('');

    const configResult = await selectProvider(rl, existing);
    const mcpConfig = await configureMCP(rl);

    appendMcpConfig(configResult.lines, mcpConfig);
    writeConfig(envPath, configResult.lines);
    ensureGitignore();

    if (mcpConfig.tool) {
      const { updateMcpConfig } = require('./auth');
      const mcpPath = assets.path('mcpConfig');
      updateMcpConfig(mcpPath, mcpConfig.tool, mcpConfig.mode);
    }

    console.log('');
    log('info', '配置自动代码审查（可选）');
    await updateSimplifyConfig(rl, {});

    console.log('');
    log('ok', `配置完成！提供商: ${configResult.summary}`);
    console.log('');
    console.log(`  配置文件: ${envPath}`);
    console.log('  使用方式: claude-coder run "你的需求"');
    console.log('  重新配置: claude-coder setup');
    console.log('');
    console.log(`  ${COLOR.blue}当前默认值:${COLOR.reset}`);
    console.log(`    停顿超时:     1200 秒 (20 分钟)`);
    console.log(`    完成检测超时: 300 秒 (5 分钟)`);
    console.log(`    自动审查:     每 5 个 session，审查 5 个 commit`);
    console.log('');
    console.log(`  ${COLOR.yellow}调整方式: claude-coder setup → 配置安全限制 / 配置自动审查${COLOR.reset}`);
    console.log('');

    rl.close();
    return;
  }

  while (true) {
    existing = parseEnvFile(envPath);
    showCurrentConfig(existing);

    console.log('请选择要执行的操作:');
    console.log('');
    console.log('  1) 切换模型提供商');
    console.log('  2) 更新 API Key');
    console.log('  3) 配置浏览器测试工具');
    console.log('  4) 配置安全限制');
    console.log('  5) 配置自动审查');
    console.log('  6) 完全重新配置');
    console.log('  7) 退出');
    console.log('');

    const action = await askChoice(rl, '选择 [1-7]: ', 1, 7);
    console.log('');

    if (action === 7) {
      log('info', '退出配置');
      break;
    }

    switch (action) {
      case 1: {
        log('info', '放心切换，旧配置会自动备份，安全限制和审查配置会保留');
        const configResult = await selectProvider(rl, existing);
        preserveSafetyConfig(configResult.lines, existing);
        appendMcpConfig(configResult.lines, {
          tool: existing.WEB_TEST_TOOL || '',
          mode: existing.WEB_TEST_MODE || '',
        });
        writeConfig(envPath, configResult.lines);
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
        await updateSafetyLimits(rl, existing);
        break;
      }
      case 5: {
        await updateSimplifyConfig(rl, existing);
        break;
      }
      case 6: {
        log('info', '放心重新配置，旧配置会自动备份，安全限制和审查配置会保留');
        const configResult = await selectProvider(rl, existing);
        preserveSafetyConfig(configResult.lines, existing);
        const mcpConfig = await configureMCP(rl);
        appendMcpConfig(configResult.lines, mcpConfig);
        writeConfig(envPath, configResult.lines);

        if (mcpConfig.tool) {
          const { updateMcpConfig } = require('./auth');
          const mcpPath = assets.path('mcpConfig');
          updateMcpConfig(mcpPath, mcpConfig.tool, mcpConfig.mode);
        }

        log('ok', '配置已更新');
        break;
      }
    }

    console.log('');
    const cont = await ask(rl, '继续配置其他项？(y/N) ');
    if (!/^[Yy]/.test(cont.trim())) break;
  }

  rl.close();
}

module.exports = { setup };
