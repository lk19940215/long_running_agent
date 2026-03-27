/**
 * task 工具 — SubAgent 入口
 *
 * 父 Agent 通过 task 委派子任务给 SubAgent。
 * SubAgent: 独立上下文 + 受限只读工具 + batch 模式
 *
 * 通过 taskEvents 向父 Agent 发送进度事件：
 *   'start'   — SubAgent 开始
 *   'tool'    — SubAgent 调用工具
 *   'done'    — SubAgent 完成
 */

import { EventEmitter } from "events";
import { define, registry } from "./registry.mjs";
import { AgentCore } from "../core/agent-core.mjs";
import { Logger } from "../core/logger.mjs";
import {
  API_KEY,
  BASE_URL,
  DEFAULT_MODEL,
  MAX_TOKENS,
  DEBUG,
} from "../config.mjs";

export const taskEvents = new EventEmitter();

const SUB_TOOLS = ["read", "grep", "glob", "ls", "symbols"];
const SUB_MAX_TURNS = 12;

function buildPrompt(description) {
  return `你是一个专注的子任务代理。只读工具，不能修改文件。

任务: ${description}

你可以在一次响应中调用多个工具。批量发起搜索，不要等一个结果再决定下一步。

策略:
- 一次 grep 优于多次。用 | 组合模式
- glob/ls 了解结构，可与 grep 并行
- read 仅在需要完整上下文时用
- grep 结果已含匹配行，无需再 read
- 直接给结论`;
}

define(
  "task",
  "委派子任务给 SubAgent。独立上下文，只读工具集。适合调研、搜索、代码分析。搜索关键字或多文件分析时优先使用。",
  {
    description: {
      type: "string",
      description: "子任务描述",
    },
    prompt: {
      type: "string",
      description: "给 SubAgent 的具体指令",
    },
  },
  ["description", "prompt"],
  async ({ description, prompt }) => {
    const tools = SUB_TOOLS.filter((n) => registry[n]).map(
      (n) => registry[n].schema,
    );

    const executor = async (name, input) => {
      const tool = registry[name];
      if (!tool || !SUB_TOOLS.includes(name))
        return `SubAgent 不允许使用工具: ${name}`;
      return await tool.execute(input);
    };

    const logger = DEBUG ? new Logger(true, { silent: true }) : null;
    logger?.init("sub-agent");

    const systemPrompt = buildPrompt(description);

    const subAgent = new AgentCore({
      apiKey: API_KEY,
      baseURL: BASE_URL,
      model: DEFAULT_MODEL,
      maxTokens: MAX_TOKENS,
      systemPrompt,
      tools,
      executor,
      logger,
    });

    logger?.start({
      systemPrompt,
      toolSchemas: subAgent.toolSchemas,
    });

    logger?.round(prompt);
    taskEvents.emit("start", { description });

    let stepCount = 0;
    const trace = await subAgent.run(prompt, {
      maxTurns: SUB_MAX_TURNS,
      on: {
        toolStart(name, input) {
          stepCount++;
          taskEvents.emit("tool", { step: stepCount, name, input });
        },
      },
    });
    taskEvents.emit("done", { toolCalls: trace.toolCalls.length, description });

    if (trace.stopReason === "error")
      return `SubAgent 执行失败: ${trace.error}`;

    const toolNames = [...new Set(trace.toolCalls.map((t) => t.name))].join(
      ", ",
    );
    const summary =
      trace.toolCalls.length > 0
        ? `\n[SubAgent 调用 ${trace.toolCalls.length} 次工具: ${toolNames}]`
        : "";

    return (trace.finalText || "无结果") + summary;
  },
);
