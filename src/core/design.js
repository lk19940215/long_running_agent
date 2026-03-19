'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { buildSystemPrompt } = require('./prompts');
const { log } = require('../common/config');
const { assets } = require('../common/assets');
const { extractResultText } = require('../common/logging');
const { loadDesignState, saveDesignState } = require('./state');
const { Session } = require('./session');

// ─── Design File Parsing ──────────────────────────────────

const FILE_REGEX = /DESIGN_FILE\s+path=(\S+)(?:\s+desc=(.+?))?\s*\n\s*DESIGN_JSON_START\s*\n([\s\S]*?)\nDESIGN_JSON_END/g;

function collectAssistantText(collected) {
  let text = '';
  for (const msg of collected) {
    if (msg.type === 'assistant' && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === 'text' && block.text) text += block.text;
      }
    }
  }
  return text || extractResultText(collected) || '';
}

function extractDesignFiles(collected) {
  const fullText = collectAssistantText(collected);
  const files = [];
  let match;
  FILE_REGEX.lastIndex = 0;
  while ((match = FILE_REGEX.exec(fullText)) !== null) {
    const [, filePath, desc, jsonStr] = match;
    try {
      files.push({ path: filePath.trim(), desc: (desc || '').trim(), content: JSON.parse(jsonStr.trim()) });
    } catch (e) {
      log('warn', `解析 ${filePath} 的 JSON 失败: ${e.message}`);
      files.push({ path: filePath.trim(), desc: (desc || '').trim(), raw: jsonStr.trim(), error: e.message });
    }
  }
  return files;
}

// ─── Design Map ───────────────────────────────────────────

function loadDesignMap() {
  return assets.readJson('designMap', { version: 1, pages: {} });
}

function updateDesignMap(files) {
  const map = loadDesignMap();
  for (const file of files) {
    if (file.error) continue;
    if (file.path === 'system.pen') {
      map.designSystem = 'system.pen';
      continue;
    }
    const pageName = path.basename(file.path, '.pen');
    map.pages[pageName] = {
      pen: file.path,
      description: file.desc || pageName,
      lastModified: new Date().toISOString(),
    };
  }
  assets.writeJson('designMap', map);
  return map;
}

// ─── File Writing ─────────────────────────────────────────

function writeDesignFiles(files) {
  const designDir = getDesignDir();
  const written = [];
  const errors = [];

  for (const file of files) {
    const fullPath = path.join(designDir, file.path);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    if (file.error) {
      errors.push({ path: file.path, error: file.error });
      if (file.raw) fs.writeFileSync(fullPath, file.raw, 'utf8');
      continue;
    }

    fs.writeFileSync(fullPath, JSON.stringify(file.content, null, 2) + '\n', 'utf8');
    written.push({ path: file.path, desc: file.desc });
  }

  return { written, errors };
}

// ─── Design Dir ───────────────────────────────────────────

function getDesignDir() {
  const envDir = process.env.DESIGN_DIR;
  if (envDir) {
    const resolved = path.resolve(assets.projectRoot, envDir);
    if (!fs.existsSync(resolved)) fs.mkdirSync(resolved, { recursive: true });
    return resolved;
  }
  return assets.dir('design');
}

// ─── Prompt Builder ───────────────────────────────────────

function buildDesignPrompt(instruction) {
  const designDir = getDesignDir();
  const mapPath = assets.path('designMap');

  let designContext = `### 设计文件目录\n绝对路径: ${designDir}\ndesign_map.json: ${mapPath}\n\n`;

  const systemPenPath = path.join(designDir, 'system.pen');
  if (fs.existsSync(systemPenPath)) {
    designContext += `### 设计规范 (system.pen)\n已有设计规范，复用其中的变量和组件：\n\`\`\`json\n${fs.readFileSync(systemPenPath, 'utf8')}\n\`\`\`\n\n`;
  } else {
    designContext += '### 设计规范\n尚未创建 system.pen，请先生成。\n\n';
  }

  const map = loadDesignMap();
  const pageEntries = Object.entries(map.pages || {});
  if (pageEntries.length > 0) {
    designContext += '### 已有页面\n';
    for (const [name, info] of pageEntries) {
      designContext += `- **${name}**: ${info.description} (${path.join(designDir, info.pen)})\n`;
    }
    designContext += '\n';
  }

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

// ─── Preview & Confirm ────────────────────────────────────

function previewDesignFiles(files) {
  console.log('');
  console.log('┌─ 设计产物预览 ────────────────────────────────┐');
  for (const file of files) {
    const status = file.error ? '⚠ JSON 错误' : '✓';
    const desc = file.desc ? ` — ${file.desc}` : '';
    const line = `${status} ${file.path}${desc}`;
    console.log(`│ ${(line.length > 52 ? line.slice(0, 49) + '...' : line).padEnd(52)}│`);
  }
  console.log('└───────────────────────────────────────────────┘');
}

async function confirmDesign() {
  if (!process.stdin.isTTY) return { confirmed: true, supplement: '' };
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question('\n有什么要调整的？(直接回车确认 / 输入调整需求 / 输入 cancel 取消)\n> ', answer => {
      rl.close();
      const trimmed = answer.trim();
      resolve(trimmed.toLowerCase() === 'cancel'
        ? { confirmed: false, supplement: '' }
        : { confirmed: true, supplement: trimmed });
    });
  });
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

  const instruction = input || '';
  const isAutoMode = !!instruction;
  log('info', `Design 模式: ${isAutoMode ? '自动' : '对话'}`);

  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
  let currentInstruction = instruction;
  let iteration = 0;

  while (true) {
    iteration++;
    log('info', iteration === 1
      ? (isAutoMode ? '正在根据需求生成 UI 设计...' : '正在启动对话式设计...')
      : `正在根据反馈调整设计 (第 ${iteration} 轮)...`);

    const result = await Session.run('design', config, {
      logFileName: `design_${ts}_${iteration}.log`,
      label: isAutoMode ? 'design_auto' : 'design_dialogue',
      async execute(session) {
        const queryOpts = session.buildQueryOptions(opts);
        queryOpts.systemPrompt = buildSystemPrompt('design');
        queryOpts.permissionMode = 'plan';
        if (isAutoMode && iteration === 1) {
          queryOpts.disallowedTools = ['askUserQuestion'];
        }
        const { messages } = await session.runQuery(buildDesignPrompt(currentInstruction), queryOpts);
        return { files: extractDesignFiles(messages) };
      },
    });

    const files = result.files || [];
    if (files.length === 0) {
      log('error', '未能从 AI 输出中提取设计文件');
      return;
    }

    const { written, errors } = writeDesignFiles(files);
    const map = updateDesignMap(files);

    previewDesignFiles(files);
    if (errors.length > 0) log('warn', `${errors.length} 个文件存在 JSON 解析错误`);
    log('ok', `已写入 ${written.length} 个设计文件到 ${designDir}`);

    const { confirmed, supplement } = await confirmDesign();
    if (!confirmed) { log('info', '已取消'); return; }

    if (!supplement) {
      saveDesignState({
        lastFile: files[0]?.path || null,
        lastTimestamp: new Date().toISOString(),
        designDir,
        pageCount: Object.keys(map.pages || {}).length,
      });
      log('ok', '设计完成！');
      log('info', `设计目录: ${designDir}  页面: ${Object.keys(map.pages || {}).length}`);

      const firstPen = files.find(f => !f.error);
      if (firstPen) {
        log('info', `预览: cursor "${path.join(designDir, firstPen.path)}"`);
      }
      console.log('');
      log('info', '迭代调整: claude-coder design "修改xxx"');
      log('info', '生成计划: claude-coder plan');
      return;
    }

    currentInstruction = supplement;
    log('info', `收到调整需求: ${supplement}`);
  }
}

module.exports = { executeDesign };
