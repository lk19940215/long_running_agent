'use strict';

const { runSession } = require('./base');
const { buildQueryOptions } = require('./query');
const { log, getProjectRoot, ensureLoopDir } = require('../common/config');
const { execSync } = require('child_process');

/**
 * 内部：运行代码审查 Session
 */
async function _runSimplifySession(n = 3, focus = null, opts = {}) {
  const projectRoot = getProjectRoot();
  let diff = '';
  try {
    diff = execSync(`git diff HEAD~${n}..HEAD`, { cwd: projectRoot, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
  } catch (err) {
    log('warn', `无法获取最近 ${n} 个 commit 的 diff: ${err.message}`);
  }

  const focusLine = focus ? `\n审查聚焦方向：${focus}` : '';
  const prompt = `/simplify\n\n审查范围：最近 ${n} 个 commit${focusLine}\n\n${diff.slice(0, 50000)}`;
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  return runSession('simplify', {
    opts,
    sessionNum: 0,
    logFileName: `simplify_${dateStr}.log`,
    label: 'simplify',

    async execute(sdk, ctx) {
      log('info', `正在审查最近 ${n} 个 commit 的代码变更...`);

      const queryOpts = buildQueryOptions(ctx.config, opts);
      queryOpts.maxTurns = 1;
      queryOpts.hooks = ctx.hooks;
      queryOpts.abortController = ctx.abortController;

      await ctx.runQuery(sdk, prompt, queryOpts);
      log('ok', '代码审查完成');

      return {};
    },
  });
}

/**
 * 对外 API：代码审查
 * @param {string|null} focus - 审查聚焦方向（如 "内存效率"）
 * @param {object} opts - 选项，opts.n 为 commit 数量（默认 3）
 */
async function simplify(focus = null, opts = {}) {
  ensureLoopDir();
  const n = opts.n || 3;
  return _runSimplifySession(n, focus, opts);
}

module.exports = {
  simplify,
  _runSimplifySession,
};