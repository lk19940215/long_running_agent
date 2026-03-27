/**
 * Agent Core — 纯逻辑引擎，无 UI 依赖
 *
 * API 设计对齐 @anthropic-ai/claude-agent-sdk 的 query(prompt, options) 风格：
 *   agent.run(prompt, { messages, maxTurns, stream, on: { text, thinking, ... } })
 *
 * 支持三种模式：
 * 1. 交互模式（agent.mjs）：流式输出 + UI 回调
 * 2. 评估模式（eval.mjs）：非交互，返回结构化 trace
 * 3. SubAgent 模式（task 工具）：受限工具集，独立上下文
 */

import Anthropic from '@anthropic-ai/sdk';
import { toolSchemas as defaultToolSchemas, executeTool as defaultExecuteTool } from '../tools/index.mjs';

const MAX_TOOL_RESULT_LENGTH = 8000;

export class AgentCore {
  /**
   * @param {Object} config
   * @param {string} config.apiKey
   * @param {string} config.baseURL
   * @param {string} config.model
   * @param {number} [config.maxTokens=8192]
   * @param {string} config.systemPrompt
   * @param {Logger} [config.logger]
   * @param {Array} [config.tools] - 自定义工具 schema（默认全部工具）
   * @param {Function} [config.executor] - 自定义工具执行器（默认全局 executeTool）
   */
  constructor({ apiKey, baseURL, model, maxTokens = 8192, systemPrompt, logger, tools, executor }) {
    this.client = new Anthropic({ apiKey, baseURL });
    this.model = model;
    this.maxTokens = maxTokens;
    this.systemPrompt = systemPrompt;
    this.logger = logger;
    this.toolSchemas = tools || defaultToolSchemas;
    this.executeTool = executor || defaultExecuteTool;
  }

  /**
   * 执行单轮对话（可能包含多次工具调用循环）
   *
   * @param {string} prompt - 用户输入
   * @param {Object} [options]
   * @param {Array|Messages} [options.messages=[]] - 消息存储（plain array 或 Messages 实例）
   * @param {number} [options.maxTurns=20]
   * @param {number} [options.maxToolCalls] - 总工具调用上限
   * @param {boolean} [options.stream=false]
   * @param {Object} [options.on] - 事件回调
   * @param {Function} [options.on.text] - (chunk) => void
   * @param {Function} [options.on.thinking] - (chunk) => void
   * @param {Function} [options.on.toolStart] - (name, input) => void
   * @param {Function} [options.on.toolEnd] - (name, result, success) => void
   * @param {Function} [options.on.blockStart] - (type) => void
   * @param {Function} [options.on.blockEnd] - () => void
   * @param {Function} [options.on.status] - (state) => void
   * @param {Function} [options.on.error] - (e) => void
   * @returns {Object} trace - { toolCalls, finalText, turns, tokens, stopReason }
   */
  async run(prompt, options = {}) {
    const {
      messages = [],
      maxTurns = 20,
      maxToolCalls,
      stream = false,
      temperature,
      on = {},
    } = options;

    const { toolStart, toolEnd, text, thinking, blockStart, blockEnd, status, error } = on;

    // duck typing: Messages 实例用 .current，plain array 直接用
    const msgPush = (msg) => messages.push(msg);
    const msgAll = () => messages.current ?? messages;

    const trace = {
      toolCalls: [],
      finalText: '',
      turns: 0,
      tokens: { input: 0, output: 0 },
      stopReason: null,
    };

    // 记录 run 开始前的 messages 数量，异常时回滚
    const msgCountBeforeRun = msgAll().length;
    msgPush({ role: 'user', content: prompt });

    let stopReason = 'tool_use';

    while (stopReason === 'tool_use' || stopReason === 'max_tokens') {
      if (trace.turns >= maxTurns) {
        trace.stopReason = 'max_turns';
        break;
      }
      if (maxToolCalls && trace.toolCalls.length >= maxToolCalls) {
        trace.stopReason = 'max_tool_calls';
        break;
      }

      trace.turns++;
      status?.('thinking');
      this.logger?.log('请求参数', { turn: trace.turns, messages数量: msgAll().length });

      let response;
      try {
        response = stream
          ? await this._streamCall(msgAll(), on, temperature)
          : await this._batchCall(msgAll(), temperature);
      } catch (e) {
        status?.('error');
        error?.(e);
        this.logger?.log('错误', e.message);
        const all = msgAll();
        while (all.length > msgCountBeforeRun) all.pop();
        trace.stopReason = 'error';
        trace.error = e.message;
        break;
      }

      this.logger?.log('响应内容', response);

      trace.tokens.input += response.usage?.input_tokens || 0;
      trace.tokens.output += response.usage?.output_tokens || 0;

      msgPush({ role: 'assistant', content: response.content });
      stopReason = response.stop_reason;
      trace.stopReason = stopReason;

      // 提取 text 和 tool_use
      for (const block of response.content) {
        if (block.type === 'text') trace.finalText = block.text;
      }

      const toolBlocks = response.content.filter(b => b.type === 'tool_use');
      const toolResults = [];

      if (toolBlocks.length > 0) {
        status?.('calling');

        const execOne = async (block) => {
          toolStart?.(block.name, block.input);
          this.logger?.log(`工具开始: ${block.name}`, block.input);

          const result = await this.executeTool(block.name, block.input);
          const truncated = result.length > MAX_TOOL_RESULT_LENGTH
            ? result.substring(0, MAX_TOOL_RESULT_LENGTH) + `\n... [截断，共 ${result.length} 字符]`
            : result;
          const isError = /^(错误|失败|编辑失败|写入失败|列出失败|搜索失败|rg:)/.test(result);

          trace.toolCalls.push({ name: block.name, input: block.input, resultLength: result.length, success: !isError });
          toolEnd?.(block.name, result, !isError);
          this.logger?.log(`工具完成: ${block.name}`, truncated);

          return { type: 'tool_result', tool_use_id: block.id, content: truncated };
        };

        // 模型返回多个 tool_use 即表示它们独立，无条件并行
        if (toolBlocks.length === 1) {
          toolResults.push(await execOne(toolBlocks[0]));
        } else {
          const results = await Promise.all(toolBlocks.map(execOne));
          toolResults.push(...results);
        }
      }

      if (toolResults.length > 0) {
        msgPush({ role: 'user', content: toolResults });
      } else {
        status?.('done');
      }
    }

    return trace;
  }

  async _batchCall(messages, temperature) {
    const params = {
      model: this.model,
      max_tokens: this.maxTokens,
      system: this.systemPrompt,
      tools: this.toolSchemas,
      messages,
    };
    if (temperature !== undefined) params.temperature = temperature;
    return await this.client.messages.create(params);
  }

  async _streamCall(messages, on = {}, temperature) {
    const { text, thinking, blockStart, blockEnd } = on;

    const params = {
      model: this.model,
      max_tokens: this.maxTokens,
      system: this.systemPrompt,
      tools: this.toolSchemas,
      messages,
    };
    if (temperature !== undefined) params.temperature = temperature;
    const stream = this.client.messages.stream(params);

    stream.on('streamEvent', (event) => {
      if (event.type === 'content_block_start') {
        const t = event.content_block.type;
        if (t === 'thinking') blockStart?.('thinking');
        else if (t === 'text') blockStart?.('text');
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'thinking_delta') {
          thinking?.(event.delta.thinking);
        } else if (event.delta.type === 'text_delta') {
          text?.(event.delta.text);
        }
      } else if (event.type === 'content_block_stop') {
        blockEnd?.();
      }
    });

    return await stream.finalMessage();
  }
}
