/**
 * Eval 测试用例
 *
 * 每个 case 结构:
 *   id       — 唯一标识，CLI 过滤用
 *   name     — 显示名称
 *   input    — 给 Agent 的指令
 *   expect   — 预期结果
 *     tools       — 预期使用的工具（任一匹配即可）
 *     maxAPICalls — 效率上限（轮次）
 *     validate    — 验证函数（检查文件内容/trace，返回 boolean）
 */

import { readFile } from 'fs/promises';

export const CASES = [
  // ─── 基础操作 ──────────────────────────────────────────

  {
    id: 'read_basic',
    name: '读取文件',
    input: '读取 test-example/README.md 的内容',
    expect: {
      tools: ['read'],
      maxAPICalls: 2,
      validate: (trace) => trace.toolCalls.find(t => t.name === 'read')?.success === true,
    },
  },
  {
    id: 'list_dir',
    name: '列出目录',
    input: 'test-example 目录下有哪些子目录和文件？列出完整结构',
    expect: {
      tools: ['ls', 'glob'],
      maxAPICalls: 3,
      validate: (trace) => trace.toolCalls.some(t => t.name === 'ls' || t.name === 'glob'),
    },
  },

  // ─── JS 项目 ──────────────────────────────────────────

  {
    id: 'fix_bug',
    name: 'JS 修复 Bug',
    input: 'test-example/shopping-cart/cart.mjs 的 getSubtotal() 方法有 bug：计算小计时应该用乘法 (price * quantity)，而不是加法 (price + quantity)。请修复。',
    expect: {
      tools: ['read', 'edit'],
      maxAPICalls: 5,
      validate: async () => {
        const content = await readFile('test-example/shopping-cart/cart.mjs', 'utf-8');
        return content.includes('item.price * item.quantity');
      },
    },
  },
  {
    id: 'multi_edit',
    name: 'JS 多处修改',
    input: '在 test-example/shopping-cart/utils.mjs 中：1) 给 calculateDiscount 函数加一个参数 vipLevel（默认 0），2) 把 validateQuantity 函数中 qty < 0 改成 qty <= 0',
    expect: {
      tools: ['read', 'multi_edit'],
      maxAPICalls: 4,
      validate: async () => {
        const content = await readFile('test-example/shopping-cart/utils.mjs', 'utf-8');
        return content.includes('vipLevel') && content.includes('qty <= 0');
      },
    },
  },
  {
    id: 'explore_then_edit',
    name: 'JS 探索后编辑',
    input: '在 test-example 中找到 TAX_RATE 常量，把它从 0.08 改成 0.1',
    expect: {
      tools: ['grep', 'read', 'edit'],
      maxAPICalls: 6,
      validate: async () => {
        const content = await readFile('test-example/shopping-cart/config.mjs', 'utf-8');
        return content.includes('0.1') && !content.includes('0.08');
      },
    },
  },

  // ─── Python 项目 ──────────────────────────────────────

  {
    id: 'py_search',
    name: 'Python 搜索函数',
    input: '在 test-example/py-utils 中找到所有 def 定义的函数，告诉我每个函数的用途',
    expect: {
      tools: ['grep', 'symbols'],
      maxAPICalls: 4,
      validate: (trace) => {
        return trace.toolCalls.some(t => t.name === 'grep' || t.name === 'symbols')
          && trace.finalText.includes('calculator') || trace.finalText.includes('validator');
      },
    },
  },
  {
    id: 'py_fix',
    name: 'Python 修复 Bug',
    input: 'test-example/py-utils/calculator.py 的 divide 函数，把错误信息从 "Cannot divide by zero" 改成 "Division by zero is not allowed"',
    expect: {
      tools: ['read', 'edit'],
      maxAPICalls: 4,
      validate: async () => {
        const content = await readFile('test-example/py-utils/calculator.py', 'utf-8');
        return content.includes('Division by zero is not allowed');
      },
    },
  },

  // ─── Go 项目 ──────────────────────────────────────────

  {
    id: 'go_search',
    name: 'Go 搜索函数',
    input: '在 test-example/go-api 中找到所有 func 定义，告诉我有哪些 HTTP handler',
    expect: {
      tools: ['grep', 'symbols'],
      maxAPICalls: 4,
      validate: (trace) => {
        return trace.finalText.includes('HandleHealth') || trace.finalText.includes('HandleCreateUser');
      },
    },
  },
  {
    id: 'go_fix',
    name: 'Go 修改配置',
    input: 'test-example/go-api/config.go 中默认端口是 8080，改成 3000',
    expect: {
      tools: ['read', 'edit'],
      maxAPICalls: 4,
      validate: async () => {
        const content = await readFile('test-example/go-api/config.go', 'utf-8');
        return content.includes('3000') && !content.includes('8080');
      },
    },
  },

  // ─── Rust 项目 ─────────────────────────────────────────

  {
    id: 'rust_search',
    name: 'Rust 搜索结构',
    input: '在 test-example/rust-lib/lib.rs 中有哪些 struct 和 trait？列出它们的名称和方法',
    expect: {
      tools: ['read', 'symbols'],
      maxAPICalls: 4,
      validate: (trace) => {
        return trace.finalText.includes('Stack') && trace.finalText.includes('Printable');
      },
    },
  },

  // ─── 跨语言搜索 ────────────────────────────────────────

  {
    id: 'cross_lang_search',
    name: '跨语言搜索',
    input: '在 test-example 中搜索所有跟 "validate" 或 "validator" 相关的函数，不论语言（JS、Python、Go 都要搜），告诉我在哪些文件',
    expect: {
      tools: ['grep'],
      maxAPICalls: 3,
      validate: (trace) => {
        const text = trace.finalText;
        return trace.toolCalls.some(t => t.name === 'grep')
          && (text.includes('validate.mjs') || text.includes('validator.py'));
      },
    },
  },
  {
    id: 'bash_verify',
    name: '命令验证',
    input: '读取 test-example/shopping-cart/config.mjs，把 MAX_ITEMS 从 50 改成 100，然后用 bash 命令验证修改成功',
    expect: {
      tools: ['read', 'edit', 'bash'],
      maxAPICalls: 6,
      validate: async (trace) => {
        const content = await readFile('test-example/shopping-cart/config.mjs', 'utf-8');
        return content.includes('100') && trace.toolCalls.some(t => t.name === 'bash');
      },
    },
  },

  // ─── 多轮对话 ─────────────────────────────────────────

  {
    id: 'multi_turn_explore',
    name: '多轮探索修复',
    inputs: [
      '查看 test-example/py-utils/ 目录有哪些文件',
      '读取 calculator.py，告诉我 Calculator 类有哪些方法',
      'calc 方法里 ops 字典缺少取模运算，请添加 "mod": 对应 a % b 的 lambda 函数',
    ],
    expect: {
      tools: ['ls', 'read', 'edit'],
      maxAPICalls: 8,
      validate: async () => {
        const content = await readFile('test-example/py-utils/calculator.py', 'utf-8');
        return content.includes('mod') && content.includes('%');
      },
    },
  },
  {
    id: 'multi_turn_refactor',
    name: '多轮重构',
    inputs: [
      '读取 test-example/string-utils/validate.mjs',
      '这些函数的空值处理都不好。isEmpty 没处理 null，isEmail 没处理 undefined。请用 multi_edit 同时修复这两个函数',
    ],
    expect: {
      tools: ['read', 'multi_edit', 'edit'],
      maxAPICalls: 6,
      validate: async () => {
        const content = await readFile('test-example/string-utils/validate.mjs', 'utf-8');
        return content.includes('!str') || content.includes('null') || content.includes('typeof');
      },
    },
  },

  // ─── SubAgent ─────────────────────────────────────────

  {
    id: 'task_analyze',
    name: 'SubAgent 多语言分析',
    input: '用 task 工具委派一个子任务：分析 test-example 目录下有哪些子项目，每个项目用什么语言、核心文件和功能是什么。',
    expect: {
      tools: ['task'],
      maxAPICalls: 3,
      validate: (trace) => {
        const usedTask = trace.toolCalls.some(t => t.name === 'task' && t.success);
        const mentionsLangs = trace.finalText.includes('Python') || trace.finalText.includes('Go') || trace.finalText.includes('Rust');
        return usedTask && mentionsLangs;
      },
    },
  },

  // ─── 长上下文 ─────────────────────────────────────────

  {
    id: 'context_attention',
    name: '长上下文注意力',
    prefill: buildLongContext(),
    input: '回到最初的问题：test-example/shopping-cart/config.mjs 中的 FREE_SHIPPING_THRESHOLD 是多少？请读取文件确认。',
    expect: {
      tools: ['read'],
      maxAPICalls: 3,
      validate: (trace) => trace.finalText.includes('99') && trace.toolCalls.some(t => t.name === 'read'),
    },
  },
];

/**
 * 构建长上下文历史（模拟多轮对话后的注意力稀释）
 * 在 messages 里填充 8 轮无关对话，然后测试 Agent 是否还能准确处理新指令
 */
function buildLongContext() {
  const fillerTopics = [
    { q: '什么是 JavaScript 的闭包？', a: '闭包是函数和其词法环境的组合...' },
    { q: 'React 和 Vue 的区别是什么？', a: 'React 使用 JSX，Vue 使用模板语法...' },
    { q: '解释一下 Promise 和 async/await', a: 'Promise 是异步编程的基础...' },
    { q: 'CSS Grid 和 Flexbox 有什么不同？', a: 'Grid 是二维布局，Flexbox 是一维布局...' },
    { q: 'Node.js 的事件循环是怎么工作的？', a: '事件循环处理异步回调...' },
    { q: 'TypeScript 的泛型怎么用？', a: '泛型允许创建可重用的组件...' },
    { q: 'HTTP/2 相比 HTTP/1.1 有什么改进？', a: '多路复用、头部压缩、服务器推送...' },
    { q: 'Docker 和虚拟机的区别？', a: 'Docker 使用容器技术，共享内核...' },
  ];

  const messages = [];
  for (const topic of fillerTopics) {
    messages.push({ role: 'user', content: topic.q });
    messages.push({ role: 'assistant', content: [{ type: 'text', text: topic.a }] });
  }

  return messages;
}
