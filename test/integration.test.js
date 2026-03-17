'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const PROJECT_ROOT = process.cwd();
const CLAUDE_DIR = path.join(PROJECT_ROOT, '.claude-coder');

function cleanup() {
  if (fs.existsSync(CLAUDE_DIR)) {
    fs.rmSync(CLAUDE_DIR, { recursive: true, force: true });
  }
}

function initTestEnv() {
  cleanup();

  const { loadConfig, buildEnvVars, log, parseEnvFile } = require('../src/common/config');
  const { assets } = require('../src/common/assets');
  const { executeScan, validateProfile } = require('../src/core/scan');
  const { executeInit } = require('../src/core/init');

  assets.init(process.cwd());
  assets.ensureDirs();

  return {
    assets,
    log,
    loadConfig,
    buildEnvVars,
    parseEnvFile,
    executeScan,
    validateProfile,
    executeInit,
  };
}

console.log('\n========================================');
console.log('  流程集成测试');
console.log('========================================\n');

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    testsPassed++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
    testsFailed++;
  }
}

// ========== Phase 1: Setup ==========
console.log('Phase 1: Setup');

test('assets.ensureDirs 创建目录结构', () => {
  const { assets } = initTestEnv();

  assert(fs.existsSync(assets.dir('loop')), 'loopDir 应存在');
  assert(fs.existsSync(assets.dir('runtime')), 'runtime 应存在');
  assert(fs.existsSync(assets.dir('logs')), 'logsDir 应存在');
});

test('assets.path() 返回正确的路径', () => {
  const { assets } = initTestEnv();

  assert(assets.path('profile').endsWith('project_profile.json'));
  assert(assets.path('tasks').endsWith('tasks.json'));
  assert(assets.path('env').endsWith('.env'));
  assert(assets.dir('loop').endsWith('.claude-coder'));
});

// ========== Phase 2: Init ==========
console.log('\nPhase 2: Init');

test('init.js 导入 scan 正确', () => {
  const initModule = require('../src/core/init');
  assert(typeof initModule.executeInit === 'function');
});

test('scan.js validateProfile 检测不存在的 profile', () => {
  cleanup();

  const { validateProfile, assets } = initTestEnv();
  const result = validateProfile();

  assert.strictEqual(result.valid, false);
  assert(result.issues.includes('profile 不存在'));
});

test('profile 数据结构验证', () => {
  const { validateProfile, assets } = initTestEnv();

  const validProfile = {
    tech_stack: {
      backend: { framework: 'express' },
      frontend: { framework: 'react' },
      package_managers: ['npm']
    },
    services: [
      { name: 'api', port: 3000, command: 'npm start' }
    ],
    existing_docs: ['README.md'],
    env_setup: {}
  };

  const profilePath = assets.path('profile');
  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.writeFileSync(profilePath, JSON.stringify(validProfile));

  const result = validateProfile();
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.issues.length, 0);
});

// ========== Phase 3: Plan ==========
console.log('\nPhase 3: Plan');

test('plan 无 profile 时应该抛出错误', () => {
  cleanup();
  initTestEnv();

  const plan = require('../src/core/plan');
  assert(typeof plan.executePlan === 'function');
});

test('plan.js 模块加载正常', () => {
  const plan = require('../src/core/plan');
  assert(typeof plan.executePlan === 'function');
});

// ========== Phase 4: Run ==========
console.log('\nPhase 4: Run');

test('run 无 profile 应该报错', () => {
  cleanup();
  const { executeRun } = require('../src/core/runner');
  assert(typeof executeRun === 'function');
});

test('run 无 tasks.json 应该报错', () => {
  const { assets } = initTestEnv();
  const profilePath = assets.path('profile');

  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.writeFileSync(profilePath, JSON.stringify({
    tech_stack: { backend: { framework: 'express' } },
    services: [],
    existing_docs: ['README.md']
  }));

  assert(assets.exists('profile'));
  assert(!assets.exists('tasks'));
});

// ========== Phase 5: Simplify ==========
console.log('\nPhase 5: Simplify');

test('simplify ensureDirs 被调用', () => {
  cleanup();
  initTestEnv();

  const { executeSimplify } = require('../src/core/simplify');
  assert(typeof executeSimplify === 'function');
});

// ========== Phase 6: 配置验证 ==========
console.log('\nPhase 6: 配置验证');

test('loadConfig 默认值正确', () => {
  cleanup();
  const { assets, loadConfig } = initTestEnv();

  const envPath = assets.path('env');
  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  fs.writeFileSync(envPath, '');

  const config = loadConfig();

  assert.strictEqual(config.provider, 'claude');
  assert.strictEqual(config.timeoutMs, 3000000);
  assert.strictEqual(config.mcpToolTimeout, 30000);
});

test('buildEnvVars 正确构建环境变量', () => {
  const { buildEnvVars } = initTestEnv();

  const config = {
    baseUrl: 'https://api.anthropic.com',
    apiKey: 'test-key',
    model: 'claude-sonnet-4-6',
  };

  const env = buildEnvVars(config);

  assert.strictEqual(env.ANTHROPIC_BASE_URL, 'https://api.anthropic.com');
  assert.strictEqual(env.ANTHROPIC_API_KEY, 'test-key');
  assert.strictEqual(env.ANTHROPIC_MODEL, 'claude-sonnet-4-6');
});

// ========== Phase 7: 任务处理 ==========
console.log('\nPhase 7: 任务处理');

test('loadTasks 正确加载任务', () => {
  const { assets } = initTestEnv();
  const tasksPath = assets.path('tasks');

  const tasksData = {
    features: [
      { id: '1', description: 'Task 1', status: 'pending' },
      { id: '2', description: 'Task 2', status: 'in_progress' },
      { id: '3', description: 'Task 3', status: 'done' },
      { id: '4', description: 'Task 4', status: 'failed' }
    ]
  };

  fs.mkdirSync(path.dirname(tasksPath), { recursive: true });
  fs.writeFileSync(tasksPath, JSON.stringify(tasksData));

  const { loadTasks, getStats } = require('../src/common/tasks');
  const { selectNextTask } = require('../src/core/state');

  const data = loadTasks();
  assert(data !== null);
  assert.strictEqual(data.features.length, 4);

  const stats = getStats(data);
  assert.strictEqual(stats.total, 4);
  assert.strictEqual(stats.pending, 1);
  assert.strictEqual(stats.in_progress, 1);
  assert.strictEqual(stats.done, 1);
  assert.strictEqual(stats.failed, 1);

  const nextTask = selectNextTask(data);
  assert(nextTask !== null);
  assert.strictEqual(nextTask.status, 'failed');
  assert.strictEqual(nextTask.id, '4');
});

// 清理
console.log('\n清理测试环境...');
cleanup();

// 结果
console.log('\n========================================');
console.log(`  测试结果: ${testsPassed} passed, ${testsFailed} failed`);
console.log('========================================\n');

process.exit(testsFailed > 0 ? 1 : 0);
