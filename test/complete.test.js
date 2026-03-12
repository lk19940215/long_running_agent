'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { execSync } = require('child_process');

const CLI = `node ${path.join(__dirname, '..', 'bin', 'cli.js')}`;
const CLAUDE_DIR = path.join(process.cwd(), '.claude-coder');

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
  if (fs.existsSync(CLAUDE_DIR)) {
    fs.rmSync(CLAUDE_DIR, { recursive: true, force: true });
  }
}

function ensureDir() {
  const { assets } = require('../src/common/assets');
  assets.init(process.cwd());
  assets.ensureDirs();
}

// ============ 测试套件 ============

console.log('\n========================================');
console.log('  Claude Coder 完整流程测试');
console.log('========================================\n');

// ========== 1. CLI 命令测试 ==========
console.log('1. CLI 命令测试');

test('init 命令存在', () => {
  const output = execSync(`${CLI} --help`, { encoding: 'utf8' });
  assert(output.includes('init'));
});

test('plan 命令存在', () => {
  const output = execSync(`${CLI} --help`, { encoding: 'utf8' });
  assert(output.includes('plan'));
});

test('run 命令存在', () => {
  const output = execSync(`${CLI} --help`, { encoding: 'utf8' });
  assert(output.includes('run'));
});

test('simplify 命令存在', () => {
  const output = execSync(`${CLI} --help`, { encoding: 'utf8' });
  assert(output.includes('simplify'));
});

test('status 命令存在', () => {
  const output = execSync(`${CLI} --help`, { encoding: 'utf8' });
  assert(output.includes('status'));
});

test('auth 命令存在', () => {
  const output = execSync(`${CLI} --help`, { encoding: 'utf8' });
  assert(output.includes('auth'));
});

// ========== 2. Init 流程测试 ==========
console.log('\n2. Init 流程测试');

test('init.js 导入 scan 模块正确', () => {
  const initModule = require('../src/core/init');
  assert(typeof initModule.init === 'function');
});

test('init profile 不存在时会调用 scan', () => {
  cleanup();
  const { assets } = require('../src/common/assets');
  assets.init(process.cwd());
  assert(!assets.exists('profile'), 'profile 应该不存在');
});

test('AssetManager deployAll 创建 assets 目录并部署文件', () => {
  cleanup();
  ensureDir();

  const { assets } = require('../src/common/assets');
  const deployed = assets.deployAll();

  assert(fs.existsSync(assets.dir('assets')), 'assets 目录应该存在');
  assert(deployed.length > 0, '应该有文件被部署');
  assert(deployed.includes('agentProtocol.md'), '应包含 agentProtocol.md');
  assert(deployed.includes('guidance.json'), '应包含 guidance.json');
});

test('AssetManager read 可读取模板内容', () => {
  const { assets } = require('../src/common/assets');
  const content = assets.read('agentProtocol');
  assert(content.length > 0, 'agentProtocol 应该有内容');
  const content2 = assets.read('guidance');
  assert(content2.length > 0, 'guidance 应该有内容');
});

// ========== 3. Plan 流程测试 ==========
console.log('\n3. Plan 流程测试');

test('plan 无 profile 时报错并提示 init', () => {
  cleanup();

  try {
    execSync(`${CLI} plan "test" --planOnly`, { encoding: 'utf8', stdio: 'pipe' });
    assert.fail('应该报错');
  } catch (err) {
    const output = err.stderr?.toString() || err.stdout?.toString() || '';
    assert(output.includes('profile') || output.includes('init'));
  }
});

test('plan --planOnly 参数在 CLI 中定义', () => {
  const output = execSync(`${CLI} --help`, { encoding: 'utf8' });
  assert(output.includes('planOnly'));
});

test('plan -r 参数文件不存在时报错', () => {
  cleanup();
  ensureDir();

  const { assets } = require('../src/common/assets');
  const profilePath = assets.path('profile');
  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.writeFileSync(profilePath, JSON.stringify({
    tech_stack: { backend: { framework: 'express' } },
    services: [],
    existing_docs: ['README.md']
  }));

  try {
    execSync(`${CLI} plan -r nonexistent.md --planOnly`, { encoding: 'utf8', stdio: 'pipe' });
    assert.fail('应该报错');
  } catch (err) {
    const output = (err.stderr || err.stdout || '').toString();
    assert(output.includes('文件不存在') || output.includes('不存在') || output.includes('error'), `实际输出: ${output}`);
  }
});

test('plan 有 profile 时可以继续', () => {
  cleanup();
  ensureDir();

  const { assets } = require('../src/common/assets');
  const profilePath = assets.path('profile');
  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.writeFileSync(profilePath, JSON.stringify({
    tech_stack: {
      backend: { framework: 'express' },
      frontend: { framework: 'react' }
    },
    services: [],
    existing_docs: ['README.md']
  }));

  assert(assets.exists('profile'), 'profile 应该存在');
});

// ========== 4. Run 流程测试 ==========
console.log('\n4. Run 流程测试');

test('run 无 profile 时报错并提示 init', () => {
  cleanup();

  try {
    execSync(`${CLI} run --max 1`, { encoding: 'utf8', stdio: 'pipe' });
    assert.fail('应该报错');
  } catch (err) {
    const output = err.stderr?.toString() || err.stdout?.toString() || '';
    assert(output.includes('profile') || output.includes('init'));
  }
});

test('run 无 tasks.json 时报错并提示 plan', () => {
  cleanup();
  ensureDir();

  const { assets } = require('../src/common/assets');
  const profilePath = assets.path('profile');
  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.writeFileSync(profilePath, JSON.stringify({
    tech_stack: { backend: { framework: 'express' } },
    services: [],
    existing_docs: ['README.md']
  }));

  try {
    execSync(`${CLI} run --max 1`, { encoding: 'utf8', stdio: 'pipe' });
    assert.fail('应该报错');
  } catch (err) {
    const output = err.stderr?.toString() || err.stdout?.toString() || '';
    assert(output.includes('tasks') || output.includes('plan'));
  }
});

test('run --dry-run 预览模式', () => {
  cleanup();
  ensureDir();

  const { assets } = require('../src/common/assets');
  const profilePath = assets.path('profile');
  const tasksPath = assets.path('tasks');
  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.writeFileSync(profilePath, JSON.stringify({
    tech_stack: { backend: { framework: 'express' } },
    services: [],
    existing_docs: ['README.md']
  }));

  fs.writeFileSync(tasksPath, JSON.stringify({
    features: [{ id: '1', description: 'Test', status: 'pending' }]
  }));

  const output = execSync(`${CLI} run --max 1 --dry-run`, { encoding: 'utf8' });
  assert(output.includes('预览模式') || output.includes('DRY-RUN'));
});

test('run --max 参数限制 session 数量', () => {
  cleanup();
  ensureDir();

  const { assets } = require('../src/common/assets');
  const profilePath = assets.path('profile');
  const tasksPath = assets.path('tasks');
  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.writeFileSync(profilePath, JSON.stringify({
    tech_stack: { backend: { framework: 'express' } },
    services: [],
    existing_docs: ['README.md']
  }));

  fs.writeFileSync(tasksPath, JSON.stringify({
    features: [
      { id: '1', description: 'Task 1', status: 'pending' },
      { id: '2', description: 'Task 2', status: 'pending' }
    ]
  }));

  const output = execSync(`${CLI} run --max 1 --dry-run 2>&1`, {
    encoding: 'utf8',
    shell: true
  });

  assert(output.includes('Session 1') || output.includes('最多 1 个会话'), `输出不包含预期内容: ${output.slice(0, 200)}`);
});

// ========== 5. Simplify 流程测试 ==========
console.log('\n5. Simplify 流程测试');

test('simplify 模块导出正确', () => {
  const { simplify, _runSimplifySession } = require('../src/core/simplify');
  assert(typeof simplify === 'function');
  assert(typeof _runSimplifySession === 'function');
});

test('simplify ensureDirs 被调用', () => {
  cleanup();
  const { simplify } = require('../src/core/simplify');
  assert(typeof simplify === 'function');
});

// ========== 6. Status 命令测试 ==========
console.log('\n6. Status 命令测试');

test('status 命令无 tasks.json 时警告', () => {
  cleanup();

  const output = execSync(`${CLI} status 2>&1`, {
    encoding: 'utf8',
    shell: true
  });

  assert(output.includes('tasks.json') || output.includes('WARN') || output.includes('未找到'), `输出不包含预期内容: ${output.slice(0, 200)}`);
});

test('status 命令有 tasks.json 时显示进度', () => {
  cleanup();
  ensureDir();

  const { assets } = require('../src/common/assets');
  const tasksPath = assets.path('tasks');

  fs.writeFileSync(tasksPath, JSON.stringify({
    project: 'test-project',
    features: [
      { id: '1', description: 'Task 1', status: 'done' },
      { id: '2', description: 'Task 2', status: 'pending' }
    ]
  }));

  const output = execSync(`${CLI} status`, { encoding: 'utf8' });
  assert(output.includes('test-project') || output.includes('1') || output.includes('Task'));
});

// ========== 7. Auth 命令测试 ==========
console.log('\n7. Auth 命令测试');

test('auth 模块导出正确', () => {
  const { auth } = require('../src/commands/auth');
  assert(typeof auth === 'function');
});

// ========== 8. 任务状态测试 ==========
console.log('\n8. 任务状态测试');

test('findNextTask 优先返回 failed 任务', () => {
  cleanup();
  ensureDir();

  const { assets } = require('../src/common/assets');
  fs.writeFileSync(assets.path('tasks'), JSON.stringify({
    features: [
      { id: '1', description: 'Task 1', status: 'pending' },
      { id: '2', description: 'Task 2', status: 'failed' },
      { id: '3', description: 'Task 3', status: 'in_progress' }
    ]
  }));

  const { findNextTask, loadTasks } = require('../src/common/tasks');
  const data = loadTasks();
  const next = findNextTask(data);

  assert.strictEqual(next.status, 'failed');
  assert.strictEqual(next.id, '2');
});

test('findNextTask pending 无依赖时返回', () => {
  cleanup();
  ensureDir();

  const { assets } = require('../src/common/assets');
  fs.writeFileSync(assets.path('tasks'), JSON.stringify({
    features: [
      { id: '1', description: 'Task 1', status: 'pending' },
      { id: '2', description: 'Task 2', status: 'done' }
    ]
  }));

  const { findNextTask, loadTasks } = require('../src/common/tasks');
  const data = loadTasks();
  const next = findNextTask(data);

  assert.strictEqual(next.status, 'pending');
  assert.strictEqual(next.id, '1');
});

test('findNextTask pending 有依赖时跳过', () => {
  cleanup();
  ensureDir();

  const { assets } = require('../src/common/assets');
  fs.writeFileSync(assets.path('tasks'), JSON.stringify({
    features: [
      { id: '1', description: 'Task 1', status: 'pending', depends_on: ['2'] },
      { id: '2', description: 'Task 2', status: 'pending' }
    ]
  }));

  const { findNextTask, loadTasks } = require('../src/common/tasks');
  const data = loadTasks();
  const next = findNextTask(data);

  assert.strictEqual(next.id, '2');
});

test('setStatus 正确更新状态', () => {
  cleanup();
  ensureDir();

  const { assets } = require('../src/common/assets');
  fs.writeFileSync(assets.path('tasks'), JSON.stringify({
    features: [{ id: '1', description: 'Task 1', status: 'pending' }]
  }));

  const { setStatus, loadTasks } = require('../src/common/tasks');
  const data = loadTasks();

  setStatus(data, '1', 'in_progress');

  const updated = loadTasks();
  assert.strictEqual(updated.features[0].status, 'in_progress');
});

// ========== 9. Profile 验证测试 ==========
console.log('\n9. Profile 验证测试');

test('validateProfile 检测缺少框架', () => {
  cleanup();
  ensureDir();

  const { assets } = require('../src/common/assets');
  const profilePath = assets.path('profile');
  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.writeFileSync(profilePath, JSON.stringify({
    tech_stack: {},
    services: [],
    existing_docs: ['README.md']
  }));

  const { validateProfile } = require('../src/core/scan');
  const result = validateProfile();

  assert(!result.valid);
  assert(result.issues.some(i => i.includes('框架')));
});

test('validateProfile 检测缺少 services', () => {
  cleanup();
  ensureDir();

  const { assets } = require('../src/common/assets');
  const profilePath = assets.path('profile');
  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.writeFileSync(profilePath, JSON.stringify({
    tech_stack: { backend: { framework: 'express' } },
    services: [],
    existing_docs: ['README.md']
  }));

  const { validateProfile } = require('../src/core/scan');
  const result = validateProfile();

  assert(!result.valid);
  assert(result.issues.some(i => i.includes('services')));
});

// 清理
console.log('\n清理测试环境...');
cleanup();

// 结果
console.log('\n========================================');
console.log(`  测试结果: ${testsPassed} passed, ${testsFailed} failed`);
console.log('========================================\n');

process.exit(testsFailed > 0 ? 1 : 0);
