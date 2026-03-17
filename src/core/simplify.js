'use strict';

const { log } = require('../common/config');
const { assets } = require('../common/assets');
const { Session } = require('./session');
const { execSync } = require('child_process');

const AUTO_COMMIT_MSG = 'style: auto simplify';

function getSmartDiffRange(projectRoot, fallbackN) {
  try {
    const hash = execSync(
      `git log --grep='${AUTO_COMMIT_MSG}' -1 --format='%H'`,
      { cwd: projectRoot, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
    ).trim();
    if (hash) return { range: `${hash}..HEAD`, label: `自上次 auto simplify 以来` };
  } catch { /* ignore */ }
  return { range: `HEAD~${fallbackN}..HEAD`, label: `最近 ${fallbackN} 个 commit` };
}

function commitIfDirty(projectRoot) {
  try {
    execSync('git diff --quiet HEAD', { cwd: projectRoot, stdio: 'pipe' });
  } catch {
    execSync(`git add -A && git commit -m "${AUTO_COMMIT_MSG}"`, { cwd: projectRoot, stdio: 'pipe' });
    log('ok', `代码优化已提交: ${AUTO_COMMIT_MSG}`);
  }
}

async function executeSimplify(config, focus = null, opts = {}) {
  const n = opts.n || 3;
  const projectRoot = assets.projectRoot;

  const { range, label } = getSmartDiffRange(projectRoot, n);

  let diff = '';
  try {
    diff = execSync(`git diff ${range}`, { cwd: projectRoot, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
  } catch (err) {
    log('warn', `无法获取 diff (${label}): ${err.message}`);
  }

  if (!diff.trim()) {
    log('info', `无变更需要审查 (${label})`);
    return { success: true };
  }

  const focusLine = focus ? `\n审查聚焦方向：${focus}` : '';
  const prompt = `/simplify\n\n审查范围：${label}${focusLine}\n\n${diff.slice(0, 50000)}`;
  const dateStr = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);

  const result = await Session.run('simplify', config, {
    logFileName: `simplify_${dateStr}.log`,
    label: 'simplify',

    async execute(session) {
      log('info', `正在审查代码变更 (${label})...`);

      const queryOpts = session.buildQueryOptions(opts);
      queryOpts.disallowedTools = ['askUserQuestion'];

      await session.runQuery(prompt, queryOpts);
      log('ok', '代码审查完成');

      return {};
    },
  });

  commitIfDirty(projectRoot);

  return result;
}

module.exports = { executeSimplify };
