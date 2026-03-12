#!/usr/bin/env node
'use strict';

/**
 * 手动测试：交互式 plan 模式
 *
 * 用法：
 *   node test/manual-interactive-plan.js
 *
 * 这个脚本使用模糊的需求描述来触发模型调用 AskUserQuestion，
 * 然后通过 interaction.js 的 Hook 拦截并在终端展示问题。
 */

const { runPlanSession } = require('../src/core/plan');
const { log } = require('../src/common/config');
const { assets } = require('../src/common/assets');

async function main() {
  assets.ensureDirs();

  const userInput = process.argv[2] || '优化这个项目的整体架构';

  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  Interactive Plan Mode Test                  ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  需求: ${userInput.slice(0, 36).padEnd(36)} ║`);
  console.log('║  模式: interactive (AskUserQuestion 已启用) ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
  console.log('当模型需要你的输入时，终端会展示问题。');
  console.log('请输入数字选择选项，或直接输入自定义内容。');
  console.log('');

  const result = await runPlanSession(userInput, {
    projectRoot: process.cwd(),
    interactive: true,
    planOnly: true,
  });

  console.log('\n========== RESULT ==========');
  console.log('success:', result.success);
  if (result.targetPath || result.planPath) {
    console.log('planPath:', result.targetPath || result.planPath);
  }
  if (result.reason) {
    console.log('reason:', result.reason);
  }
  if (result.error) {
    console.log('error:', result.error);
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
