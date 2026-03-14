'use strict';

const fs = require('fs');
const path = require('path');
const { loadConfig } = require('../common/config');
const { assets } = require('../common/assets');
const { loadTasks, findNextTask, getStats } = require('../common/tasks');
const { loadState } = require('../common/state');

// --------------- System Prompt ---------------

function buildSystemPrompt(type) {
  const core = assets.read('coreProtocol') || '';
  let specific = '';
  switch (type) {
    case 'scan':    specific = assets.read('scanSystem') || ''; break;
    case 'coding':  specific = assets.read('codingSystem') || ''; break;
  }
  return specific ? `${core}\n\n${specific}` : core;
}

// --------------- Hint Builders ---------------

function buildRequirementsHint() {
  const reqPath = path.join(assets.projectRoot, 'requirements.md');
  if (!fs.existsSync(reqPath)) return '';
  return `需求文档: ${reqPath}。第一步先读取，了解用户的技术约束和偏好。`;
}

function buildMcpHint(config) {
  return config.mcpPlaywright
    ? '前端/全栈任务可用 Playwright MCP（browser_navigate、browser_snapshot、browser_click 等）做端到端测试。'
    : '';
}

function buildRetryHint(consecutiveFailures, lastValidateLog) {
  if (consecutiveFailures > 0 && lastValidateLog) {
    return `\n注意：上次会话校验失败，原因：${lastValidateLog}。请避免同样的问题。`;
  }
  return '';
}

function buildEnvHint(consecutiveFailures, sessionNum) {
  if (consecutiveFailures === 0 && sessionNum > 1) {
    return '环境已就绪，第二步可跳过 claude-coder init，仅确认服务存活。涉及新依赖时仍需运行 claude-coder init。';
  }
  return '';
}

function buildDocsHint() {
  const profile = assets.readJson('profile', null);
  if (!profile) return '';
  let hint = '';
  const docs = profile.existing_docs || [];
  if (docs.length > 0) {
    hint = `项目文档: ${docs.join(', ')}。Step 4 编码前先读与任务相关的文档，了解接口约定和编码规范。完成后若新增了模块或 API，更新对应文档。`;
  }
  if (profile.tech_stack?.backend?.framework &&
      (!profile.services || profile.services.length === 0)) {
    hint += ' 注意：project_profile.json 的 services 为空，请在本次 session 末尾补全 services 数组（command, port, health_check）。';
  }
  if (!docs.length) {
    hint += ' 注意：project_profile.json 的 existing_docs 为空，请在 Step 6 收尾时补全文档列表。';
  }
  return hint;
}

function buildTaskHint(projectRoot) {
  try {
    const taskData = loadTasks();
    if (!taskData) return '';
    const next = findNextTask(taskData);
    const stats = getStats(taskData);
    if (next) {
      return `任务上下文: ${next.id} "${next.description}" (${next.status}), ` +
        `category=${next.category}, steps=${next.steps.length}步。` +
        `进度: ${stats.done}/${stats.total} done, ${stats.failed} failed。` +
        `项目绝对路径: ${projectRoot}。运行时目录: ${projectRoot}/.claude-coder/（隐藏目录）。` +
        `第一步无需读取 tasks.json（已注入），直接确认任务后进入 Step 2。`;
    }
  } catch { /* ignore */ }
  return '';
}

function buildTestEnvHint(projectRoot) {
  if (assets.exists('testEnv')) {
    return `测试凭证文件: ${projectRoot}/.claude-coder/test.env（含 API Key、测试账号等），测试前用 source ${projectRoot}/.claude-coder/test.env 加载。发现新凭证需求时可追加写入（KEY=value 格式）。`;
  }
  return `如需持久化测试凭证（API Key、测试账号密码等），写入 ${projectRoot}/.claude-coder/test.env（KEY=value 格式，每行一个）。后续 session 会自动感知。`;
}

function buildPlaywrightAuthHint(config) {
  if (!config.mcpPlaywright) return '';
  const mode = config.playwrightMode;
  switch (mode) {
    case 'persistent':
      return 'Playwright MCP 使用 persistent 模式（user-data-dir），浏览器登录状态持久保存在本地配置中，无需额外登录操作。';
    case 'isolated':
      return assets.exists('playwrightAuth')
        ? 'Playwright MCP 使用 isolated 模式，已检测到登录状态文件（playwright-auth.json），每次会话自动加载 cookies 和 localStorage。'
        : 'Playwright MCP 使用 isolated 模式，但未检测到登录状态文件。如目标页面需要登录，请先运行 claude-coder auth <URL>。';
    case 'extension':
      return 'Playwright MCP 使用 extension 模式，已连接用户真实浏览器，直接复用浏览器已有的登录态和扩展。注意：操作会影响用户正在使用的浏览器。';
    default:
      return '';
  }
}

function buildMemoryHint() {
  const sr = assets.readJson('sessionResult', null);
  if (!sr?.session_result) return '';
  const base = `上次会话 ${sr.session_result}（${sr.status_before || '?'} → ${sr.status_after || '?'}）。`;
  if (!sr.notes || !sr.notes.trim()) return base;
  return `${base}遗留: ${sr.notes.slice(0, 200)}`;
}

function buildServiceHint(maxSessions) {
  return maxSessions === 1
    ? '单次模式：收尾时停止所有后台服务。'
    : '连续模式：收尾时不要停止后台服务，保持服务运行以便下个 session 继续使用。';
}

// --------------- Context Builders ---------------

/**
 * 构建 coding session 的完整上下文（user prompt）
 */
function buildCodingContext(sessionNum, opts = {}) {
  const config = loadConfig();
  const consecutiveFailures = opts.consecutiveFailures || 0;
  const projectRoot = assets.projectRoot;

  return assets.render('codingUser', {
    sessionNum,
    requirementsHint: buildRequirementsHint(),
    mcpHint: buildMcpHint(config),
    retryContext: buildRetryHint(consecutiveFailures, opts.lastValidateLog),
    envHint: buildEnvHint(consecutiveFailures, sessionNum),
    docsHint: buildDocsHint(),
    taskHint: buildTaskHint(projectRoot),
    testEnvHint: buildTestEnvHint(projectRoot),
    playwrightAuthHint: buildPlaywrightAuthHint(config),
    memoryHint: buildMemoryHint(),
    serviceHint: buildServiceHint(opts.maxSessions || 50),
  });
}

// --------------- Scan Session ---------------

function buildScanPrompt(projectType) {
  return assets.render('scanUser', { projectType });
}

// --------------- Plan Session ---------------

function buildPlanSystemPrompt() {
  return assets.read('planSystem') || '';
}

function buildPlanPrompt(planPath) {
  const projectRoot = assets.projectRoot;

  let taskContext = '';
  let recentExamples = '';
  try {
    const taskData = loadTasks();
    if (taskData) {
      const features = taskData.features || [];
      const state = loadState();
      const nextId = `feat-${String(state.next_task_id).padStart(3, '0')}`;
      const categories = [...new Set(features.map(f => f.category))].join(', ');

      taskContext = `新任务 ID 从 ${nextId} 开始，priority 从 ${state.next_priority} 开始。已有 category: ${categories || '无'}。`;

      const recent = features.slice(-3);
      if (recent.length) {
        recentExamples = '已有任务格式参考（保持一致性）：\n' +
          recent.map(f => `  ${f.id}: "${f.description}" (category=${f.category}, steps=${(f.steps || []).length}步, depends_on=[${(f.depends_on || []).join(',')}])`).join('\n');
      }
    }
  } catch { /* ignore */ }

  let testRuleHint = '';
  if (assets.exists('testRule') && assets.exists('mcpConfig')) {
    testRuleHint = '【Playwright 测试规则】项目已配置 Playwright MCP（.mcp.json），' +
      '`.claude-coder/assets/test_rule.md` 包含测试规范（Smart Snapshot、等待策略、步骤模板等）。' +
      'test 类任务 steps 首步加入 `【规则】阅读 .claude-coder/test_rule.md`。';
  }

  return assets.render('addUser', {
    taskContext,
    recentExamples,
    projectRoot,
    testRuleHint,
    planPath,
  });
}

// --------------- Exports ---------------

module.exports = {
  buildSystemPrompt,
  buildCodingContext,
  buildScanPrompt,
  buildPlanSystemPrompt,
  buildPlanPrompt,
};
