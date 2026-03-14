'use strict';

const { loadSDK } = require('../common/sdk');
const { writeSessionSeparator } = require('../common/logging');
const { SessionContext } = require('./context');

/**
 * 通用 Session 执行器
 * @param {string} type - session 类型
 * @param {object} config - 配置
 * @param {object} [config.externalCtx] - 外部传入的 SessionContext（共享日志和 indicator）
 */
async function runSession(type, config) {
  const sdk = await loadSDK();
  const ctx = config.externalCtx || new SessionContext(type, config.opts);

  if (!config.externalCtx) {
    ctx.initLogging(config.logFileName, config.logStream);
    writeSessionSeparator(ctx.logStream, config.sessionNum || 0, config.label);
  }

  const stallTimeoutMin = ctx.initHooks(type);
  ctx.startIndicator(config.sessionNum || 0, stallTimeoutMin);

  try {
    const result = await config.execute(sdk, ctx);
    if (config.onSuccess) {
      await config.onSuccess(result, ctx);
    }
    // 只有非外部 ctx 才执行 finish
    if (!config.externalCtx) {
      ctx.finish();
    }
    return {
      exitCode: ctx.isStalled() ? 2 : 0,
      logFile: ctx.logFile,
      stalled: ctx.isStalled(),
      ...result,
    };
  } catch (err) {
    if (config.onError) {
      try { config.onError(err, ctx); } catch { /* ignore callback errors */ }
    }
    if (!config.externalCtx) {
      ctx.errorFinish(err);
    }
    return {
      exitCode: 1,
      error: err.message,
      logFile: ctx.logFile,
    };
  }
}

module.exports = {
  runSession,
};