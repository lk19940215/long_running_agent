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
const { syncAfterPlan } = require('../common/state');

const EXIT_TIMEOUT_MS = 300000;
const PLANS_DIR = path.join(os.homedir(), '.claude', 'plans');

function buildPlanOnlyPrompt(userInput, interactive = false) {
  return `${userInput}

【工作流程】
1. 探索项目代码库，理解结构和技术栈
2. ${interactive ? '【约束】如果有不确定的关键决策点，请使用 AskUserQuestion 工具向用户提问。' : '【约束】不要提问，默认使用最佳推荐方案。'}
3. 使用 Write 工具将完整计划写入 ~/.claude/plans/ 目录（.md 格式）
4. 写入计划文件后，输出以下标记（独占一行）：
   PLAN_FILE_PATH: <计划文件绝对路径>
5. 简要总结计划要点
`;
}

/**
 * 从文本中提取计划文件路径
 * 优先级：PLAN_FILE_PATH 标记 > .claude/plans/*.md > 反引号包裹 .md > 任意绝对 .md
 */
function extractPlanPath(text) {
  if (!text) return null;

  const tagMatch = text.match(/PLAN_FILE_PATH:\s*(\S+\.md)/);
  if (tagMatch) return tagMatch[1];

  const plansMatch = text.match(/([^\s`'"(]*\.claude\/plans\/[^\s`'"()]+\.md)/);
  if (plansMatch) return plansMatch[1];

  const backtickMatch = text.match(/`([^`]+\.md)`/);
  if (backtickMatch) return backtickMatch[1];

  const absMatch = text.match(/(\/[^\s`'"]+\.md)/);
  if (absMatch) return absMatch[1];

  return null;
}

/**
 * 多源提取计划路径（按可靠性从高到低）
 * 1. Write 工具调用参数（最可靠）
 * 2. assistant 消息流文本
 * 3. result.result 文本
 * 4. plans 目录最新文件（兜底）
 */
function extractPlanPathFromCollected(collected, startTime) {
  // 第一层：从 Write 工具调用参数中直接获取
  for (const msg of collected) {
    if (msg.type !== 'assistant' || !msg.message?.content) continue;
    for (const block of msg.message.content) {
      if (block.type === 'tool_use' && block.name === 'Write') {
        const target = block.input?.file_path || block.input?.path || '';
        if (target.includes('.claude/plans/') && target.endsWith('.md')) {
          if (fs.existsSync(target)) return target;
        }
      }
    }
  }

  // 第二层：从所有 assistant 文本中提取
  let fullText = '';
  for (const msg of collected) {
    if (msg.type === 'assistant' && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === 'text' && block.text) fullText += block.text;
      }
    }
  }
  if (fullText) {
    const p = extractPlanPath(fullText);
    if (p && fs.existsSync(p)) return p;
  }

  // 第三层：从 result.result 中提取
  const resultText = extractResultText(collected);
  if (resultText) {
    const p = extractPlanPath(resultText);
    if (p && fs.existsSync(p)) return p;
  }

  // 第四层：扫描 plans 目录，找 session 期间新建的文件
  if (fs.existsSync(PLANS_DIR)) {
    try {
      const files = fs.readdirSync(PLANS_DIR)
        .filter(f => f.endsWith('.md'))
        .map(f => {
          const fp = path.join(PLANS_DIR, f);
          return { path: fp, mtime: fs.statSync(fp).mtimeMs };
        })
        .filter(f => f.mtime >= startTime)
        .sort((a, b) => b.mtime - a.mtime);
      if (files.length > 0) {
        log('info', `从 plans 目录发现新文件: ${path.basename(files[0].path)}`);
        return files[0].path;
      }
    } catch { /* ignore */ }
  }

  return null;
}

function copyPlanToProject(generatedPath) {
  const filename = path.basename(generatedPath);
  const targetDir = path.join(assets.projectRoot, '.claude-coder', 'plan');
  const targetPath = path.join(targetDir, filename);

  try {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    fs.copyFileSync(generatedPath, targetPath);
    return targetPath;
  } catch {
    return generatedPath;
  }
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

  const startTime = Date.now();
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
        log('warn', '检测到 ExitPlanMode，等待审批超时，尝试从已收集消息中提取路径');
        break;
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

  const planPath = extractPlanPathFromCollected(collected, startTime);

  if (planPath) {
    const targetPath = copyPlanToProject(planPath);
    return { success: true, targetPath, generatedPath: planPath };
  }

  log('warn', '无法从输出中提取计划路径');
  log('info', `请手动查看: ${PLANS_DIR}`);
  return { success: false, reason: 'no_path', targetPath: null };
}

async function runPlanSession(instruction, opts = {}) {
  const planOnly = opts.planOnly || false;
  const interactive = opts.interactive || false;
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
  const label = planOnly ? 'plan only' : 'plan tasks';
  const hookType = interactive ? 'plan_interactive' : 'plan';

  return runSession(hookType, {
    opts,
    sessionNum: 0,
    logFileName: `plan_${ts}.log`,
    label,

    async execute(sdk, ctx) {
      log('info', '正在生成计划方案...');

      const planResult = await _executePlanGen(sdk, ctx, instruction, opts);

      if (!planResult.success) {
        log('error', `\n计划生成失败: ${planResult.reason || planResult.error}`);
        return { success: false, reason: planResult.reason };
      }

      log('ok', `\n计划已生成: ${planResult.targetPath}`);

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

      syncAfterPlan();
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

  assets.ensureDirs();
  const projectRoot = assets.projectRoot;

  if (opts.readFile) {
    const reqPath = path.resolve(projectRoot, opts.readFile);
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

  const config = loadConfig();
  // if opts.model is not set, use the default opus model or default model, make sure the model is set.
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
