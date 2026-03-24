/**
 * 最小 AI Coding Agent
 *
 * 整个 Agent 的核心就是一个 while 循环:
 *   1. 用户输入 → 加入 messages
 *   2. 调用 LLM → 拿到响应
 *   3. 如果 stop_reason 是 tool_use → 执行工具 → 结果加入 messages → 回到 2
 *   4. 如果 stop_reason 是 end_turn → 输出文本 → 回到 1
 *
 * 运行: node agent.mjs
 * 前提: .env 文件中配置 ANTHROPIC_API_KEY
 */

import { config } from 'dotenv';
config();

import Anthropic from '@anthropic-ai/sdk';
import * as readline from 'readline';
import { toolSchemas, executeTool } from './tools.mjs';

const API_KEY = process.env.ANTHROPIC_API_KEY;
const BASE_URL = process.env.BASE_URL;
const DEFAULT_MODEL = process.env.DEFAULT_MODEL;
const FALLBACK_MODEL = process.env.FALLBACK_MODEL;
const client = new Anthropic({ apiKey: API_KEY, baseURL: BASE_URL });

const SYSTEM_PROMPT = `你是一个 AI 编程助手。你可以使用工具来读取文件、写入文件、执行命令。

工作流程:
1. 先用 read_file 或 execute_bash 了解情况
2. 制定计划并告知用户
3. 用 write_file 修改代码，用 execute_bash 验证
4. 汇报结果

规则:
- 修改文件前先读取当前内容
- 不要执行危险命令（rm -rf /、sudo 等）
- 每步操作说明原因`;

// ─── 颜色 ────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  dim:   '\x1b[2m',
  cyan:  '\x1b[36m',
  green: '\x1b[32m',
  yellow:'\x1b[33m',
};


// ─── Agent Loop ──────────────────────────────────────────
async function main() {
  const messages = [];
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(resolve => rl.question(q, resolve));

  console.log(`\n${C.cyan}═══ 最小 AI Coding Agent ═══${C.reset}`);
  console.log(`${C.dim}模型: ${MODEL} | 工具: ${toolSchemas.map(t => t.name).join(', ')}${C.reset}`);
  console.log(`${C.dim}输入 exit 退出${C.reset}\n`);

  let stopReason = null;

  while (true) {
    // ── 步骤 1: 获取用户输入（仅在非工具调用轮）──
    if (stopReason !== 'tool_use') {
      const input = await ask(`${C.green}你: ${C.reset}`);
      if (!input || input.trim() === 'exit') break;
      messages.push({ role: 'user', content: input });
    }

    // ── 步骤 2: 调用 LLM ──
    let response;
    try {
      response = await client.messages.create({
        model: DEFAULT_MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: toolSchemas,
        messages,
      });
    } catch (e) {
      console.error(`\n${C.yellow}API 错误: ${e.message}${C.reset}\n`);
      stopReason = null;
      continue;
    }

    // 将 assistant 响应加入历史
    messages.push({ role: 'assistant', content: response.content });
    stopReason = response.stop_reason;

    // ── 步骤 3: 处理响应 ──
    const toolResults = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        // 文本输出 → 显示给用户
        console.log(`\n${C.cyan}Agent:${C.reset} ${block.text}\n`);

      } else if (block.type === 'tool_use') {
        // 工具调用 → 执行并收集结果
        const inputStr = JSON.stringify(block.input);
        console.log(`  ${C.dim}[工具] ${block.name}(${inputStr.substring(0, 120)})${C.reset}`);

        const result = await executeTool(block.name, block.input);

        // 截断过长的结果（保护上下文窗口）
        const MAX = 8000;
        const truncated = result.length > MAX
          ? result.substring(0, MAX) + `\n... [截断，共 ${result.length} 字符]`
          : result;

        console.log(`  ${C.dim}[结果] ${truncated.substring(0, 200)}${truncated.length > 200 ? '...' : ''}${C.reset}`);

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: truncated,
        });
      }
    }

    // ── 步骤 4: 工具结果送回 LLM ──
    // tool_result 必须在 role: 'user' 下，这是 API 协议规定
    if (toolResults.length > 0) {
      messages.push({ role: 'user', content: toolResults });
      // stopReason 仍然是 'tool_use'，循环会跳过用户输入，直接再次调用 LLM
    }
  }

  rl.close();
  console.log(`\n${C.dim}再见！${C.reset}\n`);
}

main();
