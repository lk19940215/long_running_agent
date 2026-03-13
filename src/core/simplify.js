"use strict";

const { runSession } = require("./base");
const { buildQueryOptions } = require("./query");
const { log } = require("../common/config");
const { assets } = require("../common/assets");
const { execSync } = require("child_process");

async function _runSimplifySession(n = 3, focus = null, opts = {}) {
  const projectRoot = assets.projectRoot;
  let diff = "";
  try {
    diff = execSync(`git diff HEAD~${n}..HEAD`, {
      cwd: projectRoot,
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
    });
  } catch (err) {
    log("warn", `无法获取最近 ${n} 个 commit 的 diff: ${err.message}`);
  }

  const focusLine = focus ? `\n审查聚焦方向：${focus}` : "";
  const tasksPath = assets.path('tasks');
  const taskLine = tasksPath ? `\n任务文件: ${tasksPath}（可读取了解当前项目任务上下文）` : '';
  const prompt = `/simplify\n\n审查范围：最近 ${n} 个 commit${taskLine}${focusLine}\n\n${diff.slice(0, 50000)}`;
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  return runSession("simplify", {
    opts,
    sessionNum: 0,
    logFileName: `simplify_${dateStr}.log`,
    label: "simplify",

    async execute(sdk, ctx) {
      log("info", `正在审查最近 ${n} 个 commit 的代码变更...`);

      const queryOpts = buildQueryOptions(ctx.config, opts);
      queryOpts.hooks = ctx.hooks;
      queryOpts.abortController = ctx.abortController;

      await ctx.runQuery(sdk, prompt, queryOpts);
      log("ok", "代码审查完成");

      return {};
    },
  });
}

async function simplify(focus = null, opts = {}) {
  assets.ensureDirs();
  const n = opts.n || 3;
  return _runSimplifySession(n, focus, opts);
}

module.exports = {
  simplify,
  _runSimplifySession,
};
