'use strict';

const { log } = require('../common/config');
const { assets } = require('../common/assets');
const { Session } = require('./session');
const { execSync } = require('child_process');

async function executeSimplify(config, focus = null, opts = {}) {
  const n = opts.n || 3;
  const projectRoot = assets.projectRoot;
  let diff = '';
  try {
    diff = execSync(`git diff HEAD~${n}..HEAD`, { cwd: projectRoot, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
  } catch (err) {
    log('warn', `无法获取最近 ${n} 个 commit 的 diff: ${err.message}`);
  }

  const focusLine = focus ? `\n审查聚焦方向：${focus}` : '';
  const prompt = `/simplify\n\n审查范围：最近 ${n} 个 commit${focusLine}\n\n${diff.slice(0, 50000)}`;
  const dateStr = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);

  return Session.run('simplify', config, {
    logFileName: `simplify_${dateStr}.log`,
    label: 'simplify',

    async execute(session) {
      log('info', `正在审查最近 ${n} 个 commit 的代码变更...`);

      const queryOpts = session.buildQueryOptions(opts);
      queryOpts.disallowedTools = ['askUserQuestion'];

      await session.runQuery(prompt, queryOpts);
      log('ok', '代码审查完成');

      return {};
    },
  });
}

module.exports = { executeSimplify };
