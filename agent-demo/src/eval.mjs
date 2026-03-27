/**
 * Agent 评估框架 — 入口
 *
 * 运行全部:          node src/eval.mjs
 * 指定用例:          node src/eval.mjs fix_bug multi_edit
 * 开启日志:          node src/eval.mjs --log
 * 重复跑 (Pass@k):   node src/eval.mjs --repeat 3
 * 保存为 baseline:   node src/eval.mjs --save-baseline
 * 列出可用用例:       node src/eval.mjs --list
 *
 * 也可通过 .env 配置: EVAL_LOG=true 默认开启日志
 *
 * 输出:
 *   终端 — 实时进度和评分
 *   eval-reports/*.md — 评分报告（始终生成）
 *   eval-reports/baseline.json — baseline 数据（--save-baseline 时生成）
 *   logs/eval-*.log — 详细日志（--log 或 EVAL_LOG=true 时生成）
 */

import { writeFile, mkdir } from 'fs/promises';
import { API_KEY, BASE_URL, DEFAULT_MODEL, MAX_TOKENS, SYSTEM_PROMPT } from './config.mjs';
import { AgentCore } from './core/agent-core.mjs';
import { Logger } from './core/logger.mjs';
import { toolSchemas } from './tools/index.mjs';
import { CASES } from './eval/cases.mjs';
import { runCase, backupSandbox, restoreSandbox, cleanupBackup } from './eval/runner.mjs';
import { generateReport, getBaselineData } from './eval/report.mjs';

function parseArg(args, name) {
  const idx = args.indexOf(name);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--list')) {
    console.log('\n可用测试用例:');
    for (const c of CASES) {
      console.log(`  ${c.id.padEnd(22)} ${c.name}`);
    }
    return;
  }

  const enableLog = args.includes('--log') || process.env.EVAL_LOG === 'true';
  const repeat = parseInt(parseArg(args, '--repeat') || '1');
  const saveBaseline = args.includes('--save-baseline');
  const caseFilter = args.filter(a => !a.startsWith('--') && !/^\d+$/.test(a));

  const cases = caseFilter.length > 0
    ? CASES.filter(c => caseFilter.includes(c.id))
    : CASES;

  if (cases.length === 0) {
    console.log('\n没有匹配的测试用例。用 --list 查看可用用例。');
    return;
  }

  const logger = enableLog ? new Logger(true, { silent: true }) : null;
  const logFile = logger?.init('eval') || null;

  if (logger) {
    logger.start({
      model: DEFAULT_MODEL,
      tools: toolSchemas.map(t => t.name),
      logFile,
      systemPrompt: SYSTEM_PROMPT,
      toolSchemas,
    });
  }

  const agent = new AgentCore({
    apiKey: API_KEY,
    baseURL: BASE_URL,
    model: DEFAULT_MODEL,
    maxTokens: MAX_TOKENS,
    systemPrompt: SYSTEM_PROMPT,
    logger,
  });

  console.log('\n╭─── Agent Eval ───╮');
  console.log(`│ 模型: ${DEFAULT_MODEL}`);
  console.log(`│ 用例: ${cases.length} 个${repeat > 1 ? ` ×${repeat}` : ''}`);
  console.log(`│ temperature: 0`);
  if (logFile) console.log(`│ 日志: ${logFile}`);
  else console.log(`│ 日志: 关闭（用 --log 开启）`);
  console.log('╰──────────────────╯');

  await backupSandbox();

  const results = [];
  for (const caseSpec of cases) {
    await restoreSandbox();

    try {
      const result = await runCase(agent, caseSpec, logger, repeat);
      results.push(result);
    } catch (e) {
      console.log(`    ✗ 异常: ${e.message}`);
      results.push({
        caseId: caseSpec.id,
        caseName: caseSpec.name,
        trace: { toolCalls: [], turns: 0, tokens: { input: 0, output: 0 }, validated: false },
        scores: { correctness: 0, toolChoice: 0, efficiency: 0, noErrors: 0, total: 0 },
        elapsed: 0,
      });
    }
  }

  await restoreSandbox();
  await cleanupBackup();

  // 生成报告
  const report = await generateReport(results, DEFAULT_MODEL);
  await mkdir('eval-reports', { recursive: true });
  const reportFile = `eval-reports/${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.md`;
  await writeFile(reportFile, report, 'utf-8');

  // 保存 baseline
  if (saveBaseline) {
    const baselineData = getBaselineData(results);
    await writeFile('eval-reports/baseline.json', JSON.stringify(baselineData, null, 2), 'utf-8');
    console.log('\n  ⚖️  Baseline 已保存: eval-reports/baseline.json');
  }

  // 终端总结
  console.log('\n' + '─'.repeat(50));
  const totalScore = results.reduce((s, r) => s + r.scores.total, 0);
  const avg = (totalScore / results.length).toFixed(1);
  console.log(`  平均得分: ${avg}/100`);
  if (repeat > 1) {
    const passKResults = results.filter(r => r.passK);
    if (passKResults.length > 0) {
      const avgPassRate = passKResults.reduce((s, r) => s + r.passK.passRate, 0) / passKResults.length;
      console.log(`  Pass@${repeat}: ${(avgPassRate * 100).toFixed(0)}%`);
    }
  }
  console.log(`  报告: ${reportFile}`);
  if (logFile) console.log(`  日志: ${logFile}`);
  console.log('─'.repeat(50));
}

main();
