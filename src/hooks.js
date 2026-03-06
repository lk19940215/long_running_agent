'use strict';

const { inferPhaseStep } = require('./indicator');
const { log } = require('./config');

const DEFAULT_EDIT_THRESHOLD = 30;

function logToolCall(logStream, input) {
  if (!logStream) return;
  const target = input.tool_input?.file_path || input.tool_input?.path || '';
  const cmd = input.tool_input?.command || '';
  const pattern = input.tool_input?.pattern || '';
  const detail = target || cmd.slice(0, 200) || (pattern ? `pattern: ${pattern}` : '');
  if (detail) {
    logStream.write(`[${new Date().toISOString()}] ${input.tool_name}: ${detail}\n`);
  }
}

/**
 * Create unified session hooks with configurable stall detection and edit guard.
 * @param {Indicator} indicator
 * @param {WriteStream|null} logStream
 * @param {object} [options]
 * @param {boolean} [options.enableStallDetection=false]
 * @param {number}  [options.stallTimeoutMs=1800000]
 * @param {boolean} [options.enableEditGuard=false]
 * @returns {{ hooks: object, cleanup: () => void, isStalled: () => boolean }}
 */
function createSessionHooks(indicator, logStream, options = {}) {
  const {
    enableStallDetection = false,
    stallTimeoutMs = 1800000,
    enableEditGuard = false,
    editThreshold = DEFAULT_EDIT_THRESHOLD,
  } = options;

  const editCounts = {};
  let stallDetected = false;
  let stallChecker = null;

  if (enableStallDetection) {
    stallChecker = setInterval(() => {
      const idleMs = Date.now() - indicator.lastToolTime;
      if (idleMs > stallTimeoutMs && !stallDetected) {
        stallDetected = true;
        const idleMin = Math.floor(idleMs / 60000);
        log('warn', `无新工具调用超过 ${idleMin} 分钟，自动中断 session`);
        if (logStream) {
          logStream.write(`[${new Date().toISOString()}] STALL: 无工具调用 ${idleMin} 分钟，自动中断\n`);
        }
      }
    }, 30000);
  }

  const hooks = {
    PreToolUse: [{
      matcher: '*',
      hooks: [async (input) => {
        inferPhaseStep(indicator, input.tool_name, input.tool_input);
        logToolCall(logStream, input);

        if (enableEditGuard) {
          const target = input.tool_input?.file_path || input.tool_input?.path || '';
          if (['Write', 'Edit', 'MultiEdit'].includes(input.tool_name) && target) {
            editCounts[target] = (editCounts[target] || 0) + 1;
            if (editCounts[target] > editThreshold) {
              return {
                decision: 'block',
                message: `已对 ${target} 编辑 ${editCounts[target]} 次，疑似死循环。请重新审视方案后再继续。`,
              };
            }
          }
        }

        return {};
      }]
    }],
    PostToolUse: [{
      matcher: '*',
      hooks: [async () => {
        indicator.updatePhase('thinking');
        indicator.updateStep('');
        indicator.toolTarget = '';
        return {};
      }]
    }],
  };

  return {
    hooks,
    cleanup() { if (stallChecker) clearInterval(stallChecker); },
    isStalled() { return stallDetected; },
  };
}

module.exports = { createSessionHooks };
