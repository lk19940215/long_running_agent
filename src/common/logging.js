'use strict';

const { localTimestamp } = require('./utils');

/**
 * 处理 SDK 消息并写入日志流
 * @param {object} message - SDK 消息对象
 * @param {import('fs').WriteStream} logStream - 日志写入流
 * @param {object} indicator - Indicator 实例（可选）
 */
function logMessage(message, logStream, indicator) {
  if (message.type === 'assistant' && message.message?.content) {
    for (const block of message.message.content) {
      if (block.type === 'text' && block.text) {
        if (indicator) indicator.updateActivity();
        process.stdout.write(block.text);
        if (logStream) logStream.write(block.text);
      }
      if (block.type === 'tool_use' && logStream) {
        logStream.write(`[TOOL_USE] ${block.name}: ${JSON.stringify(block.input).slice(0, 300)}\n`);
      }
    }
  }

  if (message.type === 'tool_result') {
    if (indicator) indicator.updateActivity();
    if (logStream) {
      const isErr = message.is_error || false;
      const content = typeof message.content === 'string'
        ? message.content.slice(0, 500)
        : JSON.stringify(message.content).slice(0, 500);
      if (isErr) {
        logStream.write(`[TOOL_ERROR] ${content}\n`);
      }
    }
  }
}

/**
 * 从消息列表中提取结果消息
 * @param {Array} messages - 消息列表
 * @returns {object|null} 结果消息
 */
function extractResult(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].type === 'result') return messages[i];
  }
  return null;
}

/**
 * 从消息列表中提取结果文本
 * @param {Array} messages - 消息列表
 * @returns {string} 结果文本
 */
function extractResultText(messages) {
  const result = extractResult(messages);
  return result?.result || '';
}

/**
 * 写入 session 分隔符到日志
 * @param {import('fs').WriteStream} logStream - 日志写入流
 * @param {number} sessionNum - session 编号
 * @param {string} label - 标签
 */
function writeSessionSeparator(logStream, sessionNum, label) {
  const sep = '='.repeat(60);
  logStream.write(`\n${sep}\n[Session ${sessionNum}] ${label} ${localTimestamp()}\n${sep}\n`);
}

module.exports = {
  logMessage,
  extractResult,
  extractResultText,
  writeSessionSeparator,
};