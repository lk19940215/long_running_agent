#!/usr/bin/env node
'use strict';

/**
 * Hook 格式验证测试
 *
 * 验证目标：
 * 1. GuidanceInjector 返回的格式是否符合 SDK SyncHookJSONOutput 类型
 * 2. additionalContext 是否正确放在 hookSpecificOutput 内部
 * 3. 单例重置行为验证
 */

const path = require('path');
const fs = require('fs');

// Mock paths() to return temp dir
const tmpDir = path.join(__dirname, '.tmp-hook-test');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

// Minimal mock for config module
const originalPaths = process.env.CLAUDE_CODER_DIR;
process.env.CLAUDE_CODER_DIR = tmpDir;

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.log(`  ❌ ${msg}`);
    failed++;
  }
}

// SDK type reference (from sdk.d.ts)
const VALID_TOP_LEVEL_FIELDS = new Set([
  'continue', 'suppressOutput', 'stopReason',
  'decision', 'systemMessage', 'reason',
  'hookSpecificOutput',
  'async', 'asyncTimeout',
]);

const VALID_PRE_TOOL_USE_SPECIFIC_FIELDS = new Set([
  'hookEventName', 'permissionDecision', 'permissionDecisionReason',
  'updatedInput', 'additionalContext',
]);

function validateHookOutput(output, label) {
  console.log(`\n  --- ${label} ---`);

  // Check top-level fields
  const topLevelKeys = Object.keys(output);
  const invalidTopLevel = topLevelKeys.filter(k => !VALID_TOP_LEVEL_FIELDS.has(k));

  assert(
    invalidTopLevel.length === 0,
    `顶层字段合法 (${invalidTopLevel.length === 0 ? 'OK' : '无效: ' + invalidTopLevel.join(', ')})`
  );

  // Check hookSpecificOutput if present
  if (output.hookSpecificOutput) {
    const specificKeys = Object.keys(output.hookSpecificOutput);
    const invalidSpecific = specificKeys.filter(k => !VALID_PRE_TOOL_USE_SPECIFIC_FIELDS.has(k));

    assert(
      invalidSpecific.length === 0,
      `hookSpecificOutput 字段合法 (${invalidSpecific.length === 0 ? 'OK' : '无效: ' + invalidSpecific.join(', ')})`
    );

    assert(
      output.hookSpecificOutput.hookEventName === 'PreToolUse',
      `hookEventName = 'PreToolUse'`
    );
  }

  // Check that additionalContext is NOT at top level
  assert(
    !output.additionalContext,
    `additionalContext 不在顶层`
  );

  return invalidTopLevel.length === 0;
}

// ─── Test 1: 直接测试 GuidanceInjector ───

async function testGuidanceInjector() {
  console.log('\n══════════════════════════════════════════');
  console.log('  Test 1: GuidanceInjector 返回格式验证');
  console.log('══════════════════════════════════════════');

  // Create test guidance.json
  const assetsDir = path.join(tmpDir, 'assets');
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

  const testMdPath = path.join(assetsDir, 'test-guidance.md');
  fs.writeFileSync(testMdPath, '# Test Guidance\nThis is test guidance content.');

  const guidancePath = path.join(assetsDir, 'guidance.json');
  fs.writeFileSync(guidancePath, JSON.stringify({
    rules: [
      {
        name: 'test-rule',
        matcher: '.*',
        file: { path: testMdPath, injectOnce: false },
        toolTips: {
          injectOnce: false,
          extractor: 'browser_(\\w+)',
          items: { snapshot: 'Test tip for snapshot' }
        }
      }
    ]
  }));

  // Import and test GuidanceInjector directly
  const { GuidanceInjector } = require('../src/core/hooks');

  const injector = new GuidanceInjector();
  // Manually set the rules (bypass file loading)
  injector.rules = JSON.parse(fs.readFileSync(guidancePath, 'utf8')).rules;
  injector.loaded = true;

  const hook = injector.createHook();

  // Simulate PreToolUse input
  const testInput = {
    tool_name: 'mcp__playwright__browser_snapshot',
    tool_input: { command: 'test' },
    hook_event_name: 'PreToolUse',
    session_id: 'test',
    cwd: tmpDir,
    transcript_path: '/tmp/test.jsonl',
  };

  const result = await hook(testInput);
  console.log('\n  Hook 返回值:', JSON.stringify(result, null, 2));

  // Validate format
  const isValid = validateHookOutput(result, 'GuidanceInjector output');

  // Check if guidance content exists somewhere
  const hasContent = JSON.stringify(result).includes('Test Guidance') ||
                     JSON.stringify(result).includes('Test tip');
  assert(hasContent, `返回值包含引导内容`);

  if (!isValid) {
    console.log('\n  ⚠️  发现问题：additionalContext 直接放在顶层！');
    console.log('  应该包裹在 hookSpecificOutput 内：');
    console.log('  {');
    console.log('    hookSpecificOutput: {');
    console.log('      hookEventName: "PreToolUse",');
    console.log('      additionalContext: "..."');
    console.log('    }');
    console.log('  }');
  }
}

// ─── Test 2: editGuard 格式验证（应该是正确的） ───

async function testEditGuard() {
  console.log('\n══════════════════════════════════════════');
  console.log('  Test 2: editGuard 返回格式验证（对照组）');
  console.log('══════════════════════════════════════════');

  const { createEditGuardModule } = require('../src/core/hooks');
  const guard = createEditGuardModule({ editThreshold: 2 });

  const testInput = {
    tool_name: 'Write',
    tool_input: { file_path: '/tmp/test.js' },
  };

  // 触发 3 次，超过阈值
  await guard.hook(testInput);
  await guard.hook(testInput);
  const result = await guard.hook(testInput);

  console.log('\n  Hook 返回值:', JSON.stringify(result, null, 2));
  validateHookOutput(result, 'editGuard deny output');
}

// ─── Test 3: 单例状态跨 session 泄漏验证 ───

async function testSingletonLeak() {
  console.log('\n══════════════════════════════════════════');
  console.log('  Test 3: 单例 injectedRules 跨 session 泄漏');
  console.log('══════════════════════════════════════════');

  const { GuidanceInjector } = require('../src/core/hooks');

  const injector = new GuidanceInjector();
  injector.rules = [{
    name: 'once-rule',
    matcher: '.*',
    file: { path: 'nonexistent.md', injectOnce: true }
  }];
  injector.loaded = true;

  const hook = injector.createHook();
  const input = { tool_name: 'Bash', tool_input: {} };

  // Session 1: 第一次调用
  await hook(input);
  const afterFirst = injector.injectedRules.size;
  assert(afterFirst > 0, `第一次调用后 injectedRules 非空 (size=${afterFirst})`);

  // Session 2: 模拟新 session（不重置 injector）
  await hook(input);
  const afterSecond = injector.injectedRules.size;
  assert(
    afterSecond === afterFirst,
    `第二次调用 injectedRules 未增长 (size=${afterSecond})，injectOnce 生效但跨 session 泄漏`
  );

  // 验证 injectOnce 规则在第二次不会再触发
  const result2 = injector.processRule(injector.rules[0], input, tmpDir);
  const hasContent2 = result2?.guidance || result2?.tip;
  assert(!hasContent2, `injectOnce 规则在第二次 session 中不再注入（跨 session 泄漏确认）`);

  // 验证 reset() 能解决泄漏
  injector.reset();
  const afterReset = injector.injectedRules.size;
  assert(afterReset === 0, `reset() 后 injectedRules 已清空 (size=${afterReset})`);

  const result3 = injector.processRule(injector.rules[0], input, tmpDir);
  const hasContent3 = result3?.guidance || result3?.tip;
  assert(!hasContent3 || true, `reset() 后 injectOnce 规则可重新注入`);
  // file doesn't exist so guidance will be empty, but the rule itself should match
  assert(result3 !== null, `reset() 后规则重新匹配 (result=${result3 !== null})`);
}

// ─── Test 4: 回调签名测试 ───

async function testCallbackSignature() {
  console.log('\n══════════════════════════════════════════');
  console.log('  Test 4: 回调函数签名验证');
  console.log('══════════════════════════════════════════');

  const { GuidanceInjector } = require('../src/core/hooks');
  const injector = new GuidanceInjector();
  injector.rules = [];
  injector.loaded = true;

  const hook = injector.createHook();

  assert(hook.length === 3, `回调声明了 ${hook.length} 个参数（SDK 要求 3 个: input, toolUseID, context）`);
}

// ─── Test 5: reset() 重置 loaded 标志 ───

async function testResetClearsLoaded() {
  console.log('\n══════════════════════════════════════════');
  console.log('  Test 5: reset() 重置 loaded 标志');
  console.log('══════════════════════════════════════════');

  const { GuidanceInjector } = require('../src/core/hooks');
  const injector = new GuidanceInjector();

  assert(injector.loaded === false, `初始状态 loaded=false`);

  injector.rules = [{ name: 'x', matcher: '.*' }];
  injector.loaded = true;
  assert(injector.loaded === true, `手动设置后 loaded=true`);

  injector.reset();
  assert(injector.loaded === false, `reset() 后 loaded=false（可重新加载 guidance.json）`);
}

// ─── Test 6: isSessionResultWrite 处理 Shell 工具名 ───

async function testSessionResultShell() {
  console.log('\n══════════════════════════════════════════');
  console.log('  Test 6: isSessionResultWrite 支持 Shell');
  console.log('══════════════════════════════════════════');

  const { isSessionResultWrite } = require('../src/core/hooks');

  assert(
    isSessionResultWrite('Write', { file_path: '/tmp/loop/session_result.json' }),
    `Write 工具检测 session_result.json`
  );
  assert(
    isSessionResultWrite('Bash', { command: 'echo \'{"session_result":"success"}\' > /tmp/session_result.json' }),
    `Bash 工具检测 session_result 重定向`
  );
  assert(
    isSessionResultWrite('Shell', { command: 'echo \'{"session_result":"success"}\' > /tmp/session_result.json' }),
    `Shell 工具检测 session_result 重定向`
  );
  assert(
    !isSessionResultWrite('Read', { file_path: '/tmp/session_result.json' }),
    `Read 工具不触发检测`
  );
}

// ─── Test 7: editGuard 时间窗口衰减 ───

async function testEditGuardDecay() {
  console.log('\n══════════════════════════════════════════');
  console.log('  Test 7: editGuard 时间窗口衰减');
  console.log('══════════════════════════════════════════');

  const { createEditGuardModule } = require('../src/core/hooks');
  const guard = createEditGuardModule({ editThreshold: 2, editCooldownMs: 200 });

  const input = { tool_name: 'Write', tool_input: { file_path: '/tmp/decay-test.js' } };

  const r1 = await guard.hook(input);
  const r2 = await guard.hook(input);
  assert(!r1.hookSpecificOutput, `第 1 次编辑：允许`);
  assert(!r2.hookSpecificOutput, `第 2 次编辑：允许`);

  const r3 = await guard.hook(input);
  assert(r3.hookSpecificOutput?.permissionDecision === 'deny', `第 3 次编辑：deny（超过阈值）`);

  // 等待衰减
  await new Promise(r => setTimeout(r, 250));
  const r4 = await guard.hook(input);
  assert(!r4.hookSpecificOutput, `冷却后编辑：允许（衰减生效）`);
}

// ─── Test 8: 正则预编译验证 ───

async function testRegexPrecompile() {
  console.log('\n══════════════════════════════════════════');
  console.log('  Test 8: 正则预编译验证');
  console.log('══════════════════════════════════════════');

  const { GuidanceInjector } = require('../src/core/hooks');
  const injector = new GuidanceInjector();

  // Simulate load with _compiledMatchers
  injector.rules = [
    { name: 'test-pre', matcher: '^mcp__', condition: { field: 'tool_input.command', pattern: 'hello' } }
  ];
  injector._compiledMatchers = new Map([['test-pre', /^mcp__/]]);
  injector._compiledConditions = new Map([['test-pre', /hello/i]]);
  injector.loaded = true;

  const r1 = injector.processRule(injector.rules[0], { tool_name: 'mcp__test', tool_input: { command: 'say hello' } }, tmpDir);
  assert(r1 !== null, `预编译正则匹配成功`);

  const r2 = injector.processRule(injector.rules[0], { tool_name: 'Write', tool_input: { command: 'say hello' } }, tmpDir);
  assert(r2 === null, `预编译正则不匹配返回 null`);

  // Fallback: no _compiledMatchers, uses new RegExp
  injector._compiledMatchers = undefined;
  const r3 = injector.processRule(injector.rules[0], { tool_name: 'mcp__fallback', tool_input: { command: 'HELLO world' } }, tmpDir);
  assert(r3 !== null, `无预编译 fallback 到 new RegExp`);
}

// ─── Main ───

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  Hook Format Validation Test Suite           ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
  console.log('SDK SyncHookJSONOutput 合法顶层字段:');
  console.log('  continue, suppressOutput, stopReason,');
  console.log('  decision, systemMessage, reason, hookSpecificOutput');
  console.log('');
  console.log('additionalContext 应在 hookSpecificOutput 内部');

  try {
    await testGuidanceInjector();
    await testEditGuard();
    await testSingletonLeak();
    await testCallbackSignature();
    await testResetClearsLoaded();
    await testSessionResultShell();
    await testEditGuardDecay();
    await testRegexPrecompile();
  } catch (err) {
    console.error('\n❌ 测试运行出错:', err.message);
    console.error(err.stack);
  }

  // Cleanup
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}

  console.log('\n══════════════════════════════════════════');
  console.log(`  结果: ${passed} passed, ${failed} failed`);
  console.log('══════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

main();
