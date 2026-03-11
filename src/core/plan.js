'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { runSession } = require('./base');
const { buildQueryOptions } = require('./query');
const { buildPlanSystemPrompt, buildPlanPrompt } = require('./prompts');
const { paths, log, loadConfig, getProjectRoot, ensureLoopDir } = require('../common/config');
const { extractResultText } = require('../common/logging');
const { printStats } = require('../common/tasks');

const EXIT_TIMEOUT_MS = 30000;

// --------------- Plan Only 模式工具函数 ---------------

/**
 * 构建计划生成提示语
 */
function buildPlanOnlyPrompt(userInput) {
  return `${userInput}
【约束】不要提问，默认使用最佳推荐方案。
【重要】在最后输出中，必须包含实际方案文件的写入路径，格式如下：
方案文件已写入：\`<实际路径>\`
`;
}

/**
 * 从结果中提取文件路径
 */
function extractPlanPath(result) {
  const pathMatch = result.match(/`([^`]+\.md)`/) || result.match(/\/[^\s`']+\.md/);
  if (pathMatch) {
    return pathMatch[1] || pathMatch[0];
  }
  return null;
}

/**
 * 复制计划文件到项目目录
 */
function copyPlanToProject(generatedPath) {
  const filename = path.basename(generatedPath);
  const targetDir = path.join(process.cwd(), '.claude-coder', 'plan');
  const targetPath = path.join(targetDir, filename);

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  fs.copyFileSync(generatedPath, targetPath);
  return targetPath;
}

/**
 * 执行计划生成（共享 ctx）
 */
async function _executePlanGen(sdk, ctx, userInput, opts = {}) {
  const prompt = buildPlanOnlyPrompt(userInput);
  const queryOpts = {
    permissionMode: 'plan',
    disallowedTools: ['askUserQuestion'],
    cwd: opts.projectRoot || process.cwd(),
    hooks: ctx.hooks,
  };
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

// --------------- Session 执行器 ---------------

/**
 * 运行计划 Session
 * - planOnly=false: 生成 plan.md + tasks.json
 * - planOnly=true:  仅生成 plan.md
 */
async function runPlanSession(instruction, opts = {}) {
  const planOnly = opts.planOnly || false;
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const label = planOnly ? 'plan only' : 'plan tasks';

  return runSession('plan', {
    opts,
    sessionNum: 0,
    logFileName: `plan_${dateStr}.log`,
    label,

    async execute(sdk, ctx) {
      log('info', '正在生成计划方案...');

      // Phase 1: 生成 plan.md
      const planResult = await _executePlanGen(sdk, ctx, instruction, opts);

      if (!planResult.success) {
        log('error', `计划生成失败: ${planResult.reason || planResult.error}`);
        return { success: false, reason: planResult.reason };
      }

      log('ok', `计划已生成: ${planResult.targetPath}`);

      // planOnly 模式到此结束
      if (planOnly) {
        return { success: true, planPath: planResult.targetPath };
      }

      // Phase 2: 转换为 tasks.json
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

// --------------- CLI 辅助函数 ---------------

/**
 * 询问用户是否自动运行
 */
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

// --------------- CLI 入口 ---------------

/**
 * CLI 入口
 */
async function run(input, opts = {}) {
  let instruction = input || '';

  // 1. 文件读取 (-r 参数)
  if (opts.readFile) {
    const reqPath = path.resolve(opts.readFile);
    if (!fs.existsSync(reqPath)) {
      log('error', `文件不存在: ${reqPath}`);
      process.exit(1);
    }
    instruction = fs.readFileSync(reqPath, 'utf8');
    console.log(`已读取需求文件: ${reqPath}`);
  }

  // 2. 校验
  if (!instruction) {
    log('error', '用法: claude-coder plan "需求内容"  或  claude-coder plan -r [requirements.md]');
    process.exit(1);
  }

  // 3. 环境准备
  const p = paths();
  const projectRoot = getProjectRoot();
  ensureLoopDir();

  // 4. 配置加载
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

  // 5. 检查前置条件
  if (!fs.existsSync(p.profile)) {
    log('error', 'profile 不存在，请先运行 claude-coder init 初始化项目');
    process.exit(1);
  }

  // 6. 用户交互（非 planOnly 模式）
  let shouldAutoRun = false;
  if (!opts.planOnly) {
    shouldAutoRun = await promptAutoRun();
  }

  // 7. 执行
  const result = await runPlanSession(instruction, { projectRoot, ...opts });

  // 8. 显示统计（成功时）
  if (result.success) {
    printStats();

    // 9. 自动运行（非 planOnly 模式）
    if (shouldAutoRun) {
      console.log('');
      log('info', '开始自动执行任务...');
      const { run: runCoding } = require('./runner');
      await runCoding(opts);
    }
  }
}

module.exports = { runPlanSession, run };