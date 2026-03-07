'use strict';

const { inferPhaseStep } = require('./indicator');
const { log } = require('./config');

const DEFAULT_EDIT_THRESHOLD = 15;
const SESSION_RESULT_FILENAME = 'session_result.json';

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
 * Detect whether a tool call writes to session_result.json.
 * Covers both the Write tool (exact path match) and Bash redirect writes.
 */
function isSessionResultWrite(toolName, toolInput) {
  if (toolName === 'Write') {
    const target = toolInput?.file_path || toolInput?.path || '';
    return target.endsWith(SESSION_RESULT_FILENAME);
  }
  if (toolName === 'Bash') {
    const cmd = toolInput?.command || '';
    if (!cmd.includes(SESSION_RESULT_FILENAME)) return false;
    return />\s*[^\s]*session_result/.test(cmd);
  }
  return false;
}

/**
 * Create unified session hooks with stall detection, edit guard,
 * and completion detection (auto-shorten timeout after session_result written).
 * @param {Indicator} indicator
 * @param {WriteStream|null} logStream
 * @param {object} [options]
 * @param {boolean}         [options.enableStallDetection=false]
 * @param {number}          [options.stallTimeoutMs=1200000]
 * @param {AbortController} [options.abortController]
 * @param {boolean}         [options.enableEditGuard=false]
 * @param {boolean}         [options.enableCompletionDetection=true]
 * @param {number}          [options.completionTimeoutMs=300000]
 * @returns {{ hooks: object, cleanup: () => void, isStalled: () => boolean }}
 */
function createSessionHooks(indicator, logStream, options = {}) {
  const {
    enableStallDetection = false,
    stallTimeoutMs = 1200000,
    abortController = null,
    enableEditGuard = false,
    editThreshold = DEFAULT_EDIT_THRESHOLD,
    enableCompletionDetection = true,
    completionTimeoutMs = 300000,
  } = options;

  const editCounts = {};
  let stallDetected = false;
  let stallChecker = null;
  let completionDetectedAt = 0;

  if (enableStallDetection) {
    stallChecker = setInterval(() => {
      const now = Date.now();
      const idleMs = now - indicator.lastActivityTime; // 使用活动时间而非工具调用时间

      // 优先检测 completion 超时（session_result 写入后的缩短超时）
      if (completionDetectedAt > 0) {
        const sinceCompletion = now - completionDetectedAt;
        if (sinceCompletion > completionTimeoutMs && !stallDetected) {
          stallDetected = true;
          const shortMin = Math.ceil(completionTimeoutMs / 60000);
          const actualMin = Math.floor(sinceCompletion / 60000);
          log('warn', `\nsession_result 已写入 ${actualMin} 分钟，超过 ${shortMin} 分钟上限，自动中断`);
          if (logStream) {
            logStream.write(`\n[${new Date().toISOString()}] STALL: session_result 写入后 ${actualMin} 分钟（上限 ${shortMin} 分钟），自动中断\n`);
          }
          if (abortController) {
            abortController.abort();
            log('warn', '\n已发送中断信号');
          }
        }
        // 已检测到 completion，不再执行 stall 检测，等待 completion 超时
        return;
      }

      // 正常 stall 检测（仅在未检测到 completion 时执行）
      if (idleMs > stallTimeoutMs && !stallDetected) {
        stallDetected = true;
        const idleMin = Math.floor(idleMs / 60000);
        log('warn', `\n无响应超过 ${idleMin} 分钟，自动中断 session`);
        if (logStream) {
          logStream.write(`\n[${new Date().toISOString()}] STALL: 无响应 ${idleMin} 分钟，自动中断\n`);
        }
        if (abortController) {
          abortController.abort();
          log('warn', '\n已发送中断信号');
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
                hookSpecificOutput: {
                  hookEventName: 'PreToolUse',
                  permissionDecision: 'deny',
                  permissionDecisionReason: `已对 ${target} 编辑 ${editCounts[target]} 次，疑似死循环。请重新审视方案后再继续。`,
                },
              };
            }
          }
        }

        return {};
      }]
    }],
    PostToolUse: [{
      matcher: '*',
      hooks: [async (input) => {
        indicator.updatePhase('thinking');
        indicator.updateStep('');
        indicator.toolTarget = '';

        if (enableCompletionDetection && !completionDetectedAt) {
          if (isSessionResultWrite(input.tool_name, input.tool_input)) {
            completionDetectedAt = Date.now();
            const shortMin = Math.ceil(completionTimeoutMs / 60000);
            indicator.setCompletionDetected(shortMin);
            log('info', '');
            log('info', `检测到 session_result 写入，${shortMin} 分钟内模型未终止将自动中断`);
            if (logStream) {
              logStream.write(`\n[${new Date().toISOString()}] COMPLETION_DETECTED: session_result.json written, ${shortMin}min grace period\n`);
            }
          }
        }

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
