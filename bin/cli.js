#!/usr/bin/env node
'use strict';

const pkg = require('../package.json');

const COMMANDS = {
  run:       { desc: '自动编码循环',             usage: 'claude-coder run [--max N] [--pause N] [--dry-run]' },
  setup:     { desc: '交互式模型配置',           usage: 'claude-coder setup' },
  init:      { desc: '初始化项目环境',           usage: 'claude-coder init' },
  plan:      { desc: '生成计划方案',             usage: 'claude-coder plan "需求" | plan -r requirements.md [--planOnly] [-i]' },
  simplify:  { desc: '代码审查和简化',           usage: 'claude-coder simplify [focus]' },
  auth:      { desc: '导出 Playwright 登录状态', usage: 'claude-coder auth [url]' },
  status:    { desc: '查看任务进度和成本',       usage: 'claude-coder status' },
  go:        { desc: 'AI 驱动的需求组装',        usage: 'claude-coder go ["需求"] [-r file] [--reset]' },
};

function showHelp() {
  console.log(`\nClaude Coder v${pkg.version}\n`);
  console.log('用法: claude-coder <command> [options]\n');
  console.log('命令:');
  for (const [name, info] of Object.entries(COMMANDS)) {
    console.log(`  ${name.padEnd(10)} ${info.desc}`);
  }
  console.log('\n示例:');
  console.log('  claude-coder setup                   配置模型和 API Key');
  console.log('  claude-coder plan "实现用户登录"      生成计划方案');
  console.log('  claude-coder plan -r requirements.md 从文件读取需求');
  console.log('  claude-coder plan --planOnly         仅生成计划文档');
  console.log('  claude-coder plan -i "优化系统"      交互模式，允许模型提问');
  console.log('  claude-coder run                     执行所有待处理任务');
  console.log('  claude-coder run --max 1             单次执行');
  console.log('  claude-coder run --max 5 --pause 5   每 5 个 session 暂停确认');
  console.log('  claude-coder run --dry-run            预览模式');
  console.log('  claude-coder simplify               代码审查和简化');
  console.log('  claude-coder simplify "内存效率"     聚焦特定领域审查');
  console.log('  claude-coder go                      对话式需求收集和方案组装');
  console.log('  claude-coder go "用户管理页面"        AI 自动分析需求并组装方案');
  console.log('  claude-coder go -r requirements.md   从文件读取需求并自动组装');
  console.log('  claude-coder go --reset              重置 Go 记忆');
  console.log('  claude-coder auth                    导出 Playwright 登录状态');
  console.log('  claude-coder auth http://localhost:8080   指定登录 URL'); 
  console.log('  claude-coder status                  查看进度和成本');
  console.log(`\n前置条件: npm install -g @anthropic-ai/claude-agent-sdk`);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const command = args[0];
  const opts = { max: 50, pause: 0, dryRun: false, readFile: null, model: null, n: 3, planOnly: false, interactive: false };
  const positional = [];

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--max':
        opts.max = parseInt(args[++i], 10) || 50;
        break;
      case '--pause':
        { const v = parseInt(args[++i], 10); opts.pause = (v >= 0 && !isNaN(v)) ? v : 5; }
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--model':
        opts.model = args[++i] || null;
        break;
      case '-n':
      case '--n':
        opts.n = parseInt(args[++i], 10) || 3;
        break;
      case '-r': {
        const next = args[i + 1];
        if (next && !next.startsWith('-')) {
          opts.readFile = next;
          i++;
        } else {
          opts.readFile = 'requirements.md';
        }
        break;
      }
      case '--planOnly':
        opts.planOnly = true;
        break;
      case '--reset':
        opts.reset = true;
        break;
      case '-i':
      case '--interactive':
        opts.interactive = true;
        break;
      case '--help':
      case '-h':
        showHelp();
        process.exit(0);
        break;
      default:
        if (!args[i].startsWith('--')) {
          positional.push(args[i]);
        }
        break;
    }
  }

  return { command, positional, opts };
}

async function main() {
  const { command, positional, opts } = parseArgs(process.argv);

  if (!command || command === '--help' || command === '-h') {
    showHelp();
    process.exit(0);
  }

  if (command === '--version' || command === '-v') {
    console.log(pkg.version);
    process.exit(0);
  }

  // 不需要 Engine 的命令
  switch (command) {
    case 'setup': {
      const setup = require('../src/commands/setup');
      await setup.setup();
      return;
    }
    case 'auth': {
      const { auth } = require('../src/commands/auth');
      await auth(positional[0] || null);
      return;
    }
    case 'status': {
      const tasks = require('../src/common/tasks');
      tasks.showStatus();
      return;
    }
  }

  // 需要 Engine 的命令
  const { Engine } = require('../src');
  const engine = new Engine(command, opts);

  switch (command) {
    case 'run':
      await engine.run(opts);
      break;
    case 'init':
      await engine.initProject();
      break;
    case 'plan':
      await engine.plan(positional[0] || '', opts);
      break;
    case 'simplify':
      await engine.simplify(positional[0] || null, { n: opts.n });
      break;
    case 'go':
      await engine.go(positional[0] || '', opts);
      break;
    default:
      console.error(`未知命令: ${command}`);
      showHelp();
      process.exit(1);
  }
}

main().catch(err => {
  console.error(`\n错误: ${err.message}`);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
