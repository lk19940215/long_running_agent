'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { buildSystemPrompt, buildPlanPrompt } = require('./prompts');
const { log } = require('../common/config');
const { assets } = require('../common/assets');
const { extractResultText } = require('../common/logging');
const { printStats } = require('../common/tasks');
const { syncAfterPlan } = require('./state');
const { Session } = require('./session');

const PLANS_DIR = path.join(os.homedir(), '.claude', 'plans');

function buildPlanOnlyPrompt(instruction, opts = {}) {
  const interactive = opts.interactive || false;
  const reqFile = opts.reqFile || null;

  const inputSection = reqFile
    ? `需求文件路径: ${reqFile}\n先读取该文件，理解用户需求和约束。`
    : `用户需求:\n${instruction}`;

  const interactionRule = interactive
    ? '如有不确定的关键决策点，使用 AskUserQuestion 工具向用户提问，对话确认方案。'
    : '不要提问，默认使用最佳推荐方案。';

  return `你是一个资深技术架构师。根据以下需求，探索项目代码库后输出完整的技术方案文档。

${inputSection}

【流程】
1. 探索项目代码库，理解结构和技术栈
2. ${interactionRule}
3. 使用 Write 工具将完整计划写入 ~/.claude/plans/ 目录（.md 格式）
4. 写入后输出标记（独占一行）：PLAN_FILE_PATH: <计划文件绝对路径>
5. 简要总结计划要点
`;
}

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

function extractPlanPathFromMessages(messages, startTime) {
  for (const msg of messages) {
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

  let fullText = '';
  for (const msg of messages) {
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

  const resultText = extractResultText(messages);
  if (resultText) {
    const p = extractPlanPath(resultText);
    if (p && fs.existsSync(p)) return p;
  }

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

async function _executePlanGen(session, instruction, opts = {}) {
  const interactive = opts.interactive || false;
  const prompt = buildPlanOnlyPrompt(instruction, opts);
  const queryOpts = {
    permissionMode: 'plan',
    cwd: opts.projectRoot || assets.projectRoot,
    hooks: session.hooks,
  };
  if (!interactive) {
    queryOpts.disallowedTools = ['askUserQuestion'];
  }
  if (opts.model) queryOpts.model = opts.model;

  const startTime = Date.now();
  const { messages, success } = await session.runQuery(prompt, queryOpts);

  if (!success) {
    log('warn', '计划生成查询未正常结束');
  }

  const planPath = extractPlanPathFromMessages(messages, startTime);

  if (planPath) {
    const targetPath = copyPlanToProject(planPath);
    return { success: true, targetPath, generatedPath: planPath };
  }

  log('warn', '无法从输出中提取计划路径');
  log('info', `请手动查看: ${PLANS_DIR}`);
  return { success: false, reason: 'no_path', targetPath: null };
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

// ─── Main Entry ──────────────────────────────────────────

async function executePlan(config, input, opts = {}) {
  const instruction = input || '';

  if (opts.reqFile && instruction) {
    log('info', `-r 模式下忽略文本输入，使用需求文件: ${opts.reqFile}`);
  } else if (opts.reqFile) {
    console.log(`需求文件: ${opts.reqFile}`);
  }

  if (!instruction && !opts.reqFile) {
    throw new Error('用法: claude-coder plan "需求内容"  或  claude-coder plan -r [requirements.md]');
  }

  if (opts.interactive) {
    log('info', '交互模式已启用，模型可能会向您提问');
  }

  let shouldAutoRun = false;
  if (!opts.planOnly) {
    shouldAutoRun = await promptAutoRun();
  }

  const hookType = opts.interactive ? 'plan_interactive' : 'plan';
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
  const label = opts.planOnly ? 'plan_only' : 'plan_tasks';

  const result = await Session.run(hookType, config, {
    logFileName: `plan_${ts}.log`,
    label,

    async execute(session) {
      log('info', '正在生成计划方案...');

      const planResult = await _executePlanGen(session, instruction, opts);

      if (!planResult.success) {
        log('error', `\n计划生成失败: ${planResult.reason || planResult.error}`);
        return { success: false, reason: planResult.reason };
      }

      log('ok', `\n计划已生成: ${planResult.targetPath}`);

      if (opts.planOnly) {
        return { success: true, planPath: planResult.targetPath };
      }

      log('info', '正在生成任务列表...');

      const tasksPrompt = buildPlanPrompt(planResult.targetPath);
      const queryOpts = session.buildQueryOptions(opts);
      queryOpts.systemPrompt = buildSystemPrompt('plan');

      const { success } = await session.runQuery(tasksPrompt, queryOpts);
      if (!success) {
        log('warn', '任务分解查询未正常结束');
      }

      syncAfterPlan();
      log('ok', '任务追加完成');
      return { success: true, planPath: planResult.targetPath };
    },
  });

  if (result.success) {
    printStats();

    if (shouldAutoRun) {
      console.log('');
      log('info', '开始自动执行任务...');
      const { executeRun } = require('./runner');
      await executeRun(config, opts);
    }
  }
}

module.exports = { executePlan };
