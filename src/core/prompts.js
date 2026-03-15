'use strict';

const fs = require('fs');
const path = require('path');
const { loadConfig } = require('../common/config');
const { assets } = require('../common/assets');
const { loadTasks, getStats } = require('../common/tasks');
const { loadState, selectNextTask } = require('./harness');

// --------------- System Prompt ---------------

function buildSystemPrompt(type) {
  const core = assets.read('coreProtocol') || '';
  let specific = '';
  switch (type) {
    case 'scan':    specific = assets.read('scanSystem') || ''; break;
    case 'coding':  specific = assets.read('codingSystem') || ''; break;
    case 'plan':    specific = assets.read('planSystem') || ''; break;
    case 'go':      specific = assets.read('goSystem') || ''; break;
  }
  return specific ? `${specific}\n\n${core}` : core;
}

// --------------- Task Type Detection ---------------

const WEB_CATEGORIES = new Set(['frontend', 'fullstack', 'test', 'e2e']);
const WEB_KEYWORDS = /playwright|browser|页面|前端|UI|端到端|e2e/i;

function needsWebTools(task) {
  if (!task) return true;
  if (WEB_CATEGORIES.has(task.category)) return true;
  const text = [task.description || '', ...(task.steps || [])].join(' ');
  return WEB_KEYWORDS.test(text);
}

// --------------- Hint Builders ---------------

function buildMcpHint(config, task) {
  if (!config.mcpPlaywright) return '';
  if (!needsWebTools(task)) return '';
  return '前端/全栈任务可用 Playwright MCP（browser_navigate、browser_snapshot、browser_click 等）做端到端测试。';
}

function buildRetryHint(consecutiveFailures, lastValidateLog) {
  if (consecutiveFailures > 0 && lastValidateLog) {
    return `注意：上次会话校验失败，原因：${lastValidateLog}。请避免同样的问题。`;
  }
  return '';
}

function buildEnvHint(consecutiveFailures, sessionNum) {
  if (sessionNum <= 1) return '首次会话，需要时执行 claude-coder init 初始化环境。';
  if (consecutiveFailures > 0) return '上次失败，建议先确认环境状态。';
  return '';
}

function buildDocsHint() {
  const profile = assets.readJson('profile', null);
  if (!profile) return '';
  const docs = profile.existing_docs || [];
  if (docs.length > 0) {
    return `项目文档: ${docs.join(', ')}。编码前先读与任务相关的文档，了解接口约定和编码规范。`;
  }
  return '';
}

function buildTaskContext(projectRoot, taskId) {
  try {
    const taskData = loadTasks();
    if (!taskData) return '无法读取 tasks.json，请手动检查。';
    const features = taskData.features || [];
    const stats = getStats(taskData);

    const task = taskId
      ? features.find(f => f.id === taskId)
      : selectNextTask(taskData);

    if (!task) return '无待处理任务。';

    const steps = (task.steps || [])
      .map((s, i) => `  ${i + 1}. ${s}`)
      .join('\n');

    const deps = (task.depends_on || []).length > 0
      ? `depends_on: [${task.depends_on.join(', ')}]`
      : '';

    return [
      `**${task.id}**: "${task.description}"`,
      `状态: ${task.status}, category: ${task.category}, priority: ${task.priority || 'N/A'} ${deps}`,
      `步骤:\n${steps}`,
      `进度: ${stats.done}/${stats.total} done, ${stats.failed} failed`,
      `项目路径: ${projectRoot}`,
    ].join('\n');
  } catch {
    return '任务上下文加载失败，请读取 .claude-coder/tasks.json 自行确认。';
  }
}

function buildTestEnvHint(projectRoot) {
  if (assets.exists('testEnv')) {
    return `测试凭证文件: ${projectRoot}/.claude-coder/test.env（含 API Key、测试账号等），测试前用 source 加载。`;
  }
  return '';
}

function buildPlaywrightAuthHint(config, task) {
  if (!config.mcpPlaywright) return '';
  if (!needsWebTools(task)) return '';
  const mode = config.playwrightMode;
  switch (mode) {
    case 'persistent':
      return 'Playwright MCP 使用 persistent 模式，浏览器登录状态持久保存，无需额外登录操作。';
    case 'isolated':
      return assets.exists('playwrightAuth')
        ? 'Playwright MCP 使用 isolated 模式，已检测到登录状态文件，每次会话自动加载。'
        : 'Playwright MCP 使用 isolated 模式，未检测到登录状态文件。如需登录，请先运行 claude-coder auth <URL>。';
    case 'extension':
      return 'Playwright MCP 使用 extension 模式，已连接用户真实浏览器，直接复用已有登录态。';
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

function _resolveTask(taskId) {
  try {
    const taskData = loadTasks();
    if (!taskData) return null;
    const features = taskData.features || [];
    return taskId ? features.find(f => f.id === taskId) : selectNextTask(taskData);
  } catch { return null; }
}

/**
 * 构建 coding session 的完整上下文（user prompt）
 */
function buildCodingContext(sessionNum, opts = {}) {
  const config = loadConfig();
  const consecutiveFailures = opts.consecutiveFailures || 0;
  const projectRoot = assets.projectRoot;
  const task = _resolveTask(opts.taskId);

  return assets.render('codingUser', {
    sessionNum,
    taskContext: buildTaskContext(projectRoot, opts.taskId),
    mcpHint: buildMcpHint(config, task),
    retryContext: buildRetryHint(consecutiveFailures, opts.lastValidateLog),
    envHint: buildEnvHint(consecutiveFailures, sessionNum),
    docsHint: buildDocsHint(),
    testEnvHint: buildTestEnvHint(projectRoot),
    playwrightAuthHint: buildPlaywrightAuthHint(config, task),
    memoryHint: buildMemoryHint(),
    serviceHint: buildServiceHint(opts.maxSessions || 50),
  });
}

// --------------- Scan Session ---------------

function buildScanPrompt(projectType) {
  return assets.render('scanUser', { projectType });
}

// --------------- Plan Session ---------------

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
      '前端页面 test 类任务 steps 首步加入 `【规则】阅读 .claude-coder/assets/test_rule.md`。';
  }

  return assets.render('planUser', {
    taskContext,
    recentExamples,
    projectRoot,
    planPath,
    testRuleHint,
  });
}

// --------------- Exports ---------------

module.exports = {
  buildSystemPrompt,
  buildCodingContext,
  buildScanPrompt,
  buildPlanPrompt,
};
