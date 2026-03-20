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
  assert(typeof initModule.executeInit === 'function');
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
  assert(deployed.some(f => f.includes('coreProtocol.md')), '应包含 coreProtocol.md');
  assert(deployed.some(f => f.includes('guidance.json')), '应包含 guidance.json');
});

test('AssetManager read 可读取模板内容', () => {
  const { assets } = require('../src/common/assets');
  const content = assets.read('coreProtocol');
  assert(content.length > 0, 'coreProtocol 应该有内容');
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

  const output = execSync(`${CLI} run --max 1 --dry-run 2>&1`, { encoding: 'utf8' });
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
  const { executeSimplify } = require('../src/core/simplify');
  assert(typeof executeSimplify === 'function');
});

test('simplify 模块加载正常', () => {
  cleanup();
  const { executeSimplify } = require('../src/core/simplify');
  assert(typeof executeSimplify === 'function');
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

test('selectNextTask 优先返回 pending 任务（failed 降级为最低优先）', () => {
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

  const { selectNextTask } = require('../src/core/state');
  const { loadTasks } = require('../src/common/tasks');
  const data = loadTasks();
  const next = selectNextTask(data);

  assert.strictEqual(next.status, 'pending');
  assert.strictEqual(next.id, '1');
});

test('selectNextTask pending 无依赖时返回', () => {
  cleanup();
  ensureDir();

  const { assets } = require('../src/common/assets');
  fs.writeFileSync(assets.path('tasks'), JSON.stringify({
    features: [
      { id: '1', description: 'Task 1', status: 'pending' },
      { id: '2', description: 'Task 2', status: 'done' }
    ]
  }));

  const { selectNextTask } = require('../src/core/state');
  const { loadTasks } = require('../src/common/tasks');
  const data = loadTasks();
  const next = selectNextTask(data);

  assert.strictEqual(next.status, 'pending');
  assert.strictEqual(next.id, '1');
});

test('selectNextTask pending 有依赖时跳过', () => {
  cleanup();
  ensureDir();

  const { assets } = require('../src/common/assets');
  fs.writeFileSync(assets.path('tasks'), JSON.stringify({
    features: [
      { id: '1', description: 'Task 1', status: 'pending', depends_on: ['2'] },
      { id: '2', description: 'Task 2', status: 'pending' }
    ]
  }));

  const { selectNextTask } = require('../src/core/state');
  const { loadTasks } = require('../src/common/tasks');
  const data = loadTasks();
  const next = selectNextTask(data);

  assert.strictEqual(next.id, '2');
});

test('saveTasks 正确保存状态变更', () => {
  cleanup();
  ensureDir();

  const { assets } = require('../src/common/assets');
  fs.writeFileSync(assets.path('tasks'), JSON.stringify({
    features: [{ id: '1', description: 'Task 1', status: 'pending' }]
  }));

  const { loadTasks, saveTasks } = require('../src/common/tasks');
  const data = loadTasks();
  data.features[0].status = 'in_progress';
  saveTasks(data);

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

// ========== 10. --deploy-templates CLI 参数 ==========
console.log('\n10. --deploy-templates CLI 参数测试');

test('parseArgs 识别 --deploy-templates', () => {
  const cliSrc = fs.readFileSync(path.join(__dirname, '..', 'bin', 'cli.js'), 'utf8');
  assert(cliSrc.includes("'--deploy-templates'"), 'CLI 应包含 --deploy-templates case');
  assert(cliSrc.includes('deployTemplates'), 'CLI 应设置 deployTemplates 选项');
});

test('--deploy-templates 出现在帮助文档', () => {
  const output = execSync(`${CLI} --help`, { encoding: 'utf8' });
  assert(output.includes('--deploy-templates'), '帮助文档应包含 --deploy-templates');
});

test('init --deploy-templates 部署模板文件', () => {
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

  const deployed = assets.deployAll();
  assert(deployed.length > 0, '--deploy-templates 应部署文件');
  assert(fs.existsSync(assets.dir('assets')), 'assets 目录应存在');
});

// ========== 11. recipesDir() 双路径解析 ==========
console.log('\n11. recipesDir() 双路径解析测试');

test('recipesDir 无项目 recipes 时返回 bundled 路径', () => {
  cleanup();

  const { AssetManager } = require('../src/common/assets');
  const os = require('os');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recipes-test-'));
  const am = new AssetManager();
  am.init(tmpDir);

  const result = am.recipesDir();
  assert(result.includes('recipes'), 'recipesDir 应包含 recipes');
  assert(!result.includes('.claude-coder'), '应返回 bundled 路径而非项目路径');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('recipesDir 有项目 recipes 时优先返回项目路径', () => {
  cleanup();

  const { AssetManager } = require('../src/common/assets');
  const os = require('os');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recipes-test-'));
  const am = new AssetManager();
  am.init(tmpDir);

  const projectRecipes = path.join(tmpDir, '.claude-coder', 'recipes');
  fs.mkdirSync(projectRecipes, { recursive: true });
  fs.writeFileSync(path.join(projectRecipes, 'custom.md'), '# Custom Recipe');

  const result = am.recipesDir();
  assert(result.includes('.claude-coder'), '应返回项目级 recipes 路径');
  assert(result.endsWith('recipes'), '路径应以 recipes 结尾');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('recipesDir 空项目 recipes 目录时回退到 bundled', () => {
  cleanup();

  const { AssetManager } = require('../src/common/assets');
  const os = require('os');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recipes-test-'));
  const am = new AssetManager();
  am.init(tmpDir);

  const projectRecipes = path.join(tmpDir, '.claude-coder', 'recipes');
  fs.mkdirSync(projectRecipes, { recursive: true });

  const result = am.recipesDir();
  assert(!result.includes('.claude-coder'), '空目录应回退到 bundled');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ========== 12. checkReady 仅检查 profile ==========
console.log('\n12. checkReady 仅检查 profile 测试');

test('checkReady 仅检查 profile 不检查 recipes', () => {
  const indexSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8');
  assert(indexSrc.includes("assets.exists('profile')"), 'checkReady 应检查 profile');
  assert(!indexSrc.includes('recipes'), 'checkReady 不应检查 recipes');
});

test('checkReady 对 init/scan 命令跳过检查', () => {
  const indexSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8');
  assert(indexSrc.includes("'init'"), 'init 应跳过 checkReady');
  assert(indexSrc.includes("'scan'"), 'scan 应跳过 checkReady');
});

// ========== 13. TypeScript 声明文件 ==========
console.log('\n13. TypeScript 声明文件测试');

test('types/index.d.ts 文件存在', () => {
  const dtsPath = path.join(__dirname, '..', 'types', 'index.d.ts');
  assert(fs.existsSync(dtsPath), 'types/index.d.ts 应存在');
});

test('types/index.d.ts 包含核心类型声明', () => {
  const dtsContent = fs.readFileSync(path.join(__dirname, '..', 'types', 'index.d.ts'), 'utf8');
  assert(dtsContent.includes('export declare class Session'), '应声明 Session 类');
  assert(dtsContent.includes('export declare class Indicator'), '应声明 Indicator 类');
  assert(dtsContent.includes('export declare function main'), '应声明 main 函数');
  assert(dtsContent.includes('export interface MainOpts'), '应声明 MainOpts 接口');
  assert(dtsContent.includes('export interface QueryResult'), '应声明 QueryResult 接口');
  assert(dtsContent.includes('export declare class AssetManager'), '应声明 AssetManager 类');
  assert(dtsContent.includes('recipesDir'), '应声明 recipesDir 方法');
  assert(dtsContent.includes('deployTemplates'), '应声明 deployTemplates 选项');
});

test('package.json 引用 types 字段', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.strictEqual(pkg.types, 'types/index.d.ts', 'package.json types 应指向声明文件');
  assert(pkg.files.includes('types/'), 'package.json files 应包含 types/');
});

// ========== 14. simplify.js 新功能 ==========
console.log('\n14. simplify.js 新功能测试');

test('simplify.js 包含 AUTO_COMMIT_MSG 常量', () => {
  const simplifySrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'simplify.js'), 'utf8');
  assert(simplifySrc.includes("style: auto simplify"), '应包含 auto simplify 提交信息');
});

test('simplify.js 包含 getSmartDiffRange 函数', () => {
  const simplifySrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'simplify.js'), 'utf8');
  assert(simplifySrc.includes('getSmartDiffRange'), '应包含 getSmartDiffRange 函数');
  assert(simplifySrc.includes('git log --grep'), '应使用 git log --grep 查找历史');
});

test('simplify.js 包含 commitIfDirty 函数', () => {
  const simplifySrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'simplify.js'), 'utf8');
  assert(simplifySrc.includes('commitIfDirty'), '应包含 commitIfDirty 函数');
  assert(simplifySrc.includes('git diff --quiet'), '应使用 git diff --quiet 检测变更');
});

// ========== 15. Session JSDoc / 类型注解 ==========
console.log('\n15. Session JSDoc 类型注解测试');

test('Session 类方法包含 JSDoc 注解', () => {
  const sessionSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'session.js'), 'utf8');
  assert(sessionSrc.includes('@param'), 'Session 应有 @param 注解');
  assert(sessionSrc.includes('@returns'), 'Session 应有 @returns 注解');
  assert(sessionSrc.includes('ensureSDK'), 'Session 应有 ensureSDK 方法');
  assert(sessionSrc.includes('buildQueryOptions'), 'Session 应有 buildQueryOptions 方法');
  assert(sessionSrc.includes('runQuery'), 'Session 应有 runQuery 方法');
});

// ========== 16. plan.js onMessage Write 捕获 ==========
console.log('\n16. plan.js onMessage 路径捕获测试');

test('plan.js 使用 onMessage 捕获 Write 工具路径', () => {
  const planSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'plan.js'), 'utf8');
  assert(planSrc.includes('onMessage'), 'plan.js 应使用 onMessage 回调');
  assert(planSrc.includes("tool_use"), 'plan.js 应检查 tool_use 类型');
  assert(planSrc.includes("Write"), 'plan.js 应检查 Write 工具');
  assert(planSrc.includes('.claude/plans/'), 'plan.js 应匹配 plans 路径');
});

test('plan.js 不再使用 extractPlanPathFromMessages', () => {
  const planSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'plan.js'), 'utf8');
  assert(!planSrc.includes('extractPlanPathFromMessages'), '应已移除 extractPlanPathFromMessages');
});

// 清理
console.log('\n清理测试环境...');
cleanup();

// 结果
console.log('\n========================================');
console.log(`  测试结果: ${testsPassed} passed, ${testsFailed} failed`);
console.log('========================================\n');

process.exit(testsFailed > 0 ? 1 : 0);
