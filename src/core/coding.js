'use strict';

const { buildSystemPrompt, buildCodingContext } = require('./prompts');
const { Session } = require('./session');
const { log } = require('../common/display');

async function executeCoding(config, sessionNum, opts = {}) {
  const taskId = opts.taskId || 'unknown';
  const dateStr = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);

  return Session.run('coding', config, {
    sessionNum,
    logFileName: `${taskId}_session_${sessionNum}_${dateStr}.log`,
    label: `coding task=${taskId}`,

    async execute(session) {
      const prompt = buildCodingContext(sessionNum, opts);
      const queryOpts = session.buildQueryOptions(opts);
      queryOpts.systemPrompt = buildSystemPrompt('coding');
      queryOpts.disallowedTools = ['askUserQuestion'];

      const { subtype, cost, usage } = await session.runQuery(prompt, queryOpts, {
        continue: true,
      });

      if (subtype && subtype !== 'success' && subtype !== 'unknown') {
        log('warn', `session 结束原因: ${subtype}`);
      }

      return { cost, tokenUsage: usage, subtype: subtype || 'unknown' };
    },
  });
}

module.exports = { executeCoding };
