'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { buildSystemPrompt } = require('./prompts');
const { log } = require('../common/config');
const { assets } = require('../common/assets');
const { extractResultText } = require('../common/logging');
const { loadState, saveState } = require('./state');

const GO_DIR_NAME = 'go';

function getRecipesDir() {
  return path.join(assets.projectRoot, '.claude-coder', 'recipes');
}

// ─── Go State (harness_state.json → go section) ──────────

function loadGoState() {
  const state = loadState();
  return state.go || {};
}

function saveGoState(goData) {
  const state = loadState();
  state.go = { ...state.go, ...goData };
  saveState(state);
}

// ─── Prompt Builder ───────────────────────────────────────

function buildGoPrompt(instruction, opts = {}) {
  const recipesAbsPath = getRecipesDir();
  const goState = loadGoState();

  const inputSection = opts.reqFile
    ? `用户需求文件路径: ${opts.reqFile}\n先读取该文件了解用户需求。`
    : instruction
      ? `用户需求:\n${instruction}`
      : '用户未提供需求，使用对话模式收集。';

  const modeSection = (instruction || opts.reqFile)
    ? '【自动模式】用户已提供需求，直接分析并组装方案，不要提问。'
    : '【对话模式】使用 askUserQuestion 工具，按协议中的顺序向用户提问收集需求。';

  let memorySection = '';
  if (goState.lastDomain || goState.lastFile) {
    const parts = [];
    if (goState.lastDomain) parts.push(`上次领域: ${goState.lastDomain}`);
    if (goState.lastComponents) parts.push(`上次组件: ${goState.lastComponents.join(', ')}`);
    if (goState.lastTimestamp) parts.push(`时间: ${goState.lastTimestamp}`);
    memorySection = `上次使用记录（仅供参考）：${parts.join(' | ')}`;
  }

  return [
    inputSection,
    '',
    modeSection,
    '',
    `食谱目录绝对路径: ${recipesAbsPath}`,
    '',
    memorySection,
  ].filter(Boolean).join('\n');
}

// ─── Content Extraction ──────────────────────────────────

function extractGoContent(collected) {
  let fullText = '';
  for (const msg of collected) {
    if (msg.type === 'assistant' && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === 'text' && block.text) fullText += block.text;
      }
    }
  }

  const match = fullText.match(/GO_CONTENT_START\s*\n([\s\S]*?)\nGO_CONTENT_END/);
  if (match) return match[1].trim();

  const resultText = extractResultText(collected);
  if (resultText) {
    const m = resultText.match(/GO_CONTENT_START\s*\n([\s\S]*?)\nGO_CONTENT_END/);
    if (m) return m[1].trim();
  }

  return null;
}

function extractDomainFromContent(content) {
  if (!content) return null;
  const match = content.match(/##\s*开发领域\s*\n\s*(\S+)/);
  if (match) {
    const name = match[1];
    const domainMap = { '管理后台': 'console', 'H5': 'h5', '后端': 'backend' };
    for (const [key, val] of Object.entries(domainMap)) {
      if (name.includes(key)) return val;
    }
  }
  return null;
}

function extractComponentsFromContent(content) {
  if (!content) return [];
  const section = content.match(/##\s*功能组件\s*\n([\s\S]*?)(?=\n##|$)/);
  if (!section) return [];
  const items = section[1].match(/[-*]\s+\*\*(.+?)\*\*/g) || [];
  return items.map(i => i.replace(/[-*]\s+\*\*|\*\*/g, '').trim());
}

// ─── Preview & Confirm ───────────────────────────────────

async function previewAndConfirm(content) {
  const lines = content.split('\n');
  const previewLines = Math.min(lines.length, 25);

  console.log('');
  console.log('┌─ 需求方案预览 ────────────────────────────────┐');
  for (let i = 0; i < previewLines; i++) {
    const line = lines[i].length > 52 ? lines[i].slice(0, 49) + '...' : lines[i];
    console.log(`│ ${line.padEnd(52)}│`);
  }
  if (lines.length > previewLines) {
    const msg = `... 共 ${lines.length} 行，完整内容将写入文件`;
    console.log(`│ ${msg.padEnd(52)}│`);
  }
  console.log('└───────────────────────────────────────────────┘');

  if (!process.stdin.isTTY) return { confirmed: true, supplement: '' };

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question('\n有什么要补充的？(直接回车确认 / 输入补充内容 / 输入 cancel 取消)\n> ', answer => {
      rl.close();
      const trimmed = answer.trim();
      if (trimmed.toLowerCase() === 'cancel') {
        resolve({ confirmed: false, supplement: '' });
      } else {
        resolve({ confirmed: true, supplement: trimmed });
      }
    });
  });
}

async function promptProceedToPlan() {
  if (!process.stdin.isTTY) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question('是否继续生成计划并分解任务？(y/n) ', answer => {
      rl.close();
      resolve(/^[Yy]/.test(answer.trim()));
    });
  });
}

// ─── Go Output ────────────────────────────────────────────

function ensureGoDir() {
  const goDir = path.join(assets.projectRoot, '.claude-coder', GO_DIR_NAME);
  if (!fs.existsSync(goDir)) fs.mkdirSync(goDir, { recursive: true });
  return goDir;
}

function writeGoFile(content) {
  const goDir = ensureGoDir();
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
  const fileName = `go_${ts}.md`;
  const filePath = path.join(goDir, fileName);
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

// ─── Main Entry ──────────────────────────────────────────

async function executeGo(engine, input, opts = {}) {
  const instruction = input || '';

  const displayModel = opts.model || engine.config.model || '(default)';
  log('ok', `模型配置已加载: ${engine.config.provider || 'claude'} (go 使用: ${displayModel})`);

  if (opts.reset) {
    saveGoState({});
    log('ok', 'Go 记忆已重置');
    return;
  }

  if (opts.readFile) {
    const reqPath = path.resolve(assets.projectRoot, opts.readFile);
    if (!fs.existsSync(reqPath)) {
      log('error', `文件不存在: ${reqPath}`);
      process.exit(1);
    }
    opts.reqFile = reqPath;
    log('info', `需求文件: ${reqPath}`);
  }

  const isAutoMode = !!(instruction || opts.reqFile);
  const mode = isAutoMode ? '自动' : '对话';
  log('info', `Go 模式: ${mode}`);

  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);

  const result = await engine.runSession('go', {
    logFileName: `go_${ts}.log`,
    label: isAutoMode ? 'go_auto' : 'go_dialogue',

    async execute(session) {
      log('info', isAutoMode ? '正在分析需求并组装方案...' : '正在启动对话式需求收集...');

      const prompt = buildGoPrompt(instruction, opts);
      const queryOpts = engine.buildQueryOptions(opts);
      queryOpts.systemPrompt = buildSystemPrompt('go');
      queryOpts.permissionMode = 'plan';
      queryOpts.hooks = session.hooks;
      queryOpts.abortController = session.abortController;

      if (isAutoMode) {
        queryOpts.disallowedTools = ['askUserQuestion'];
      }

      const { messages } = await session.runQuery(prompt, queryOpts);
      const content = extractGoContent(messages);

      return { content, collected: messages };
    },
  });

  if (!result.content) {
    log('error', '无法从 AI 输出中提取方案内容');
    log('info', '请检查日志文件了解详情');
    return;
  }

  const { confirmed, supplement } = await previewAndConfirm(result.content);
  if (!confirmed) {
    log('info', '已取消');
    return;
  }

  let finalContent = result.content;
  if (supplement) {
    finalContent += `\n\n## 补充要求\n\n${supplement}`;
  }

  const filePath = writeGoFile(finalContent);
  log('ok', `方案已保存: ${filePath}`);

  const domain = extractDomainFromContent(finalContent);
  const components = extractComponentsFromContent(finalContent);
  const history = (loadGoState().history || []).slice(-9);
  history.push({
    timestamp: new Date().toISOString(),
    requirement: instruction || opts.reqFile || '(对话收集)',
    file: filePath,
    domain,
  });

  saveGoState({
    lastFile: filePath,
    lastDomain: domain,
    lastComponents: components,
    lastTimestamp: new Date().toISOString(),
    history,
  });

  console.log('');
  const shouldPlan = await promptProceedToPlan();
  if (shouldPlan) {
    log('info', '开始生成计划并分解任务...');
    await engine.plan('', { reqFile: filePath });
  } else {
    log('info', `方案已保存，稍后可使用: claude-coder plan -r ${filePath}`);
  }
}

module.exports = { executeGo };
