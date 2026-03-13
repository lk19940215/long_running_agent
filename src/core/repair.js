'use strict';

const fs = require('fs');
const path = require('path');
const { runSession } = require('./base');
const { buildQueryOptions } = require('./query');
const { log } = require('../common/config');

/**
 * 通用 AI 文件修复/维护工具
 * 可嵌入 runner.js、plan.js 及任何需要 AI 修复文件的场景
 *
 * @param {string} filePath - 待修复文件的绝对路径
 * @param {object} [opts] - 选项
 * @param {string} [opts.prompt] - 自定义 prompt（省略则使用默认 JSON 修复 prompt）
 * @param {string} [opts.model] - 模型覆盖
 * @returns {Promise<{success: boolean}>}
 */
async function repairFile(filePath, opts = {}) {
  if (!fs.existsSync(filePath)) {
    log('error', `修复目标不存在: ${filePath}`);
    return { success: false };
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const filename = path.basename(filePath);

  const defaultPrompt = `以下文件出现格式错误，请修复并用 Write 工具写回原路径。
只修复格式问题（JSON 语法、截断、尾逗号等），不改变数据内容。

文件路径: ${filePath}
当前内容:
\`\`\`
${content.slice(0, 30000)}
\`\`\`

修复后用 Write 写回 ${filePath}`;

  const prompt = opts.prompt || defaultPrompt;
  const ts = Date.now();

  return runSession('repair', {
    opts,
    sessionNum: 0,
    logFileName: `repair_${filename}_${ts}.log`,
    label: `repair ${filename}`,

    async execute(sdk, ctx) {
      const queryOpts = buildQueryOptions(ctx.config, opts);
      queryOpts.hooks = ctx.hooks;
      queryOpts.abortController = ctx.abortController;
      await ctx.runQuery(sdk, prompt, queryOpts);
      return { success: true };
    },
  });
}

module.exports = { repairFile };
