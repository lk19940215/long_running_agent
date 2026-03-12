'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { runSession } = require('./base');
const { buildQueryOptions } = require('./query');
const { buildPlanSystemPrompt, buildPlanPrompt } = require('./prompts');
const { log, loadConfig } = require('../common/config');
const { assets } = require('../common/assets');
const { extractResultText } = require('../common/logging');
const { printStats } = require('../common/tasks');

const EXIT_TIMEOUT_MS = 30000;

function buildPlanOnlyPrompt(userInput, interactive = false) {
  const constraint = interactive
    ? '【约束】如果有不确定的关键决策点，请使用 AskUserQuestion 工具向用户提问。'
    : '【约束】不要提问，默认使用最佳推荐方案。';

  return `${userInput}
${constraint}
【重要】在最后输出中，必须包含实际方案文件的写入路径，格式如下：
方案文件已写入：\`<实际路径>\`
`;
}

function extractPlanPath(result) {
  const pathMatch = result.match(/`([^`]+\.md)`/) || result.match(/\/[^\s`']+\.md/);
  if (pathMatch) {
    return pathMatch[1] || pathMatch[0];
  }
  return null;
}

function copyPlanToProject(generatedPath) {
  const filename = path.basename(generatedPath);
  const targetDir = path.join(assets.projectRoot, '.claude-coder', 'plan');
  const targetPath = path.join(targetDir, filename);

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  fs.copyFileSync(generatedPath, targetPath);
  return targetPath;
}

async function _executePlanGen(sdk, ctx, userInput, opts = {}) {
  const interactive = opts.interactive || false;
  const prompt = buildPlanOnlyPrompt(userInput, interactive);
  const queryOpts = {
    permissionMode: 'plan',
    cwd: opts.projectRoot || assets.projectRoot,
    hooks: ctx.hooks,
  };
  if (!interactive) {
    queryOpts.disallowedTools = ['askUserQuestion'];
  }
  if (opts.model) queryOpts.model = opts.model;

  let exitPlanModeDetected = false;
  let exitPlanModeTime = null;

  const collected = [];
  const session = sdk.query({ prompt, options: queryOpts });

  for await (const msg of session) {
    if (ctx._isStalled && ctx._isStalled()) {
      log('warn', '停顿超时，中断 plan 生成');
      break;
    }

    if (exitPlanModeDetected && exitPlanModeTime) {
      const elapsed = Date.now() - exitPlanModeTime;
      if (elapsed > EXIT_TIMEOUT_MS && msg.type !== 'result') {
        log('warn', '检测到 ExitPlanMode，等待用户批准超时');
        log('info', `计划可能已生成，请查看: ${path.join(os.homedir(), '.claude', 'plans')}`);
        return { success: false, reason: 'timeout', targetPath: null };
      }
    }

    collected.push(msg);
    ctx._logMessage(msg);

    if (msg.type === 'assistant' && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === 'tool_use' && block.name === 'ExitPlanMode') {
          exitPlanModeDetected = true;
          exitPlanModeTime = Date.now();
        }
      }
    }
  }

  const result = extractResultText(collected);
  const planPath = extractPlanPath(result);

  if (planPath && fs.existsSync(planPath)) {
    const targetPath = copyPlanToProject(planPath);
    log('ok', `计划已生成: ${targetPath}`);
    return { success: true, targetPath, generatedPath: planPath };
  }

  log('warn', '无法从输出中提取计划路径');
  return { success: false, reason: 'no_path', targetPath: null };
}

async function runPlanSession(instruction, opts = {}) {
  const planOnly = opts.planOnly || false;
  const interactive = opts.interactive || false;
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const label = planOnly ? 'plan only' : 'plan tasks';
  const hookType = interactive ? 'plan_interactive' : 'plan';

  return runSession(hookType, {
    opts,
    sessionNum: 0,
    logFileName: `plan_${dateStr}.log`,
    label,

    async execute(sdk, ctx) {
      log('info', '正在生成计划方案...');

      const planResult = await _executePlanGen(sdk, ctx, instruction, opts);

      if (!planResult.success) {
        log('error', `计划生成失败: ${planResult.reason || planResult.error}`);
        return { success: false, reason: planResult.reason };
      }

      log('ok', `计划已生成: ${planResult.targetPath}`);

      if (planOnly) {
        return { success: true, planPath: planResult.targetPath };
      }

      log('info', '正在生成任务列表...');

      const tasksPrompt = buildPlanPrompt(planResult.targetPath);
      const queryOpts = buildQueryOptions(ctx.config, opts);
      queryOpts.systemPrompt = buildPlanSystemPrompt();
      queryOpts.hooks = ctx.hooks;
      queryOpts.abortController = ctx.abortController;

      await ctx.runQuery(sdk, tasksPrompt, queryOpts);

      log('ok', '任务追加完成');
      return { success: true, planPath: planResult.targetPath };
    },
  });
}

async function promptAutoRun() {
  if (!process.stdin.isTTY) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question('任务分解完成后是否自动开始执行？(y/n) ', answer => {
      rl.close();
      resolve(/^[Yy]/.test(answer.trim()));
    });
  });
}

async function run(input, opts = {}) {
  let instruction = input || '';

  if (opts.readFile) {
    const reqPath = path.resolve(opts.readFile);
    if (!fs.existsSync(reqPath)) {
      log('error', `文件不存在: ${reqPath}`);
      process.exit(1);
    }
    instruction = fs.readFileSync(reqPath, 'utf8');
    console.log(`已读取需求文件: ${reqPath}`);
  }

  if (!instruction) {
    log('error', '用法: claude-coder plan "需求内容"  或  claude-coder plan -r [requirements.md]');
    process.exit(1);
  }

  assets.ensureDirs();
  const projectRoot = assets.projectRoot;

  const config = loadConfig();
  if (!opts.model) {
    if (config.defaultOpus) {
      opts.model = config.defaultOpus;
    } else if (config.model) {
      opts.model = config.model;
    }
  }

  const displayModel = opts.model || config.model || '(default)';
  log('ok', `模型配置已加载: ${config.provider || 'claude'} (plan 使用: ${displayModel})`);
  if (opts.interactive) {
    log('info', '交互模式已启用，模型可能会向您提问');
  }

  if (!assets.exists('profile')) {
    log('error', 'profile 不存在，请先运行 claude-coder init 初始化项目');
    process.exit(1);
  }

  let shouldAutoRun = false;
  if (!opts.planOnly) {
    shouldAutoRun = await promptAutoRun();
  }

  const result = await runPlanSession(instruction, { projectRoot, ...opts });

  if (result.success) {
    printStats();

    if (shouldAutoRun) {
      console.log('');
      log('info', '开始自动执行任务...');
      const { run: runCoding } = require('./runner');
      await runCoding(opts);
    }
  }
}

module.exports = { runPlanSession, run };
