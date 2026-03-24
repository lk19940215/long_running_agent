'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { log, printModeBanner } = require('../common/display');
const { assets } = require('../common/assets');
const { buildSystemPrompt } = require('./prompts');
const { saveDesignState } = require('./state');
const { Session } = require('./session');

// ─── Design Dir ───────────────────────────────────────────

function getDesignDir() {
  return assets.dir('design');
}

function scanPenFiles(designDir) {
  const files = [];
  const scan = (dir, prefix = '') => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        scan(path.join(dir, entry.name), prefix + entry.name + '/');
      } else if (entry.name.endsWith('.pen')) {
        files.push({ rel: prefix + entry.name, abs: path.join(dir, entry.name) });
      }
    }
  };
  scan(designDir);
  return files;
}

// ─── Type Resolution ─────────────────────────────────────

function resolveType(opts, designDir) {
  if (opts.type) return opts.type;

  const systemPenPath = path.join(designDir, 'system.lib.pen');
  if (!fs.existsSync(systemPenPath)) return 'init';

  return 'new';
}

// ─── Prompt Builders ─────────────────────────────────────

function hasProjectCode(root) {
  const markers = ['package.json', 'pyproject.toml', 'requirements.txt', 'Cargo.toml', 'go.mod', 'pom.xml'];
  const dirs = ['src', 'lib', 'app', 'frontend', 'web', 'client', 'pages'];
  for (const m of markers) { if (fs.existsSync(path.join(root, m))) return true; }
  for (const d of dirs) {
    const p = path.join(root, d);
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return true;
  }
  return false;
}

function buildProjectContext() {
  const root = assets.projectRoot;
  const hasCode = hasProjectCode(root);
  let ctx = `### 项目类型\n${hasCode ? '已有代码项目（设计时应 Read 源码还原真实内容）' : '全新项目（无现有代码，根据需求从零设计）'}\n- 项目根路径: ${root}\n\n`;

  if (hasCode) {
    const pkgPath = path.join(root, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        ctx += `### 项目信息\n- name: ${pkg.name || '未定义'}\n- description: ${pkg.description || '未定义'}\n\n`;
      } catch { /* ignore */ }
    }
  }

  return ctx;
}

function buildDesignPrompt(instruction, designDir) {
  let designContext = `### 设计文件目录\n绝对路径: ${designDir}\n`;

  const systemPenPath = path.join(designDir, 'system.lib.pen');
  const isInit = !fs.existsSync(systemPenPath);
  designContext += isInit
    ? '### 设计库\n尚未创建 system.lib.pen，请先根据下方「初始化模板」生成。\n\n'
    : '### 设计库\n已有 system.lib.pen，请先 Read 查看并复用。\n\n';

  if (isInit) {
    const initTemplate = assets.read('designInit') || '';
    if (initTemplate) {
      designContext += `### 初始化模板\n\n${initTemplate}\n\n`;
    }
  }

  const mapPath = path.join(designDir, 'design_map.json');
  if (fs.existsSync(mapPath)) {
    try {
      const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
      const pages = Object.entries(map.pages || {});
      if (pages.length > 0) {
        designContext += '### 已有页面\n';
        for (const [name, info] of pages) {
          designContext += `- **${name}**: ${info.description} (${path.join(designDir, info.pen)})\n`;
        }
        designContext += '\n';
      }
    } catch { /* ignore */ }
  }

  designContext += buildProjectContext();

  return assets.render('designUser', {
    designContext,
    instruction: instruction
      ? `用户需求:\n${instruction}`
      : '用户未提供需求，使用对话模式收集。',
    modeHint: instruction
      ? '【自动模式】用户已提供需求，直接设计，不要提问。'
      : '【对话模式】使用 AskUserQuestion 工具引导用户描述需求。',
  });
}

function buildFixPrompt(designDir, userInput) {
  const penFiles = scanPenFiles(designDir);
  let designContext = '### 需要检查修复的 .pen 文件\n\n';
  if (penFiles.length === 0) {
    designContext += '（未发现 .pen 文件）\n';
  } else {
    for (const f of penFiles) {
      designContext += `- ${f.abs}\n`;
    }
  }
  designContext += '\n';

  const instruction = userInput
    ? `用户反馈的问题:\n${userInput}\n\n请 Read 每个文件，检查并修复所有不合规内容。`
    : '请 Read 每个文件，检查并修复所有不合规内容。';

  return assets.render('designFixUser', { designContext, instruction });
}

// ─── Post-session Summary ─────────────────────────────────

function showDesignSummary(designDir) {
  const penFiles = scanPenFiles(designDir);
  if (penFiles.length === 0) {
    log('warn', '设计目录中没有 .pen 文件');
    return 0;
  }

  console.log('');
  console.log('┌─ 设计文件 ─────────────────────────────────────┐');
  for (const f of penFiles) {
    console.log(`│  ${f.rel.padEnd(52)}│`);
  }
  console.log('└───────────────────────────────────────────────┘');

  const hasMap = fs.existsSync(path.join(designDir, 'design_map.json'));
  if (hasMap) log('info', 'design_map.json OK');

  let hasJsonError = false;
  for (const f of penFiles) {
    try {
      JSON.parse(fs.readFileSync(f.abs, 'utf8'));
    } catch (e) {
      hasJsonError = true;
      log('error', `${f.rel}: JSON 语法错误 — ${e.message}`);
    }
  }
  if (hasJsonError) {
    log('warn', '存在 JSON 格式问题，建议运行: claude-coder design --type fix');
  }

  return penFiles.length;
}

// ─── User Confirm ────────────────────────────────────────

function askUser(question) {
  if (!process.stdin.isTTY) return Promise.resolve('');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => { rl.close(); resolve(answer.trim()); });
  });
}

// ─── Fix Session ─────────────────────────────────────────

async function runFixSession(config, designDir, userInput, opts) {
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
  log('info', '正在修复 .pen 文件...');

  await Session.run('design', config, {
    logFileName: `design_fix_${ts}.log`,
    label: 'design_fix',
    async execute(session) {
      const queryOpts = session.buildQueryOptions(opts);
      queryOpts.systemPrompt = buildSystemPrompt('designFix');
      return await session.runQuery(buildFixPrompt(designDir, userInput), queryOpts);
    },
  });

  log('ok', '修复完成');
  showDesignSummary(designDir);
}

// ─── Main Entry ──────────────────────────────────────────

async function executeDesign(config, input, opts = {}) {
  if (opts.reset) {
    saveDesignState({});
    log('ok', 'Design 状态已重置');
    return;
  }

  const designDir = getDesignDir();
  if (!fs.existsSync(designDir)) fs.mkdirSync(designDir, { recursive: true });
  const pagesDir = path.join(designDir, 'pages');
  if (!fs.existsSync(pagesDir)) fs.mkdirSync(pagesDir, { recursive: true });

  const type = resolveType(opts, designDir);
  const instruction = input || '';
  const isAutoMode = !!instruction;
  const designLabel = type === 'fix' ? '修复' : isAutoMode ? '自动' : '对话';
  printModeBanner('design', `${type} · ${designLabel}`, config?.model);

  if (!opts.model || !opts.model.includes('glm-5')) {
    log('info', '提示: design 推荐使用 --model glm-5 获得最佳效果');
  }

  if (type === 'fix') {
    const penFiles = scanPenFiles(designDir);
    if (penFiles.length === 0) {
      log('warn', '设计目录中没有 .pen 文件需要修复');
      return;
    }
    const answer = await askUser(`\n发现 ${penFiles.length} 个 .pen 文件，是否进行修复？(Y/n) `);
    if (answer.toLowerCase() === 'n') { log('info', '已取消'); return; }
    await runFixSession(config, designDir, input, opts);
    return;
  }

  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);

  const sessionResult = await Session.run('design', config, {
    logFileName: `design_${ts}.log`,
    label: isAutoMode ? 'design_auto' : 'design_dialogue',
    async execute(session) {
      const queryOpts = session.buildQueryOptions(opts);
      queryOpts.systemPrompt = buildSystemPrompt('design');
      return await session.runQuery(buildDesignPrompt(instruction, designDir), queryOpts);
    },
  });

  if (sessionResult && !sessionResult.success) {
    log('warn', 'AI 会话未正常完成，检查生成结果...');
  }

  const penCount = showDesignSummary(designDir);
  if (penCount === 0) {
    log('error', 'AI 未生成任何 .pen 文件');
    return;
  }

  saveDesignState({ lastTimestamp: new Date().toISOString(), designDir, penCount, type });
  log('ok', `设计完成！ 文件: ${penCount}`);
  log('info', '迭代调整: claude-coder design "修改xxx"');
  log('info', '修复文件: claude-coder design --type fix');
}

module.exports = { executeDesign };
