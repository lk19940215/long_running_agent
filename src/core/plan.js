'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { log, printModeBanner } = require('../common/display');
const { assets } = require('../common/assets');
const { printStats } = require('../common/tasks');
const { buildSystemPrompt, buildPlanPrompt } = require('./prompts');
const { syncAfterPlan } = require('./state');
const { Session } = require('./session');

const PLANS_DIR = path.join(os.homedir(), '.claude', 'plans');

function buildPlanOnlySystem(opts = {}) {
  const interactive = opts.interactive || false;
  const interactionRule = interactive
    ? '如有不确定的关键决策点，使用 AskUserQuestion 工具向用户提问，对话确认方案。'
    : '不要提问，默认使用最佳推荐方案。';

  return `你是一个资深技术架构师。根据用户需求，探索项目代码库后输出完整的技术方案文档。

【流程】
1. 探索项目代码库，理解结构和技术栈
2. ${interactionRule}
3. 使用 Write 工具将完整计划写入 ~/.claude/plans/ 目录（.md 格式）
4. 写入后输出标记（独占一行）：PLAN_FILE_PATH: <计划文件绝对路径>
5. 简要总结计划要点

【关键文件】
- \`.claude-coder/project_profile.json\` — 项目元数据
- \`.claude-coder/design/\` — UI 设计稿目录（design_map.json 索引 + .pen 设计文件），存在时应在方案中参考`;
}

function buildPlanOnlyPrompt(instruction, opts = {}) {
  const reqFile = opts.reqFile || null;
  return reqFile
    ? `需求文件路径: ${reqFile}\n先读取该文件，理解用户需求和约束。`
    : instruction;
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
    systemPrompt: buildPlanOnlySystem(opts),
    cwd: opts.projectRoot || assets.projectRoot,
    hooks: session.hooks,
  };
  if (!interactive) {
    queryOpts.disallowedTools = ['askUserQuestion'];
  }
  if (opts.model) queryOpts.model = opts.model;

  let capturedPlanPath = null;

  const { success } = await session.runQuery(prompt, queryOpts, {
    onMessage(message) {
      if (message.type !== 'assistant' || !message.message?.content) return;
      for (const block of message.message.content) {
        if (block.type === 'tool_use' && block.name === 'Write') {
          const target = block.input?.file_path || block.input?.path || '';
          const normalized = target.replace(/\\/g, '/');
          if (normalized.includes('.claude/plans/') && normalized.endsWith('.md')) {
            capturedPlanPath = target;
          }
        }
      }
    },
  });

  if (!success) {
    log('warn', '计划生成查询未正常结束');
  }

  if (capturedPlanPath && fs.existsSync(capturedPlanPath)) {
    const targetPath = copyPlanToProject(capturedPlanPath);
    return { success: true, targetPath, generatedPath: capturedPlanPath };
  }

  log('warn', '无法从输出中提取计划路径');
  log('info', `请手动查看: ${PLANS_DIR}`);
  return { success: false, reason: 'no_path', targetPath: null };
}

function _askLine(question) {
  if (!process.stdin.isTTY) return Promise.resolve('');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => { rl.close(); resolve(answer.trim()); });
  });
}

async function promptAutoRun() {
  const answer = await _askLine('任务分解完成后是否自动开始执行？(y/n) ');
  return /^[Yy]/.test(answer);
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

  const modeLabel = opts.planOnly ? 'planOnly' : opts.interactive ? '交互模式' : '自动模式';
  printModeBanner('plan', modeLabel, config?.model);

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
        log('error', `\n计划生成失败: ${planResult.reason}`);
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

      const { success } = await session.runQuery(tasksPrompt, queryOpts, { continue: true });
      if (!success) {
        log('warn', '任务分解查询未正常结束');
        return { success: false, reason: '任务分解未正常完成' };
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
      log('info', '开始自动执行任务（沿用会话上下文）...');
      const { executeRun } = require('./runner');
      await executeRun(config, { ...opts });
    }
  }
}

module.exports = { executePlan };
