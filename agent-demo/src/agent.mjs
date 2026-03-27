/**
 * AI Coding Agent — 支持交互模式和 headless 模式
 *
 * 交互模式:  npm start                           (Ink UI + 流式输出)
 * Headless:  node src/agent.mjs -p "任务描述"      (console 输出)
 */

import { API_KEY, BASE_URL, DEFAULT_MODEL, MAX_TOKENS, DEBUG, SYSTEM_PROMPT, RESUME_FILE } from './config.mjs';
import { AgentCore } from './core/agent-core.mjs';
import { Logger } from './core/logger.mjs';
import { Messages } from './core/messages.mjs';
import { taskEvents } from './tools/task.mjs';

// ─── Preview 函数 ─────────────────────────────────────────

function toolResultPreview(name, result) {
  if (!result || result.startsWith('错误') || result.startsWith('rg:')) return result.substring(0, 60);
  if (name === 'read') return `${result.split('\n').length} 行`;
  if (name === 'grep') return `${result.split('\n').filter(l => l.trim()).length} 处匹配`;
  if (name === 'glob' || name === 'ls') return `${result.split('\n').filter(l => l.trim()).length} 个文件`;
  if (name === 'edit' || name === 'multi_edit') return result;
  if (name === 'write') return result;
  if (name === 'symbols') return result.split('\n')[0] || '';
  if (name === 'bash') return result.split('\n')[0]?.substring(0, 60) || '';
  if (name === 'task') return result.split('\n')[0]?.substring(0, 80) || '';
  return '';
}

function toolInputPreview(name, input) {
  if (name === 'read') return input.path;
  if (name === 'write') return `${input.path} (${input.content?.length || 0} 字符)`;
  if (name === 'edit') return input.path;
  if (name === 'multi_edit') return `${input.path} (${input.edits?.length || 0} 处)`;
  if (name === 'grep') return `/${input.pattern}/${input.include ? ` ${input.include}` : ''}`;
  if (name === 'glob') return input.pattern;
  if (name === 'ls') return input.path || '.';
  if (name === 'symbols') return `${input.mode} ${input.path}${input.name ? ` → ${input.name}` : ''}`;
  if (name === 'bash') return `$ ${input.command?.substring(0, 80)}`;
  if (name === 'task') return input.description?.substring(0, 60) || '';
  return JSON.stringify(input).substring(0, 80);
}

// ─── 共用初始化 ──────────────────────────────────────────────

async function setup() {
  const logger = new Logger(DEBUG, { silent: true });
  const messages = new Messages();
  const agent = new AgentCore({
    apiKey: API_KEY, baseURL: BASE_URL, model: DEFAULT_MODEL,
    maxTokens: MAX_TOKENS, systemPrompt: SYSTEM_PROMPT, logger,
  });

  const logFile = logger.init();
  await messages.init(logFile);

  if (RESUME_FILE) {
    const { ok, count } = await messages.load(RESUME_FILE);
    if (ok) logger.log('会话恢复', `加载 ${count} 条历史消息`);
  }

  logger.start({ systemPrompt: SYSTEM_PROMPT, toolSchemas: agent.toolSchemas });
  return { agent, logger, messages, logFile };
}

// ─── 构建 UI 回调 ────────────────────────────────────────────

function buildInkCallbacks(display) {
  taskEvents.on('tool', ({ step, name }) => {
    display.print(`    ↳ SubAgent [${step}] ${name}`, 'magenta');
  });

  return {
    status(state) { display.status(state); },
    toolStart(name, input) {
      if (name === 'task') display.status('sub-agent');
      display.toolStart(name, toolInputPreview(name, input));
    },
    toolEnd(name, result, success) {
      display.toolEnd(name, result.length, toolResultPreview(name, result), success);
    },
    blockStart(type) { display.startStream(type); },
    blockEnd() { display.finishStream(); },
    text(chunk) { display.appendText(chunk); },
    thinking(chunk) { display.appendText(chunk); },
    error(e) { display.print(`❌ 请求失败: ${e.message}`, 'red'); },
  };
}

function buildConsoleCallbacks() {
  taskEvents.on('tool', ({ step, name }) => {
    process.stdout.write(`  ↳ SubAgent [${step}] ${name}\n`);
  });

  return {
    toolStart(name, input) {
      process.stdout.write(`  ⚡ ${name} → ${toolInputPreview(name, input)}\n`);
    },
    toolEnd(name, result, success) {
      process.stdout.write(`  ${success ? '✓' : '✗'} ${name} (${result.length} 字符)\n`);
    },
    text(chunk) { process.stdout.write(chunk); },
  };
}

// ─── 入口 ───────────────────────────────────────────────────

async function main() {
  const pIdx = process.argv.indexOf('-p');
  const prompt = pIdx !== -1 ? process.argv[pIdx + 1] : null;

  const { agent, logger, messages, logFile } = await setup();

  if (prompt) {
    console.log(`模型: ${DEFAULT_MODEL} | 日志: ${logFile}\n输入: ${prompt}\n`);
    logger.round(prompt);

    const trace = await agent.run(prompt, { messages, stream: true, on: buildConsoleCallbacks() });

    console.log(`\n── 完成 ──`);
    console.log(`轮次: ${trace.turns} | 工具: ${trace.toolCalls.map(t => t.name).join(', ') || '无'}`);
    console.log(`Token: ${trace.tokens.input}+${trace.tokens.output}`);
  } else {
    const { createDisplay } = await import('./core/ink.mjs');
    const display = createDisplay();
    const on = buildInkCallbacks(display);

    display.start({ model: DEFAULT_MODEL, tools: agent.toolSchemas.map(t => t.name), logFile });

    while (true) {
      const input = await display.waitForInput();
      if (!input) break;
      display.print(`\n你: ${input}`, 'green', { bold: true });
      logger.round(input);
      await agent.run(input, { messages, stream: true, on });
    }

    display.destroy();
  }
}

main();
