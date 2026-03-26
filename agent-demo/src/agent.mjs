/**
 * AI Coding Agent - 主循环
 *
 * 整体流程:
 *   while(true) {
 *     1. 等待用户输入 → 加入 messages
 *     2. 调 LLM（带 tools + messages 历史）→ 阻塞等待响应
 *     3. 遍历响应内容:
 *        - text → 显示给用户
 *        - tool_use → 执行工具 → 收集结果
 *     4. 如果有工具结果 → 加入 messages → 跳过用户输入 → 回到 2（工具循环）
 *        如果没有工具结果（end_turn）→ 回到 1（等用户）
 *   }
 *
 * 显示层使用 Ink（React for CLI），解决原 ANSI status() 被 console.log 覆盖的问题
 *
 * 运行: npm start
 * 恢复会话: RESUME_FILE=logs/xxx-messages.json npm start
 */

import Anthropic from '@anthropic-ai/sdk';

import { API_KEY, BASE_URL, DEFAULT_MODEL, MAX_TOKENS, DEBUG, SYSTEM_PROMPT, RESUME_FILE } from './config.mjs';
import { toolSchemas, executeTool } from './tools/index.mjs';
import { createDisplay } from './core/ink.mjs';
import { Logger } from './core/logger.mjs';
import { Messages } from './core/messages.mjs';

// ─── 常量定义 ─────────────────────────────────────────────
const MAX_TOOL_RESULT_LENGTH = 8000;  // 工具结果最大长度，防止上下文窗口溢出

// ─── 工具函数 ─────────────────────────────────────────────
/**
 * 判断是否需要等待用户输入
 * @param {string|null} stopReason - 停止原因
 * @returns {boolean} - true 表示需要等待用户输入
 */
function shouldWaitForUser(stopReason) {
  return stopReason !== 'tool_use' && stopReason !== 'max_tokens';
}

function toolResultPreview(name, result) {
  if (!result || result.startsWith('错误') || result.startsWith('rg:')) return result.substring(0, 60);
  if (name === 'read') {
    const lines = result.split('\n').length;
    return `${lines} 行`;
  }
  if (name === 'grep') {
    const matches = result.split('\n').filter(l => l.trim()).length;
    return `${matches} 处匹配`;
  }
  if (name === 'glob' || name === 'ls') {
    const files = result.split('\n').filter(l => l.trim()).length;
    return `${files} 个文件`;
  }
  if (name === 'edit') return result;
  if (name === 'write') return result;
  if (name === 'symbols') {
    const firstLine = result.split('\n')[0] || '';
    return firstLine;
  }
  if (name === 'bash') return result.split('\n')[0]?.substring(0, 60) || '';
  return '';
}

function toolInputPreview(name, input) {
  if (name === 'read') return input.path;
  if (name === 'write') return `${input.path} (${input.content?.length || 0} 字符)`;
  if (name === 'edit') return input.path;
  if (name === 'grep') return `/${input.pattern}/${input.include ? ` ${input.include}` : ''}`;
  if (name === 'glob') return input.pattern;
  if (name === 'ls') return input.path || '.';
  if (name === 'symbols') return `${input.mode} ${input.path}${input.name ? ` → ${input.name}` : ''}`;
  if (name === 'bash') return `$ ${input.command?.substring(0, 80)}`;
  return JSON.stringify(input).substring(0, 80);
}

// ─── 初始化 ───────────────────────────────────────────────
const client = new Anthropic({ apiKey: API_KEY, baseURL: BASE_URL });
const logger = new Logger(DEBUG, { silent: true });
const messages = new Messages();
const display = createDisplay();

async function main() {
  const logFile = logger.init();
  await messages.init(logFile);

  if (RESUME_FILE) {
    const { ok, count } = await messages.load(RESUME_FILE);
    if (ok) logger.log('会话恢复', `加载 ${count} 条历史消息`);
  }

  // Ink UI 负责终端渲染，Logger 只写文件
  display.start({
    model: DEFAULT_MODEL,
    tools: toolSchemas.map(t => t.name),
    logFile,
  });

  logger.start({
    model: DEFAULT_MODEL,
    tools: toolSchemas.map(t => t.name),
    logFile,
    systemPrompt: SYSTEM_PROMPT,
    toolSchemas,
  });

  // stopReason 驱动循环行为:
  // - 'tool_use' → 跳过用户输入，直接再调 LLM（模型还在工作）
  // - 'max_tokens' → 输出被截断，继续调 LLM 接着输出
  // - 'end_turn' 或 null → 等待用户输入
  let stopReason = null;

  while (true) {
    // ── 步骤 1: 获取用户输入（工具循环中跳过）──────────────
    if (shouldWaitForUser(stopReason)) {
      const input = await display.waitForInput();
      if (!input) break;

      display.print(`\n你: ${input}`, 'green', { bold: true });
      messages.push({ role: 'user', content: input });
    }

    if (stopReason === 'max_tokens') {
      display.print('⚡ 输出被截断，继续请求...', 'yellow');
    }

    display.status('thinking');

    logger.log('请求参数', {
      max_tokens: MAX_TOKENS,
      baseURL: BASE_URL || 'default',
      messages数量: messages.length,
    });

    let response;
    try {
      // ── 步骤 2: 调用 LLM（流式）──────────────────────────
      // stream() 逐 token 接收，text 事件实时显示
      // finalMessage() 拿到和 create() 相同结构的完整 response
      const stream = client.messages.stream({
        model: DEFAULT_MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        tools: toolSchemas,
        messages: messages.current,
      });

      // 监听原始流事件，区分 thinking / text / tool_use
      stream.on('streamEvent', (event) => {
        if (event.type === 'content_block_start') {
          const t = event.content_block.type;
          if (t === 'thinking') display.startStream('thinking');
          else if (t === 'text') display.startStream('text');
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'thinking_delta') {
            display.appendText(event.delta.thinking);
          } else if (event.delta.type === 'text_delta') {
            display.appendText(event.delta.text);
          }
        } else if (event.type === 'content_block_stop') {
          display.finishStream();
        }
      });

      response = await stream.finalMessage();
    } catch (e) {
      display.status('error');
      display.print(`❌ 请求失败: ${e.message}`, 'red');
      logger.log('错误', e.message);
      stopReason = null;
      continue;
    }

    logger.log('响应内容', response);

    // 将 AI 响应加入历史（包含 text 和/或 tool_use blocks）
    messages.push({ role: 'assistant', content: response.content });
    stopReason = response.stop_reason;

    // ── 步骤 3: 处理响应内容 ──────────────────────────────
    const toolResults = [];

    for (const block of response.content) {
      // text 已在流式阶段显示，不需要再 print
      if (block.type === 'tool_use') {
        display.status('calling');
        display.toolStart(block.name, toolInputPreview(block.name, block.input));
        logger.log(`工具开始: ${block.name}`, block.input);

        const result = await executeTool(block.name, block.input);

        const truncated = result.length > MAX_TOOL_RESULT_LENGTH
          ? result.substring(0, MAX_TOOL_RESULT_LENGTH) + `\n... [截断，共 ${result.length} 字符]`
          : result;

        const isError = /^(错误|失败|编辑失败|写入失败|列出失败|搜索失败|rg:)/.test(result);
        display.toolEnd(block.name, result.length, toolResultPreview(block.name, result), !isError);
        logger.log(`工具完成: ${block.name}`, truncated);

        // tool_result 的 tool_use_id 必须匹配 tool_use 的 id（API 协议要求）
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: truncated,
        });
      }
    }

    // ── 步骤 4: 工具结果送回 → 决定下一轮行为 ──────────────
    if (toolResults.length > 0) {
      // 有工具结果 → 作为 user 消息送回（API 协议：tool_result 必须在 user 角色下）
      // stopReason 仍是 'tool_use'，下一轮会跳过用户输入，直接再调 LLM
      messages.push({ role: 'user', content: toolResults });
    } else if (shouldWaitForUser(stopReason)) {
      display.status('done');
    }
  }

  display.destroy();
}

main();
