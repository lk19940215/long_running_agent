'use strict';

const fs = require('fs');
const path = require('path');
const { log } = require('../common/config');
const { Session } = require('./session');

async function executeRepair(config, filePath, opts = {}) {
  if (!fs.existsSync(filePath)) return;

  const rawContent = fs.readFileSync(filePath, 'utf8');
  if (!rawContent || !rawContent.trim()) return;

  const fileName = path.basename(filePath);
  log('info', `正在使用 AI 修复 ${fileName}...`);

  const prompt = `文件 ${filePath} 的 JSON 格式已损坏，请修复并用 Write 工具写入原路径。\n\n当前损坏内容：\n${rawContent}`;

  try {
    await Session.run('repair', config, {
      logFileName: `repair_${fileName.replace('.json', '')}.log`,
      label: `repair:${fileName}`,

      async execute(session) {
        const queryOpts = session.buildQueryOptions(opts);
        await session.runQuery(prompt, queryOpts);
        log('ok', `AI 修复 ${fileName} 完成`);
        return {};
      },
    });
  } catch (err) {
    log('warn', `AI 修复 ${fileName} 失败: ${err.message}`);
  }
}

module.exports = { executeRepair };
