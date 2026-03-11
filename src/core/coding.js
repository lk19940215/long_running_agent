"use strict";

const { runSession } = require("./base");
const { buildQueryOptions } = require("./query");
const { buildSystemPrompt, buildCodingPrompt } = require("./prompts");
const { extractResult } = require("../common/logging");
const { log } = require("../common/config");

/**
 * 内部：运行编码 Session
 */
async function runCodingSession(sessionNum, opts = {}) {
  const taskId = opts.taskId || "unknown";
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  return runSession("coding", {
    opts,
    sessionNum,
    logFileName: `${taskId}_session_${sessionNum}_${dateStr}.log`,
    label: `coding task=${taskId}`,

    async execute(sdk, ctx) {
      const prompt = buildCodingPrompt(sessionNum, opts);
      const queryOpts = buildQueryOptions(ctx.config, opts);
      queryOpts.systemPrompt = buildSystemPrompt(false);
      queryOpts.hooks = ctx.hooks;
      queryOpts.abortController = ctx.abortController;

      const collected = await ctx.runQuery(sdk, prompt, queryOpts);
      const result = extractResult(collected);
      const subtype = result?.subtype || "unknown";

      if (subtype !== "success" && subtype !== "unknown") {
        log(
          "warn",
          `session 结束原因: ${subtype} (turns: ${result?.num_turns ?? "?"})`,
        );
      }
      if (ctx.logStream.writable) {
        ctx.logStream.write(
          `[${new Date().toISOString()}] SESSION_END subtype=${subtype} turns=${result?.num_turns ?? "?"} cost=${result?.total_cost_usd ?? "?"}\n`,
        );
      }

      return {
        cost: result?.total_cost_usd ?? null,
        tokenUsage: result?.usage ?? null,
        subtype,
      };
    },
  });
}

module.exports = { runCodingSession };
