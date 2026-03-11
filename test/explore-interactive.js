#!/usr/bin/env node
'use strict';

/**
 * 探测 Claude Agent SDK 的用户交互机制
 * 
 * 目标：了解 askUserQuestion 工具的消息格式、permissionMode 的影响、
 *       以及如何通过 AsyncIterable prompt 实现多轮对话
 */

const fs = require('fs');
const path = require('path');

let _sdk = null;
async function loadSDK() {
  if (_sdk) return _sdk;
  const pkgName = '@anthropic-ai/claude-agent-sdk';
  const attempts = [
    () => import(pkgName),
    () => {
      const { createRequire } = require('module');
      return import(createRequire(__filename).resolve(pkgName));
    },
    () => {
      const { createRequire } = require('module');
      return import(createRequire(path.join(process.cwd(), 'noop.js')).resolve(pkgName));
    },
    () => {
      const { execSync } = require('child_process');
      const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
      const sdkDir = path.join(globalRoot, pkgName);
      const pkgJson = JSON.parse(fs.readFileSync(path.join(sdkDir, 'package.json'), 'utf8'));
      const entry = pkgJson.exports?.['.'] || pkgJson.main || 'index.js';
      const entryFile = typeof entry === 'object' ? (entry.import || entry.default || entry.node) : entry;
      return import(path.join(sdkDir, entryFile));
    },
  ];
  for (const attempt of attempts) {
    try { _sdk = await attempt(); return _sdk; } catch {}
  }
  console.error('SDK not found. Run: npm install -g @anthropic-ai/claude-agent-sdk');
  process.exit(1);
}

function formatMsg(msg, depth = 0) {
  const indent = '  '.repeat(depth);
  const ts = new Date().toISOString().slice(11, 23);

  if (msg.type === 'assistant' && msg.message?.content) {
    for (const block of msg.message.content) {
      if (block.type === 'text') {
        const preview = block.text.slice(0, 200).replace(/\n/g, '↵');
        console.log(`${indent}[${ts}] 💬 assistant/text: "${preview}"`);
      }
      if (block.type === 'tool_use') {
        console.log(`${indent}[${ts}] 🔧 assistant/tool_use: ${block.name}`);
        console.log(`${indent}   input: ${JSON.stringify(block.input).slice(0, 300)}`);
      }
    }
  } else if (msg.type === 'tool_result') {
    const content = typeof msg.content === 'string'
      ? msg.content.slice(0, 200)
      : JSON.stringify(msg.content).slice(0, 200);
    console.log(`${indent}[${ts}] 📦 tool_result (error=${msg.is_error || false}): ${content}`);
  } else if (msg.type === 'result') {
    console.log(`${indent}[${ts}] ✅ result: subtype=${msg.subtype}, turns=${msg.num_turns}, cost=$${msg.total_cost_usd?.toFixed(4) || '?'}`);
    if (msg.result) {
      console.log(`${indent}   result_text: "${msg.result.slice(0, 300)}"`);
    }
  } else {
    console.log(`${indent}[${ts}] 📨 ${msg.type}${msg.subtype ? '/' + msg.subtype : ''}: ${JSON.stringify(msg).slice(0, 200)}`);
  }
}

// ─── Test 1: permissionMode='plan', askUserQuestion ALLOWED ───

async function test1_planWithAsk() {
  console.log('\n' + '='.repeat(60));
  console.log('  Test 1: permissionMode=plan + askUserQuestion ALLOWED');
  console.log('  Prompt intentionally vague to trigger questions');
  console.log('='.repeat(60) + '\n');

  const sdk = await loadSDK();
  const abortController = new AbortController();
  setTimeout(() => abortController.abort(), 60000);

  const session = sdk.query({
    prompt: '帮我优化系统',
    options: {
      permissionMode: 'plan',
      cwd: process.cwd(),
      abortController,
    },
  });

  const messages = [];
  try {
    for await (const msg of session) {
      messages.push(msg);
      formatMsg(msg);
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      console.log('\n⏱ Session timed out (60s)');
    } else {
      console.error('Error:', err.message);
    }
  }

  console.log(`\nTotal messages: ${messages.length}`);
  console.log('Message types:', messages.map(m => m.type).join(', '));
  const toolUses = messages
    .filter(m => m.type === 'assistant' && m.message?.content)
    .flatMap(m => m.message.content.filter(b => b.type === 'tool_use'))
    .map(b => b.name);
  console.log('Tools used:', toolUses.length ? toolUses.join(', ') : '(none)');
}

// ─── Test 2: permissionMode='default' (or omitted) ───

async function test2_defaultMode() {
  console.log('\n' + '='.repeat(60));
  console.log('  Test 2: permissionMode=default (bypassPermissions)');
  console.log('  Same vague prompt, observe askUserQuestion behavior');
  console.log('='.repeat(60) + '\n');

  const sdk = await loadSDK();
  const abortController = new AbortController();
  setTimeout(() => abortController.abort(), 60000);

  const session = sdk.query({
    prompt: '帮我优化系统',
    options: {
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      cwd: process.cwd(),
      abortController,
      maxTurns: 3,
    },
  });

  const messages = [];
  try {
    for await (const msg of session) {
      messages.push(msg);
      formatMsg(msg);
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      console.log('\n⏱ Session timed out (60s)');
    } else {
      console.error('Error:', err.message);
    }
  }

  console.log(`\nTotal messages: ${messages.length}`);
  console.log('Message types:', messages.map(m => m.type).join(', '));
}

// ─── Test 3: AsyncIterable prompt for multi-turn ───

async function test3_asyncPrompt() {
  console.log('\n' + '='.repeat(60));
  console.log('  Test 3: AsyncIterable prompt (multi-turn conversation)');
  console.log('  SDK supports async generator as prompt for multi-turn');
  console.log('='.repeat(60) + '\n');

  const sdk = await loadSDK();
  const abortController = new AbortController();
  setTimeout(() => abortController.abort(), 90000);

  let resolveUserInput = null;

  async function* conversationPrompt() {
    yield { role: 'user', content: '我想优化一个系统，你有什么问题要问我吗？请用 askUserQuestion 工具提问。' };

    // Wait for signal to send second message
    console.log('  [generator] First message yielded, waiting for model response...');
    
    const userReply = await new Promise(resolve => {
      resolveUserInput = resolve;
    });
    
    if (userReply) {
      console.log(`  [generator] Yielding user reply: "${userReply}"`);
      yield { role: 'user', content: userReply };
    }
  }

  const session = sdk.query({
    prompt: conversationPrompt(),
    options: {
      permissionMode: 'plan',
      cwd: process.cwd(),
      abortController,
      maxTurns: 5,
    },
  });

  const messages = [];
  let questionAsked = false;
  try {
    for await (const msg of session) {
      messages.push(msg);
      formatMsg(msg);

      // Detect askUserQuestion tool use
      if (msg.type === 'assistant' && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === 'tool_use' && block.name === 'askUserQuestion' && !questionAsked) {
            questionAsked = true;
            console.log('\n  >>> askUserQuestion DETECTED! Sending reply via generator...\n');
            if (resolveUserInput) {
              resolveUserInput('这是一个 Node.js 后端项目，使用 Express 框架，主要性能问题在数据库查询。');
            }
          }
        }
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      console.log('\n⏱ Session timed out');
    } else {
      console.error('Error:', err.message);
    }
  }

  // Resolve if never asked
  if (resolveUserInput && !questionAsked) {
    resolveUserInput(null);
  }

  console.log(`\nTotal messages: ${messages.length}`);
  console.log('askUserQuestion detected:', questionAsked);
}

// ─── Main ───

async function main() {
  const testNum = parseInt(process.argv[2], 10) || 0;

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  Claude Agent SDK — Interactive Mode Explorer    ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
  console.log('Usage: node test/explore-interactive.js [1|2|3]');
  console.log('  1 = plan mode + askUserQuestion allowed');
  console.log('  2 = bypassPermissions mode + maxTurns=3');
  console.log('  3 = AsyncIterable prompt (multi-turn)');
  console.log('  0 = run all (default)');

  if (testNum === 1 || testNum === 0) await test1_planWithAsk();
  if (testNum === 2 || testNum === 0) await test2_defaultMode();
  if (testNum === 3 || testNum === 0) await test3_asyncPrompt();

  console.log('\n\nDone.');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
