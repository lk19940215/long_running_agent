/**
 * Logger - 调试日志（写入文件）
 *
 * 核心方法:
 *   init()               → 创建日志文件，返回文件路径
 *   start(...)            → 写入启动信息（prompt + 工具列表）
 *   log(label, data)      → 写入一条日志（自动格式化）
 *
 * 日志格式:
 *   每条日志带时间戳 [HH:MM:SS]
 *   响应内容 → 摘要头 + 完整 content blocks
 *   工具结果 → 完整内容 + 字符数统计
 *   其他     → 原样输出
 */

import { appendFileSync, mkdirSync } from 'fs';

function ts() {
  return new Date().toTimeString().split(' ')[0]; // HH:MM:SS
}

// 格式化 API 响应：摘要头 + 逐 block 展开（保留完整内容）
function formatResponse(response) {
  const { model, stop_reason, usage, content } = response;
  const parts = [];

  const inputT = usage?.input_tokens || 0;
  const outputT = usage?.output_tokens || 0;
  parts.push(`  模型: ${model} | stop: ${stop_reason} | tokens: ${inputT} → ${outputT}`);
  parts.push('');

  if (Array.isArray(content)) {
    for (const block of content) {
      if (block.type === 'thinking') {
        parts.push(`  ┌─ thinking ─────────────────────`);
        parts.push(`  │ ${block.thinking?.replace(/\n/g, '\n  │ ') || ''}`);
        parts.push(`  └────────────────────────────────`);
      } else if (block.type === 'text') {
        parts.push(`  ┌─ text ────────────────────────`);
        parts.push(`  │ ${block.text?.replace(/\n/g, '\n  │ ') || ''}`);
        parts.push(`  └────────────────────────────────`);
      } else if (block.type === 'tool_use') {
        const inputStr = JSON.stringify(block.input, null, 2).replace(/\n/g, '\n  │ ');
        parts.push(`  ┌─ tool_use: ${block.name} ─────`);
        parts.push(`  │ ${inputStr}`);
        parts.push(`  └────────────────────────────────`);
      }
    }
  }

  return parts.join('\n');
}

export class Logger {
  constructor(debug = false, { silent = false } = {}) {
    this.debug = debug;
    this.silent = silent;
    this.file = null;
  }

  init() {
    if (!this.debug) return null;
    mkdirSync('logs', { recursive: true });
    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const time = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    this.file = `logs/${date}_${time}.log`;
    this._raw(`${'═'.repeat(60)}\n  Agent 启动 ${now.toLocaleString()}\n${'═'.repeat(60)}\n`);
    return this.file;
  }

  start({ model, tools, logFile, systemPrompt, toolSchemas }) {
    if (systemPrompt) {
      this._section('System Prompt', `[已注入] ${systemPrompt.split('\n')[0]}...`);
    }
    if (toolSchemas) {
      const summary = toolSchemas.map(t => `  - ${t.name}: ${t.description}`).join('\n');
      this._section('可用工具', summary);
    }
  }

  log(label, data) {
    // 响应内容 → 结构化格式
    if (label === '响应内容' && data && typeof data === 'object') {
      this._section('响应', formatResponse(data));
      return;
    }

    // 工具完成 → 完整内容 + 统计
    if (label.startsWith('工具完成') && typeof data === 'string') {
      this._section(label, `${data}\n  ── ${data.length} 字符 ──`);
      return;
    }

    // 工具开始 → 紧凑 JSON
    if (label.startsWith('工具开始') && data && typeof data === 'object') {
      this._section(label, JSON.stringify(data));
      return;
    }

    // 其他
    if (data === undefined) {
      this._section(label);
    } else if (typeof data === 'string') {
      this._section(label, data);
    } else {
      this._section(label, JSON.stringify(data, null, 2));
    }
  }

  _section(title, data) {
    const header = `[${ts()}] ────── ${title} ──────`;
    if (data === undefined) {
      this._raw(header);
    } else {
      this._raw(`${header}\n${data}`);
    }
  }

  _raw(text) {
    if (!this.debug || !this.file) return;
    appendFileSync(this.file, text + '\n');
  }
}
