#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// ── SDK loader (same as session.js) ──

let _sdkModule = null;
async function loadSDK() {
  if (_sdkModule) return _sdkModule;

  const pkgName = '@anthropic-ai/claude-agent-sdk';
  const attempts = [
    () => import(pkgName),
    () => {
      const { createRequire } = require('module');
      const resolved = createRequire(__filename).resolve(pkgName);
      return import(resolved);
    },
    () => {
      const { createRequire } = require('module');
      const resolved = createRequire(path.join(process.cwd(), 'noop.js')).resolve(pkgName);
      return import(resolved);
    },
    () => {
      const { execSync } = require('child_process');
      const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
      const sdkDir = path.join(globalRoot, pkgName);
      const pkgJson = JSON.parse(fs.readFileSync(path.join(sdkDir, 'package.json'), 'utf8'));
      const entry = pkgJson.exports?.['.'] || pkgJson.main || 'index.js';
      const entryFile = typeof entry === 'object' ? (entry.import || entry.default || entry.node) : entry;
      return import(path.join(sdkDir, entryFile));
    },
  ];

  for (const attempt of attempts) {
    try {
      _sdkModule = await attempt();
      return _sdkModule;
    } catch { /* try next */ }
  }

  console.error(`未找到 ${pkgName}`);
  console.error(`请先安装：npm install -g ${pkgName}`);
  process.exit(1);
}

async function main() {
  const sdk = await loadSDK();

  const planFile = '/Users/longkuo/Desktop/AI/ai-helper/.claude-coder/plan/plan-test.md';

  const prompt = `创建一个 hello world 函数。

【约束】不要提问，直接实现。

【重要】在最后输出中，必须包含实际写入的文件路径，格式如下：
方案文件已写入：\`<实际路径>\`
`;

  console.log('Testing: extract path from output...\n');
  console.log(`Target file: ${planFile}\n`);

  try {
    const session = sdk.query({
      prompt,
      options: {
        permissionMode: 'plan',
        disallowedTools: ['askUserQuestion']
      }
    });

    let result = '';
    let toolUses = [];
    let allText = '';
    let exitPlanModeDetected = false;
    let exitPlanModeTime = null;
    const EXIT_TIMEOUT_MS = 30000; // 检测到 ExitPlanMode 后等待 3 秒

    for await (const msg of session) {
      // 记录消息类型
      console.log(`[${new Date().toISOString().slice(11, 19)}] msg:`, msg.type, msg.subtype || '');

      // 检测 ExitPlanMode 超时
      if (exitPlanModeDetected && exitPlanModeTime) {
        const elapsed = Date.now() - exitPlanModeTime;
        if (elapsed > EXIT_TIMEOUT_MS && msg.type !== 'result') {
          console.log('\n========== EXIT_PLAN_MODE TIMEOUT ==========');
          console.log('检测到 ExitPlanMode，等待用户批准超时');
          console.log('计划可能已生成，请前往以下目录查看：');
          console.log(`  ${path.join(os.homedir(), '.claude', 'plans')}`);
          break;
        }
      }

      // 记录 assistant 文本
      if (msg.type === 'assistant' && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === 'text' && block.text) {
            allText += block.text + '\n';
          }
          if (block.type === 'tool_use') {
            toolUses.push(block.name);
            console.log('  tool_use:', block.name);

            // 检测 ExitPlanMode，开始计时
            if (block.name === 'ExitPlanMode') {
              exitPlanModeDetected = true;
              exitPlanModeTime = Date.now();
              console.log('  [检测到 ExitPlanMode，开始超时计时...');
            }
          }
        }
      }

      if (msg.type === 'result') {
        result = msg.result || '';
        console.log('\n========== SUMMARY ==========');
        console.log('num_turns:', msg.num_turns);
        console.log('permission_denials:', msg.permission_denials?.length || 0);
        if (msg.permission_denials?.length > 0) {
          console.log('denied tools:', msg.permission_denials.map(d => d.tool_name).join(', '));
        }
      }
    }

    console.log('\n========== ALL TEXT OUTPUT ==========\n');
    console.log(allText.slice(0, 2000));

    console.log('\nFinal result:\n', result.slice(0, 800));

    // 从输出提取路径
    const pathMatch = result.match(/`([^`]+\.md)`/) || result.match(/\/[^\s`']+\.md/);

    if (pathMatch) {
      const generatedPath = pathMatch[1] || pathMatch[0];
      console.log('\n提取到的方案路径:', generatedPath);

      if (fs.existsSync(generatedPath)) {
        console.log('\n文件内容预览:');
        console.log(fs.readFileSync(generatedPath, 'utf8').slice(0, 3000));

        // 同名复制到项目目录
        const filename = path.basename(generatedPath);
        const targetDir = path.join(process.cwd(), '.claude-coder', 'plan');
        const targetPath = path.join(targetDir, filename);

        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }
        fs.copyFileSync(generatedPath, targetPath);
        console.log(`\n已复制到: ${targetPath}`);
      } else {
        console.log('\n文件不存在:', generatedPath);
      }
    } else {
      console.log('\n无法从输出中提取路径');
    }

  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();