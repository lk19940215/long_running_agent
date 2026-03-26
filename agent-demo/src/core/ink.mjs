/**
 * Ink 终端 UI — React for CLI
 *
 * 架构：React 组件 ←→ 模块级 state bridge ←→ Agent Loop
 *
 * 布局：
 *   Static 永久区 → 头部 / 对话历史 / 工具日志 / thinking
 *   动态区 → 流式文字 / Spinner / 输入行
 */

import React, { useState, useEffect } from 'react';
import { render, Box, Text, Static, useInput } from 'ink';

const h = React.createElement;

// ─── State Bridge ────────────────────────────────────────────
let _setMessages, _setStatus, _setStreamText, _setStreamType;
let _inputResolver = null;
let _msgId = 0;
let _currentStreamType = null;

// ─── Spinner ─────────────────────────────────────────────────
const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function Spinner({ label, color }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setFrame(i => (i + 1) % FRAMES.length), 80);
    return () => clearInterval(t);
  }, []);
  return h(Text, { color }, `${FRAMES[frame]} ${label}`);
}

// ─── 共享渲染块（流式动态区 + Static 永久区共用）──────────────
function ThinkingBlock({ text }) {
  return h(Box, { borderStyle: 'round', borderColor: 'blue', paddingX: 1 },
    h(Text, { wrap: 'wrap' }, text),
  );
}

function AgentBlock({ text }) {
  return h(Box, { flexDirection: 'column' },
    h(Text, { color: 'cyan', bold: true }, '\n────────────── Agent ────────────────────'),
    h(Text, { wrap: 'wrap' }, text),
  );
}

// ─── 消息渲染 ────────────────────────────────────────────────
function MessageItem({ msg }) {
  if (msg.type === 'tool_start') {
    return h(Box, { paddingLeft: 2 },
      h(Text, { color: 'yellow' }, `┌ 调用 ${msg.text} `),
    );
  }
  if (msg.type === 'tool_end') {
    return h(Box, { paddingLeft: 2 },
      h(Text, { color: msg.success === false ? 'red' : 'green' },
        `└ ${msg.success === false ? '✗ 失败' : '✓ 成功'} · ${msg.text}`),
    );
  }
  if (msg.type === 'thinking') return h(ThinkingBlock, { text: msg.text });
  if (msg.type === 'agent') return h(AgentBlock, { text: msg.text });
  if (msg.type === 'header') {
    return h(Box, { borderStyle: 'round', borderColor: 'cyan', paddingX: 1, flexDirection: 'column' },
      h(Text, { bold: true, color: 'cyan' }, `AI Agent ── ${msg.model}`),
      h(Text, { color: 'gray', wrap: 'wrap' }, `工具: ${msg.tools}`),
      msg.logFile ? h(Text, { color: 'gray' }, `日志: ${msg.logFile}`) : null,
    );
  }
  return h(Box, null,
    h(Text, { color: msg.color || undefined, bold: !!msg.bold, wrap: 'wrap' }, msg.text),
  );
}

// ─── 主组件 ──────────────────────────────────────────────────
function AgentApp() {
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('idle');
  const [input, setInput] = useState('');
  const [streamText, setStreamText] = useState('');
  const [streamType, setStreamType] = useState(null);

  useEffect(() => {
    _setMessages = setMessages;
    _setStatus = setStatus;
    _setStreamText = setStreamText;
    _setStreamType = setStreamType;
    return () => { _setMessages = _setStatus = _setStreamText = _setStreamType = null; };
  }, []);

  useInput((char, key) => {
    if (key.return) {
      const text = input.trim();
      if (!text) return;
      _inputResolver?.({ exit: text === 'exit', text });
      _inputResolver = null;
      setInput('');
    } else if (key.backspace || key.delete) {
      setInput(prev => prev.slice(0, -1));
    } else if (char && !key.ctrl && !key.meta) {
      setInput(prev => prev + char);
    }
  }, { isActive: status === 'waiting' });

  return h(Box, { flexDirection: 'column' },
    // 永久消息区
    h(Static, { items: messages },
      (msg) => h(MessageItem, { key: msg.id, msg }),
    ),

    // 流式区（复用共享渲染块）
    streamText && streamType === 'thinking'
      ? h(ThinkingBlock, { text: `thinking...\n${streamText}` })
      : null,
    streamText && streamType === 'text'
      ? h(AgentBlock, { text: streamText })
      : null,

    // 状态指示器
    status === 'thinking' ? h(Spinner, { label: '思考中...', color: 'blue' }) : null,
    status === 'calling' ? h(Spinner, { label: '调用工具...', color: 'magenta' }) : null,
    status === 'done' ? h(Text, { color: 'cyan' }, '✅ 完成') : null,
    status === 'error' ? h(Text, { color: 'red' }, '❌ 错误') : null,

    // 输入行
    status === 'waiting'
      ? h(Box, null,
          h(Text, { bold: true, color: 'green' }, '> '),
          input
            ? h(Text, null, input)
            : h(Text, { color: 'gray' }, '输入任务或问题...'),
          h(Text, { backgroundColor: 'green' }, ' '),
        )
      : null,
  );
}

// ─── 对外 API ────────────────────────────────────────────────
export function createDisplay() {
  let _unmount = null;

  function addMsg(text, opts = {}) {
    _setMessages?.(prev => [...prev, { id: `msg-${_msgId++}`, text, ...opts }]);
  }

  const ctrl = {
    start({ model, tools, logFile }) {
      const app = render(h(AgentApp), { exitOnCtrlC: true, patchConsole: true });
      _unmount = app.unmount;

      addMsg('', {
        type: 'header',
        model: model || 'unknown',
        tools: tools?.join(', ') || '',
        logFile,
      });
      addMsg('输入任务开始，exit 退出', { color: 'gray' });
    },

    status(state) { _setStatus?.(state); },

    print(text, color, { bold } = {}) { addMsg(text, { color, bold }); },

    toolStart(name, preview) { addMsg(`${name} → ${preview}`, { type: 'tool_start' }); },

    toolEnd(name, charCount, preview, success = true) {
      const text = preview || `${charCount} 字符`;
      addMsg(text, { type: 'tool_end', success });
    },

    startStream(type) {
      _currentStreamType = type;
      _setStreamType?.(type);
      _setStreamText?.('');
    },

    appendText(text) { _setStreamText?.(prev => prev + text); },

    finishStream() {
      const type = _currentStreamType;
      _currentStreamType = null;
      _setStreamType?.(null);
      _setStreamText?.(prev => {
        if (prev && type === 'text') {
          addMsg(prev, { type: 'agent' });
        } else if (prev && type === 'thinking') {
          addMsg(`thinking...\n${prev}`, { type: 'thinking' });
        }
        return '';
      });
    },

    async waitForInput() {
      _setStatus?.('waiting');
      const result = await new Promise(resolve => { _inputResolver = resolve; });
      return result.exit ? null : result.text;
    },

    destroy() { _unmount?.(); },
  };

  return ctrl;
}
