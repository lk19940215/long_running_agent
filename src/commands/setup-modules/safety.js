'use strict';

const { log, COLOR } = require('../../common/display');
const { updateEnvVar } = require('../../common/config');
const { ask } = require('./helpers');

// ── 安全限制配置 ──

async function updateSafetyLimits(rl, existing) {
  const currentStall = existing.SESSION_STALL_TIMEOUT || '600';
  const currentTurns = existing.SESSION_MAX_TURNS || '0';

  console.log(`${COLOR.blue}当前安全限制:${COLOR.reset}`);
  console.log(`  停顿超时:     ${currentStall} 秒 (${Math.floor(parseInt(currentStall) / 60)} 分钟)`);
  console.log(`  最大工具轮次: ${currentTurns === '0' ? '无限制' : currentTurns}`);
  console.log('');
  console.log(`${COLOR.yellow}说明:${COLOR.reset}`);
  console.log('  完成检测 — 通过 SDK Stop hook 感知模型结束，无需额外超时');
  console.log('  停顿超时 — 长时间无工具调用时自动中断（通用兜底）');
  console.log('  最大轮次 — 限制总轮次，仅 CI 推荐（默认 0 = 无限制）');
  console.log('');

  const stallInput = await ask(rl, `停顿超时秒数（回车保留 ${currentStall}）: `);
  if (stallInput.trim()) {
    const seconds = parseInt(stallInput.trim(), 10);
    if (isNaN(seconds) || seconds < 60) {
      log('warn', '停顿超时需 >= 60 秒，跳过');
    } else {
      updateEnvVar('SESSION_STALL_TIMEOUT', String(seconds));
      log('ok', `停顿超时已设置为 ${seconds} 秒 (${Math.floor(seconds / 60)} 分钟)`);
    }
  }

  console.log('');
  const turnsInput = await ask(rl, `最大工具轮次（回车保留 ${currentTurns === '0' ? '无限制' : currentTurns}，输入 0 = 无限制）: `);
  if (turnsInput.trim()) {
    const turns = parseInt(turnsInput.trim(), 10);
    if (isNaN(turns) || turns < 0) {
      log('warn', '请输入 >= 0 的整数，跳过');
    } else {
      updateEnvVar('SESSION_MAX_TURNS', String(turns));
      log('ok', `最大工具轮次已设置为 ${turns === 0 ? '无限制' : turns}`);
    }
  }
}

module.exports = {
  updateSafetyLimits,
};