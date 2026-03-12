'use strict';

const readline = require('readline');
const { COLOR } = require('./config');

/**
 * 在终端渲染一个结构化问题并收集用户选择
 *
 * @param {object} question - AskUserQuestion 格式的单个问题
 * @param {string} question.question - 问题文本
 * @param {string} question.header - 短标签
 * @param {Array}  question.options - 选项列表 [{ label, description }]
 * @param {boolean} question.multiSelect - 是否多选
 * @returns {Promise<string>} 用户选择的文本
 */
async function renderQuestion(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
    terminal: process.stdin.isTTY || false,
  });

  return new Promise(resolve => {
    const w = (s) => process.stderr.write(s);

    w(`\n${COLOR.cyan}┌─ ${question.header || '问题'} ${'─'.repeat(Math.max(0, 40 - (question.header || '').length))}${COLOR.reset}\n`);
    w(`${COLOR.cyan}│${COLOR.reset} ${COLOR.bold}${question.question}${COLOR.reset}\n`);
    w(`${COLOR.cyan}│${COLOR.reset}\n`);

    const options = question.options || [];
    options.forEach((opt, i) => {
      w(`${COLOR.cyan}│${COLOR.reset}  ${COLOR.yellow}${i + 1}.${COLOR.reset} ${opt.label}\n`);
      if (opt.description) {
        w(`${COLOR.cyan}│${COLOR.reset}     ${COLOR.dim}${opt.description}${COLOR.reset}\n`);
      }
    });

    w(`${COLOR.cyan}│${COLOR.reset}  ${COLOR.yellow}0.${COLOR.reset} ${COLOR.dim}其他 (自定义输入)${COLOR.reset}\n`);

    if (question.multiSelect) {
      w(`${COLOR.cyan}│${COLOR.reset}\n`);
      w(`${COLOR.cyan}│${COLOR.reset}  ${COLOR.dim}(多选: 用逗号分隔数字, 如 1,3)${COLOR.reset}\n`);
    }

    w(`${COLOR.cyan}└${'─'.repeat(44)}${COLOR.reset}\n`);

    rl.question(`  ${COLOR.green}>${COLOR.reset} `, answer => {
      rl.close();

      const trimmed = answer.trim();
      if (!trimmed) {
        resolve(options[0]?.label || '');
        return;
      }

      if (trimmed === '0') {
        const rl2 = readline.createInterface({
          input: process.stdin,
          output: process.stderr,
          terminal: process.stdin.isTTY || false,
        });
        rl2.question(`  ${COLOR.cyan}请输入你的想法:${COLOR.reset} `, customAnswer => {
          rl2.close();
          resolve(customAnswer.trim() || options[0]?.label || '');
        });
        return;
      }

      const nums = trimmed.split(/[,，\s]+/)
        .map(n => parseInt(n, 10))
        .filter(n => !isNaN(n) && n >= 1 && n <= options.length);

      if (nums.length > 0) {
        const selected = nums.map(n => options[n - 1].label);
        resolve(question.multiSelect ? selected.join(', ') : selected[0]);
      } else {
        resolve(trimmed);
      }
    });
  });
}

/**
 * 处理完整的 AskUserQuestion 工具调用
 * 逐个渲染问题，收集所有答案
 *
 * @param {object} toolInput - AskUserQuestion 的 tool_input
 * @param {Array}  toolInput.questions - 问题列表
 * @returns {Promise<object>} { answers: { [question]: answer }, formatted: string }
 */
async function handleUserQuestions(toolInput) {
  const questions = toolInput.questions || [];
  if (questions.length === 0) {
    return { answers: {}, formatted: '(no questions)' };
  }

  process.stderr.write(`\n${COLOR.magenta}╔══ 模型需要你的输入 ══════════════════════╗${COLOR.reset}\n`);
  process.stderr.write(`${COLOR.magenta}║${COLOR.reset}  以下是模型提出的问题，请逐一回答      ${COLOR.magenta}║${COLOR.reset}\n`);
  process.stderr.write(`${COLOR.magenta}╚══════════════════════════════════════════╝${COLOR.reset}\n`);

  const answers = {};
  for (const q of questions) {
    const answer = await renderQuestion(q);
    answers[q.question] = answer;
  }

  const lines = Object.entries(answers)
    .map(([q, a]) => `Q: ${q}\nA: ${a}`)
    .join('\n\n');

  process.stderr.write(`\n${COLOR.green}✓ 已收集回答:${COLOR.reset}\n`);
  for (const [q, a] of Object.entries(answers)) {
    const shortQ = q.length > 50 ? q.slice(0, 50) + '...' : q;
    process.stderr.write(`  ${COLOR.dim}${shortQ}${COLOR.reset} → ${COLOR.bold}${a}${COLOR.reset}\n`);
  }
  process.stderr.write('\n');

  return { answers, formatted: lines };
}

/**
 * 创建 AskUserQuestion 的 PreToolUse Hook 处理函数
 *
 * 工作原理：
 * 1. 拦截模型的 AskUserQuestion 调用
 * 2. 通过 readline 在终端展示问题
 * 3. 收集用户答案
 * 4. deny 工具调用，同时通过 systemMessage 将答案注入上下文
 *
 * @returns {Function} PreToolUse hook handler
 */
function createAskUserQuestionHook() {
  return async (input, _toolUseID, _context) => {
    if (input.tool_name !== 'AskUserQuestion') return {};

    const { formatted } = await handleUserQuestions(input.tool_input);

    return {
      systemMessage: [
        'The user has answered your questions via the terminal interface.',
        'Here are their responses:',
        '',
        formatted,
        '',
        'Proceed based on these answers. Do NOT ask the same questions again.',
      ].join('\n'),
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `User answered via terminal. Answers:\n${formatted}`,
      },
    };
  };
}

module.exports = {
  renderQuestion,
  handleUserQuestions,
  createAskUserQuestionHook,
};
