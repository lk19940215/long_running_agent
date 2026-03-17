'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { execSync } = require('child_process');

const TEST_DIR = path.join(__dirname, 'fixtures', 'test-project');
const CLI = `node ${path.join(__dirname, '..', 'bin', 'cli.js')}`;

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    testsPassed++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
    testsFailed++;
  }
}

function cleanup() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
  const claudeDir = path.join(process.cwd(), '.claude-coder');
  if (fs.existsSync(claudeDir)) {
    fs.rmSync(claudeDir, { recursive: true, force: true });
  }
}

function ensureDir() {
  const { assets } = require('../src/common/assets');
  assets.init(process.cwd());
  assets.ensureDirs();
}

// ============ 测试套件 ============

console.log('\n========================================');
console.log('  Claude Coder 流程测试');
console.log('========================================\n');

// Phase 1: CLI 基础测试
console.log('Phase 1: CLI 基础测试');

test('--help 应该显示帮助信息', () => {
  const output = execSync(`${CLI} --help`, { encoding: 'utf8' });
  assert(output.includes('claude-coder'));
  assert(output.includes('run'));
  assert(output.includes('setup'));
  assert(output.includes('init'));
  assert(output.includes('plan'));
});

test('--version 应该显示版本号', () => {
  const output = execSync(`${CLI} --version`, { encoding: 'utf8' });
  assert(/^\d+\.\d+\.\d+/.test(output.trim()));
});

// Phase 2: 目录结构测试
console.log('\nPhase 2: 目录结构测试');

test('assets.ensureDirs 应该创建正确的目录结构', () => {
  const { assets } = require('../src/common/assets');
  assets.init(process.cwd());
  assets.ensureDirs();

  assert(fs.existsSync(assets.dir('loop')), '.claude-coder 应该存在');
  assert(fs.existsSync(assets.dir('runtime')), '.runtime 应该存在');
  assert(fs.existsSync(assets.dir('logs')), 'logs 目录应该存在');
});

// Phase 3: 配置模块测试
console.log('\nPhase 3: 配置模块测试');

test('loadConfig 应该返回正确的配置对象', () => {
  const { loadConfig } = require('../src/common/config');
  const { assets } = require('../src/common/assets');

  const envPath = assets.path('env');
  const envContent = `
MODEL_PROVIDER=claude
ANTHROPIC_API_KEY=test-key
ANTHROPIC_MODEL=claude-sonnet-4-6
API_TIMEOUT_MS=3000000
`;
  fs.writeFileSync(envPath, envContent);

  const config = loadConfig();

  assert.strictEqual(config.provider, 'claude');
  assert.strictEqual(config.apiKey, 'test-key');
  assert.strictEqual(config.model, 'claude-sonnet-4-6');
  assert.strictEqual(config.timeoutMs, 3000000);
});

test('parseEnvFile 应该正确解析 .env 文件', () => {
  const { parseEnvFile } = require('../src/common/config');
  const { assets } = require('../src/common/assets');

  const envPath = assets.path('env');
  const env = parseEnvFile(envPath);

  assert.strictEqual(env.MODEL_PROVIDER, 'claude');
  assert.strictEqual(env.ANTHROPIC_API_KEY, 'test-key');
});

// Phase 4: 前置条件检查测试
console.log('\nPhase 4: 前置条件检查测试');

test('plan 无 profile 时应该报错并提示运行 init', () => {
  const { assets } = require('../src/common/assets');
  const profilePath = assets.path('profile');

  if (fs.existsSync(profilePath)) {
    fs.unlinkSync(profilePath);
  }

  try {
    execSync(`${CLI} plan "test" --planOnly`, { encoding: 'utf8', stdio: 'pipe' });
    assert.fail('应该抛出错误');
  } catch (err) {
    const output = err.stdout || err.stderr || '';
    assert(output.includes('profile') || output.includes('init'), '应该提示运行 init');
  }
});

test('run 无 profile 时应该报错', () => {
  const { assets } = require('../src/common/assets');
  const profilePath = assets.path('profile');
  const tasksPath = assets.path('tasks');

  if (fs.existsSync(profilePath)) fs.unlinkSync(profilePath);
  if (fs.existsSync(tasksPath)) fs.unlinkSync(tasksPath);

  try {
    const output = execSync(`${CLI} run --max 1`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    assert(output.includes('profile') || output.includes('init'), '应该提示运行 init');
  } catch (err) {
    const output = err.stderr?.toString() || err.stdout?.toString() || '';
    assert(output.includes('profile') || output.includes('init'), '应该提示运行 init');
  }
});

test('run 无 tasks.json 时应该报错并提示运行 plan', () => {
  const { assets } = require('../src/common/assets');
  const profilePath = assets.path('profile');
  const tasksPath = assets.path('tasks');

  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.writeFileSync(profilePath, JSON.stringify({
    tech_stack: { backend: { framework: 'express' } },
    services: [],
    existing_docs: ['README.md']
  }));

  const recipesDir = path.join(path.dirname(profilePath), 'recipes');
  fs.mkdirSync(recipesDir, { recursive: true });
  fs.writeFileSync(path.join(recipesDir, 'placeholder.md'), '');

  if (fs.existsSync(tasksPath)) fs.unlinkSync(tasksPath);

  try {
    const output = execSync(`${CLI} run --max 1`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    assert(output.includes('tasks') || output.includes('plan'), '应该提示运行 plan');
  } catch (err) {
    const output = err.stderr?.toString() || err.stdout?.toString() || '';
    assert(output.includes('tasks') || output.includes('plan'), '应该提示运行 plan');
  }
});

// Phase 5: 模块导出测试
console.log('\nPhase 5: 模块导出测试');

test('scan.js 应该导出正确的函数', () => {
  const scan = require('../src/core/scan');
  assert(typeof scan.executeScan === 'function');
  assert(typeof scan.validateProfile === 'function');
});

test('init.js 应该导出 executeInit 函数', () => {
  const { executeInit } = require('../src/core/init');
  assert(typeof executeInit === 'function');
});

test('plan.js 应该导出正确的函数', () => {
  const plan = require('../src/core/plan');
  assert(typeof plan.executePlan === 'function');
});

test('runner.js 应该导出 executeRun 函数', () => {
  const { executeRun } = require('../src/core/runner');
  assert(typeof executeRun === 'function');
});

test('simplify.js 应该导出正确的函数', () => {
  const simplify = require('../src/core/simplify');
  assert(typeof simplify.executeSimplify === 'function');
});

// Phase 6: 任务模块测试
console.log('\nPhase 6: 任务模块测试');

test('tasks.js 应该正确处理任务数据', () => {
  const { assets } = require('../src/common/assets');
  const tasksPath = assets.path('tasks');

  const tasksData = {
    features: [
      { id: '1', description: 'Test task 1', status: 'pending' },
      { id: '2', description: 'Test task 2', status: 'done' }
    ]
  };
  fs.writeFileSync(tasksPath, JSON.stringify(tasksData));

  const { loadTasks, getStats } = require('../src/common/tasks');
  const data = loadTasks();

  assert(data !== null);
  assert.strictEqual(data.features.length, 2);

  const stats = getStats(data);
  assert.strictEqual(stats.total, 2);
  assert.strictEqual(stats.done, 1);
  assert.strictEqual(stats.pending, 1);
});

// Phase 7: simplify 目录检查测试
console.log('\nPhase 7: simplify 目录检查测试');

test('simplify 应该确保目录存在', async () => {
  const { assets } = require('../src/common/assets');
  const logsDir = assets.dir('logs');

  if (fs.existsSync(logsDir)) {
    fs.rmSync(logsDir, { recursive: true, force: true });
  }

  assets.ensureDirs();

  assert(fs.existsSync(logsDir), 'logs 目录应该被创建');
});

// 清理
console.log('\n清理测试环境...');
cleanup();

// 结果
console.log('\n========================================');
console.log(`  测试结果: ${testsPassed} passed, ${testsFailed} failed`);
console.log('========================================\n');

process.exit(testsFailed > 0 ? 1 : 0);
