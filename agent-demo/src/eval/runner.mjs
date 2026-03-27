/**
 * Eval Runner — 执行 case、评分、沙盒管理
 *
 * 支持三种 case 类型:
 *   1. 单轮 — input: "读取文件"
 *   2. 多轮 — inputs: ["读取文件", "修复 bug", "验证"]
 *   3. 长上下文 — prefill: [...历史消息], input: "在此基础上..."
 *
 * 支持 repeat (Pass@k)：每个 case 跑 N 次，统计通过率
 */

import { cp, rm } from 'fs/promises';
import { existsSync } from 'fs';

const SANDBOX_DIR = 'test-example';
const BACKUP_DIR = '.eval-backup';

// ─── 沙盒管理 ─────────────────────────────────────────────

export async function backupSandbox() {
  if (existsSync(BACKUP_DIR)) await rm(BACKUP_DIR, { recursive: true });
  await cp(SANDBOX_DIR, BACKUP_DIR, { recursive: true });
}

export async function restoreSandbox() {
  if (!existsSync(BACKUP_DIR)) return;
  await rm(SANDBOX_DIR, { recursive: true });
  await cp(BACKUP_DIR, SANDBOX_DIR, { recursive: true });
}

export async function cleanupBackup() {
  await rm(BACKUP_DIR, { recursive: true, force: true });
}

// ─── 评分 ─────────────────────────────────────────────────

/**
 * 4 维评分:
 *   正确性 50 — validate() 通过
 *   工具选择 20 — 使用了预期工具之一
 *   效率 20 — 总轮次在 maxAPICalls 以内
 *   无错误 10 — 所有工具调用成功
 */
export function scoreCase(caseSpec, combinedTrace) {
  const scores = {};
  let total = 0;

  scores.correctness = combinedTrace.validated ? 50 : 0;
  total += scores.correctness;

  const usedTools = [...new Set(combinedTrace.toolCalls.map(t => t.name))];
  scores.toolChoice = caseSpec.expect.tools.some(t => usedTools.includes(t)) ? 20 : 0;
  total += scores.toolChoice;

  const maxCalls = caseSpec.expect.maxAPICalls;
  if (combinedTrace.turns <= maxCalls) scores.efficiency = 20;
  else if (combinedTrace.turns <= maxCalls * 1.5) scores.efficiency = 10;
  else scores.efficiency = 0;
  total += scores.efficiency;

  scores.noErrors = combinedTrace.toolCalls.some(t => !t.success) ? 0 : 10;
  total += scores.noErrors;

  return { ...scores, total };
}

// ─── 合并多轮 Trace ─────────────────────────────────────

function mergeTraces(traces) {
  return {
    toolCalls: traces.flatMap(t => t.toolCalls),
    finalText: traces[traces.length - 1]?.finalText || '',
    turns: traces.reduce((sum, t) => sum + t.turns, 0),
    tokens: {
      input: traces.reduce((sum, t) => sum + t.tokens.input, 0),
      output: traces.reduce((sum, t) => sum + t.tokens.output, 0),
    },
    stopReason: traces[traces.length - 1]?.stopReason,
    validated: false,
  };
}

// ─── 执行单次运行 ───────────────────────────────────────

async function runOnce(agent, caseSpec, logger) {
  const startTime = Date.now();
  const inputs = caseSpec.inputs || [caseSpec.input];
  const messages = caseSpec.prefill ? [...caseSpec.prefill] : [];

  const traces = [];
  for (let i = 0; i < inputs.length; i++) {
    logger?.round(inputs[i]);
    const trace = await agent.run(inputs[i], { messages, maxTurns: 10, temperature: 0 });
    traces.push(trace);
  }

  const elapsed = Date.now() - startTime;
  const combined = traces.length === 1 ? traces[0] : mergeTraces(traces);

  try {
    const result = caseSpec.expect.validate(combined);
    combined.validated = result instanceof Promise ? await result : result;
  } catch {
    combined.validated = false;
  }

  return { combined, elapsed };
}

// ─── 执行单个 Case（支持 repeat / Pass@k）───────────────

export async function runCase(agent, caseSpec, logger, repeat = 1) {
  const inputs = caseSpec.inputs || [caseSpec.input];
  const isMultiTurn = inputs.length > 1;

  console.log(`\n  ▸ ${caseSpec.id}: ${caseSpec.name}${isMultiTurn ? ` (${inputs.length} 轮)` : ''}${repeat > 1 ? ` ×${repeat}` : ''}`);
  console.log(`    输入: "${inputs[0].substring(0, 60)}${inputs[0].length > 60 ? '...' : ''}"`);

  const runs = [];
  for (let r = 0; r < repeat; r++) {
    if (repeat > 1) console.log(`    ── 第 ${r + 1}/${repeat} 次运行 ──`);
    await restoreSandbox();
    const { combined, elapsed } = await runOnce(agent, caseSpec, logger);
    const scores = scoreCase(caseSpec, combined);
    runs.push({ trace: combined, scores, elapsed });

    console.log(`    轮次: ${combined.turns}/${caseSpec.expect.maxAPICalls} | 工具: ${combined.toolCalls.map(t => t.name).join(', ') || '无'}`);
    console.log(`    Token: ${combined.tokens.input}+${combined.tokens.output} | 耗时: ${(elapsed / 1000).toFixed(1)}s`);
    console.log(`    验证: ${combined.validated ? '✓ 通过' : '✗ 未通过'} | 得分: ${scores.total}/100`);
  }

  const best = Math.max(...runs.map(r => r.scores.total));
  const avg = Math.round(runs.reduce((s, r) => s + r.scores.total, 0) / runs.length);
  const passRate = runs.filter(r => r.scores.total >= 80).length / runs.length;

  if (repeat > 1) {
    console.log(`    ── 汇总: best=${best} avg=${avg} pass@${repeat}=${(passRate * 100).toFixed(0)}% ──`);
  }

  return {
    caseId: caseSpec.id,
    caseName: caseSpec.name,
    trace: runs[0].trace,
    scores: runs[0].scores,
    elapsed: runs[0].elapsed,
    runs: repeat > 1 ? runs : undefined,
    passK: repeat > 1 ? { best, avg, passRate, k: repeat } : undefined,
  };
}
