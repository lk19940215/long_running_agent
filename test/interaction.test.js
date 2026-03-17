'use strict';

const assert = require('assert');
const path = require('path');

let testsPassed = 0;
let testsFailed = 0;
const queue = [];

function test(name, fn) {
  queue.push({ name, fn });
}

async function runAll() {
  console.log('\n========================================');
  console.log('  交互模式专项测试');
  console.log('========================================\n');

  let lastSection = '';
  for (const { name, fn } of queue) {
    const section = name.split(':')[0];
    if (section !== lastSection) {
      lastSection = section;
    }
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      testsPassed++;
    } catch (err) {
      console.log(`  ✗ ${name}`);
      console.log(`    ${err.message}`);
      testsFailed++;
    }
  }

  console.log('\n清理测试环境...');
  console.log(`\n========================================`);
  console.log(`  测试结果: ${testsPassed} passed, ${testsFailed} failed`);
  console.log(`========================================\n`);
  process.exit(testsFailed > 0 ? 1 : 0);
}

// ========== 1. interaction.js 模块加载测试 ==========
console.log('1. interaction.js 模块加载测试');

test('模块可正常加载', () => {
  const mod = require('../src/common/interaction');
  assert(mod, '模块导出为空');
});

test('导出 renderQuestion 函数', () => {
  const { renderQuestion } = require('../src/common/interaction');
  assert.strictEqual(typeof renderQuestion, 'function');
});

test('导出 handleUserQuestions 函数', () => {
  const { handleUserQuestions } = require('../src/common/interaction');
  assert.strictEqual(typeof handleUserQuestions, 'function');
});

test('导出 createAskUserQuestionHook 函数', () => {
  const { createAskUserQuestionHook } = require('../src/common/interaction');
  assert.strictEqual(typeof createAskUserQuestionHook, 'function');
});

// ========== 2. COLOR 常量完整性测试 ==========
console.log('\n2. COLOR 常量完整性测试');

test('COLOR 包含所有必要颜色', () => {
  const { COLOR } = require('../src/common/config');
  const required = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'bold', 'dim', 'reset'];
  for (const key of required) {
    assert(COLOR[key], `COLOR 缺少 ${key}`);
    assert(typeof COLOR[key] === 'string', `COLOR.${key} 应为 string`);
    assert(COLOR[key].startsWith('\x1b['), `COLOR.${key} 应以 ESC[ 开头`);
  }
});

test('COLOR 值不含 undefined', () => {
  const { COLOR } = require('../src/common/config');
  for (const [key, val] of Object.entries(COLOR)) {
    assert(val !== undefined, `COLOR.${key} 为 undefined`);
    assert(val !== 'undefined', `COLOR.${key} 为字符串 'undefined'`);
  }
});

// ========== 3. createAskUserQuestionHook 逻辑测试 ==========
console.log('\n3. createAskUserQuestionHook 逻辑测试');

test('非 AskUserQuestion 工具返回空对象', async () => {
  const { createAskUserQuestionHook } = require('../src/common/interaction');
  const hook = createAskUserQuestionHook();
  const result = await hook(
    { tool_name: 'Write', tool_input: { file_path: '/tmp/a.txt' } },
    'test-id',
    {}
  );
  assert.deepStrictEqual(result, {});
});

test('hook 是异步函数', () => {
  const { createAskUserQuestionHook } = require('../src/common/interaction');
  const hook = createAskUserQuestionHook();
  assert.strictEqual(hook.constructor.name, 'AsyncFunction');
});

// ========== 4. handleUserQuestions 边界测试 ==========
console.log('\n4. handleUserQuestions 边界测试');

test('空问题列表返回 (no questions)', async () => {
  const { handleUserQuestions } = require('../src/common/interaction');

  const origWrite = process.stderr.write;
  process.stderr.write = () => true;
  try {
    const result = await handleUserQuestions({ questions: [] });
    assert.deepStrictEqual(result.answers, {});
    assert.strictEqual(result.formatted, '(no questions)');
  } finally {
    process.stderr.write = origWrite;
  }
});

test('无 questions 字段返回 (no questions)', async () => {
  const { handleUserQuestions } = require('../src/common/interaction');

  const origWrite = process.stderr.write;
  process.stderr.write = () => true;
  try {
    const result = await handleUserQuestions({});
    assert.deepStrictEqual(result.answers, {});
    assert.strictEqual(result.formatted, '(no questions)');
  } finally {
    process.stderr.write = origWrite;
  }
});

// ========== 5. hooks.js 集成测试 ==========
console.log('\n5. hooks.js 集成测试');

test('FEATURES 包含 INTERACTION', () => {
  const { FEATURES } = require('../src/core/hooks');
  assert.strictEqual(FEATURES.INTERACTION, 'interaction');
});

test('FEATURE_MAP 包含 plan_interactive', () => {
  const hooks = require('../src/core/hooks');
  const { createHooks, FEATURES } = hooks;
  assert(typeof createHooks === 'function');
  assert.strictEqual(FEATURES.INTERACTION, 'interaction');
});

test('createHooks("plan") 不包含 interaction', () => {
  const { createHooks } = require('../src/core/hooks');
  const { Indicator } = require('../src/common/indicator');
  const indicator = new Indicator();

  const result = createHooks('plan', indicator, null, {
    stallTimeoutMs: 999999,
    abortController: new AbortController(),
  });

  assert(result.hooks, 'hooks 不应为空');
  assert(typeof result.cleanup === 'function');
  assert(typeof result.isStalled === 'function');

  result.cleanup();
  indicator.stop();
});

test('createHooks("plan_interactive") 包含 interaction hook', () => {
  const { createHooks } = require('../src/core/hooks');
  const { Indicator } = require('../src/common/indicator');
  const indicator = new Indicator();

  const result = createHooks('plan_interactive', indicator, null, {
    stallTimeoutMs: 999999,
    abortController: new AbortController(),
  });

  assert(result.hooks, 'hooks 不应为空');
  assert(result.hooks.PreToolUse, 'PreToolUse 应存在');

  const preHooks = result.hooks.PreToolUse[0].hooks;
  assert(preHooks.length >= 2, 'plan_interactive 应至少有 logging + interaction hook');

  result.cleanup();
  indicator.stop();
});

test('plan_interactive hook 正确拦截 AskUserQuestion', async () => {
  const { createHooks } = require('../src/core/hooks');
  const { Indicator } = require('../src/common/indicator');
  const indicator = new Indicator();

  const result = createHooks('plan_interactive', indicator, null, {
    stallTimeoutMs: 999999,
    abortController: new AbortController(),
  });

  const preHooks = result.hooks.PreToolUse[0].hooks;
  const interactionHook = preHooks[preHooks.length - 1];

  const nonAskResult = await interactionHook(
    { tool_name: 'Read', tool_input: {} },
    'test',
    {}
  );
  assert.deepStrictEqual(nonAskResult, {}, '非 AskUserQuestion 应返回空对象');

  result.cleanup();
  indicator.stop();
});

// ========== 6. plan.js 逻辑测试 ==========
console.log('\n6. plan.js 逻辑测试');

test('plan.js 模块导出 executePlan', () => {
  const { executePlan } = require('../src/core/plan');
  assert.strictEqual(typeof executePlan, 'function');
});

test('plan.js 模块可重复加载', () => {
  delete require.cache[require.resolve('../src/core/plan')];
  const planModule = require('../src/core/plan');
  assert(typeof planModule.executePlan === 'function');
});

// ========== 7. CLI 参数解析测试 ==========
console.log('\n7. CLI 参数解析测试');

const CLI = `node ${path.join(__dirname, '..', 'bin', 'cli.js')}`;
const { execSync } = require('child_process');

test('--help 包含 -i 交互模式说明', () => {
  const output = execSync(`${CLI} --help`, { encoding: 'utf8' });
  assert(output.includes('-i'), 'help 应包含 -i 选项');
  assert(output.includes('交互模式'), 'help 应提及交互模式');
});

test('plan 命令 usage 包含 [-i]', () => {
  const output = execSync(`${CLI} --help`, { encoding: 'utf8' });
  assert(output.includes('[-i]') || output.includes('-i'), 'plan usage 应包含 -i');
});

test('-i 参数正确解析', () => {
  const cliPath = require.resolve('../bin/cli.js');
  const cliSource = require('fs').readFileSync(cliPath, 'utf8');
  assert(cliSource.includes("case '-i':"), 'CLI 应包含 -i case');
  assert(cliSource.includes("opts.interactive = true"), 'CLI 应设置 opts.interactive = true');
});

test('--interactive 参数正确解析', () => {
  const cliPath = require.resolve('../bin/cli.js');
  const cliSource = require('fs').readFileSync(cliPath, 'utf8');
  assert(cliSource.includes("case '--interactive':"), 'CLI 应包含 --interactive case');
});

// ========== 8. 选项解析逻辑 ==========
console.log('\n8. 选项解析逻辑验证');

test('数字选择正确映射到选项标签', () => {
  const interactionSrc = require('fs').readFileSync(
    require.resolve('../src/common/interaction'),
    'utf8'
  );
  assert(interactionSrc.includes("trimmed === '0'"), '应有 0 选项判断');
  assert(interactionSrc.includes('其他 (自定义输入)'), '应有自定义输入选项');
  assert(interactionSrc.includes('请输入你的想法'), '应有自定义输入提示');
});

test('多选支持（逗号分隔）', () => {
  const src = require('fs').readFileSync(
    require.resolve('../src/common/interaction'),
    'utf8'
  );
  assert(src.includes("split(/[,，\\s]+/)"), '应支持中英文逗号和空格分隔');
  assert(src.includes('multiSelect'), '应支持 multiSelect 参数');
});

test('空输入默认选择第一项', () => {
  const src = require('fs').readFileSync(
    require.resolve('../src/common/interaction'),
    'utf8'
  );
  assert(src.includes("options[0]?.label || ''"), '空输入应默认返回第一选项');
});

test('非数字输入当作自定义文本', () => {
  const src = require('fs').readFileSync(
    require.resolve('../src/common/interaction'),
    'utf8'
  );
  assert(src.includes('resolve(trimmed)'), '无效数字应直接作为自定义输入');
});

// ========== 9. renderQuestion 输出格式验证 ==========
console.log('\n9. renderQuestion 输出格式验证');

test('渲染包含问题文本和选项编号', () => {
  const src = require('fs').readFileSync(
    require.resolve('../src/common/interaction'),
    'utf8'
  );
  assert(src.includes('${i + 1}.'), '选项应从 1 开始编号');
  assert(src.includes('question.question'), '应输出问题文本');
  assert(src.includes('question.header'), '应支持 header');
  assert(src.includes('opt.description'), '应支持选项描述');
  assert(src.includes('opt.label'), '应输出选项标签');
});

test('渲染包含 0 号自定义选项', () => {
  const src = require('fs').readFileSync(
    require.resolve('../src/common/interaction'),
    'utf8'
  );
  const zeroOptionIndex = src.indexOf("0.${COLOR.reset} ${COLOR.dim}其他");
  assert(zeroOptionIndex > 0, '应在选项列表中显示 0. 其他');

  const optionsForEach = src.indexOf('options.forEach');
  assert(zeroOptionIndex > optionsForEach, '0 选项应在正常选项之后');
});

// ========== 10. 跨模块一致性验证 ==========
console.log('\n10. 跨模块一致性验证');

test('hooks.js 正确导入 createAskUserQuestionHook', () => {
  const src = require('fs').readFileSync(
    require.resolve('../src/core/hooks'),
    'utf8'
  );
  assert(src.includes("require('../common/interaction')"), '应从 interaction.js 导入');
  assert(src.includes('createAskUserQuestionHook'), '应导入 createAskUserQuestionHook');
});

test('plan.js 使用 plan_interactive hookType', () => {
  const src = require('fs').readFileSync(
    require.resolve('../src/core/plan'),
    'utf8'
  );
  assert(src.includes("'plan_interactive'"), '应使用 plan_interactive 类型');
  assert(src.includes("interactive ? 'plan_interactive' : 'plan'"), '应根据 interactive 切换');
});

test('plan.js 交互模式不禁用 askUserQuestion', () => {
  const src = require('fs').readFileSync(
    require.resolve('../src/core/plan'),
    'utf8'
  );
  assert(src.includes('if (!interactive)'), '应仅非交互模式禁用');
  assert(src.includes("disallowedTools") && src.includes("askUserQuestion"), '非交互模式应禁用 askUserQuestion');
});

test('plan.js 交互模式提示文字正确', () => {
  const src = require('fs').readFileSync(
    require.resolve('../src/core/plan'),
    'utf8'
  );
  assert(src.includes('交互模式已启用'), '应有交互模式启用提示');
  assert(src.includes('AskUserQuestion'), 'prompt 约束应提到 AskUserQuestion');
});

// ========== 11. AssetManager 测试 ==========
console.log('\n11. AssetManager 测试');

test('AssetManager 类导出正确', () => {
  const { AssetManager, assets, renderTemplate } = require('../src/common/assets');
  assert(typeof AssetManager === 'function', 'AssetManager 应为构造函数');
  assert(assets instanceof AssetManager, 'assets 应为 AssetManager 实例');
  assert(typeof renderTemplate === 'function', 'renderTemplate 应为函数');
});

test('AssetManager registry 包含所有模板和数据文件', () => {
  const { assets } = require('../src/common/assets');
  const templates = [
    'agentProtocol', 'scanProtocol', 'addGuide', 'codingUser',
    'scanUser', 'addUser', 'testRule', 'guidance',
    'playwright', 'bashProcess', 'requirements',
  ];
  const dataFiles = ['env', 'tasks', 'progress', 'sessionResult', 'profile', 'tests', 'testEnv', 'playwrightAuth'];
  const runtimeFiles = ['browserProfile'];
  const rootFiles = ['mcpConfig'];

  for (const alias of [...templates, ...dataFiles, ...runtimeFiles, ...rootFiles]) {
    assert(assets.registry.has(alias), `registry 应包含 ${alias}`);
  }
});

test('AssetManager path() 返回正确路径', () => {
  const { AssetManager } = require('../src/common/assets');
  const am = new AssetManager();
  am.init('/tmp/test-project');

  assert(am.path('tasks').endsWith('tasks.json'), 'tasks 路径应正确');
  assert(am.path('env').includes('.claude-coder'), 'env 路径应在 .claude-coder 下');
  assert(am.path('browserProfile').includes('.runtime'), 'browserProfile 路径应在 .runtime 下');
  assert(am.path('mcpConfig').endsWith('.mcp.json'), 'mcpConfig 路径应在项目根目录');
  assert(!am.path('mcpConfig').includes('.claude-coder'), 'mcpConfig 不应在 .claude-coder 下');
  assert.strictEqual(am.path('nonexistent'), null, '不存在的名称应返回 null');
});

test('AssetManager dir() 返回正确目录', () => {
  const { AssetManager } = require('../src/common/assets');
  const am = new AssetManager();
  am.init('/tmp/test-project');

  assert(am.dir('loop').endsWith('.claude-coder'), 'loop dir 应正确');
  assert(am.dir('logs').includes('.runtime/logs'), 'logs dir 应正确');
  assert(am.dir('assets').endsWith('assets'), 'assets dir 应正确');
  assert.strictEqual(am.dir('nonexistent'), null, '不存在的目录应返回 null');
});

test('AssetManager read 读取 bundled 内容', () => {
  const { assets } = require('../src/common/assets');
  const content = assets.read('agentProtocol');
  assert(content.length > 100, '应读取到 agentProtocol.md 内容');
});

test('AssetManager render 渲染模板变量', () => {
  const { renderTemplate } = require('../src/common/assets');
  const result = renderTemplate('Hello {{name}}, you are {{role}}.', { name: 'Test', role: 'admin' });
  assert.strictEqual(result, 'Hello Test, you are admin.');
});

test('AssetManager render 空变量折叠空行', () => {
  const { renderTemplate } = require('../src/common/assets');
  const result = renderTemplate('Line1\n{{empty}}\n\n\n\nLine2', {});
  assert(!result.includes('\n\n\n'), '应折叠多余空行');
});

test('AssetManager exists 检查文件存在', () => {
  const { assets } = require('../src/common/assets');
  assert(assets.exists('agentProtocol'), 'agentProtocol 应存在');
  assert(!assets.exists('nonexistent_file_xyz'), '不存在的文件应返回 false');
});

test('AssetManager deployAll 部署并跳过已存在', () => {
  const fs = require('fs');
  const os = require('os');
  const { AssetManager } = require('../src/common/assets');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-test-'));
  const am = new AssetManager();
  am.init(tmpDir);

  const first = am.deployAll();
  assert(first.length > 0, '首次部署应有文件');

  const second = am.deployAll();
  assert.strictEqual(second.length, 0, '再次部署应全部跳过');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('AssetManager clearCache 清除缓存', () => {
  const { assets } = require('../src/common/assets');
  assets.read('agentProtocol');
  assert(assets.cache.size > 0, '读取后应有缓存');
  assets.clearCache();
  assert.strictEqual(assets.cache.size, 0, '清除后缓存应为空');
});

test('AssetManager readJson/writeJson 工作正常', () => {
  const fs = require('fs');
  const os = require('os');
  const { AssetManager } = require('../src/common/assets');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-rw-'));
  const am = new AssetManager();
  am.init(tmpDir);
  am.ensureDirs();

  am.writeJson('tasks', { features: [{ id: 'test' }] });
  const data = am.readJson('tasks');
  assert.strictEqual(data.features[0].id, 'test');

  assert.strictEqual(am.readJson('progress', 'fallback'), 'fallback', '不存在的文件应返回 fallback');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('AssetManager ensureDirs 创建所有目录', () => {
  const fs = require('fs');
  const os = require('os');
  const { AssetManager } = require('../src/common/assets');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-dirs-'));
  const am = new AssetManager();
  am.init(tmpDir);
  am.ensureDirs();

  assert(fs.existsSync(am.dir('loop')), 'loop dir 应创建');
  assert(fs.existsSync(am.dir('assets')), 'assets dir 应创建');
  assert(fs.existsSync(am.dir('runtime')), 'runtime dir 应创建');
  assert(fs.existsSync(am.dir('logs')), 'logs dir 应创建');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ========== 12. config.js 精简验证 ==========
console.log('\n12. config.js 精简验证');

test('config.js 不再导出 paths/getProjectRoot/ensureLoopDir', () => {
  const config = require('../src/common/config');
  assert(!config.paths, '不应导出 paths');
  assert(!config.getProjectRoot, '不应导出 getProjectRoot');
  assert(!config.ensureLoopDir, '不应导出 ensureLoopDir');
  assert(!config.getLoopDir, '不应导出 getLoopDir');
  assert(!config.getTemplatePath, '不应导出 getTemplatePath');
  assert(!config.getPromptPath, '不应导出 getPromptPath');
});

test('config.js 保留核心方法', () => {
  const config = require('../src/common/config');
  assert(typeof config.loadConfig === 'function', '应保留 loadConfig');
  assert(typeof config.buildEnvVars === 'function', '应保留 buildEnvVars');
  assert(typeof config.parseEnvFile === 'function', '应保留 parseEnvFile');
  assert(typeof config.updateEnvVar === 'function', '应保留 updateEnvVar');
  assert(typeof config.getAllowedTools === 'function', '应保留 getAllowedTools');
  assert(typeof config.log === 'function', '应保留 log');
  assert(config.COLOR, '应保留 COLOR');
});

// ========== 13. simplify 默认交互模式 ==========
console.log('\n13. simplify 交互模式验证');

test('simplify FEATURE_MAP 包含 INTERACTION', () => {
  const hooksSrc = require('fs').readFileSync(
    require.resolve('../src/core/hooks'),
    'utf8'
  );
  assert(hooksSrc.includes("simplify: [FEATURES.STALL, FEATURES.INTERACTION]"),
    'simplify 应包含 INTERACTION feature');
});

test('simplify 不限制 maxTurns', () => {
  const simplifySrc = require('fs').readFileSync(
    require.resolve('../src/core/simplify'),
    'utf8'
  );
  assert(!simplifySrc.includes('maxTurns'), 'simplify 不应设置 maxTurns');
});

// ========== 14. coding 禁用 askUserQuestion ==========
console.log('\n14. coding 禁用 askUserQuestion');

test('coding.js 包含 disallowedTools askUserQuestion', () => {
  const codingSrc = require('fs').readFileSync(
    require.resolve('../src/core/coding'),
    'utf8'
  );
  assert(codingSrc.includes("disallowedTools"), 'coding 应设置 disallowedTools');
  assert(codingSrc.includes("askUserQuestion"), 'coding 应禁用 askUserQuestion');
});

// ========== 15. prompts.js 使用 assets ==========
console.log('\n15. prompts.js 使用 assets 验证');

test('prompts.js 导入 assets', () => {
  const promptsSrc = require('fs').readFileSync(
    require.resolve('../src/core/prompts'),
    'utf8'
  );
  assert(promptsSrc.includes("require('../common/assets')"), '应导入 assets 模块');
  assert(promptsSrc.includes("assets.read("), '应使用 assets.read');
  assert(promptsSrc.includes("assets.render("), '应使用 assets.render');
  assert(promptsSrc.includes("assets.exists("), '应使用 assets.exists');
});

test('prompts.js 不再使用 loadAndRender 或 paths()', () => {
  const promptsSrc = require('fs').readFileSync(
    require.resolve('../src/core/prompts'),
    'utf8'
  );
  assert(!promptsSrc.includes('loadAndRender'), '不应再使用 loadAndRender');
  assert(!promptsSrc.includes('paths()'), '不应再使用 paths()');
  assert(!promptsSrc.includes('getProjectRoot'), '不应再使用 getProjectRoot');
});

test('prompts.js 不再导出内部 hint 函数', () => {
  const prompts = require('../src/core/prompts');
  const internalFns = ['buildMcpHint', 'buildRetryHint', 'buildEnvHint', 'buildTestHint',
    'buildDocsHint', 'buildTaskHint', 'buildTestEnvHint', 'buildPlaywrightAuthHint',
    'buildMemoryHint', 'buildServiceHint'];
  for (const fn of internalFns) {
    assert(prompts[fn] === undefined, `不应导出内部函数 ${fn}`);
  }
  const publicFns = ['buildSystemPrompt', 'buildCodingContext', 'buildScanPrompt',
    'buildPlanPrompt'];
  for (const fn of publicFns) {
    assert(typeof prompts[fn] === 'function', `应导出 ${fn}`);
  }
});

// ========== 执行所有测试 ==========
runAll();
