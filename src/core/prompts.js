'use strict';

const { loadConfig } = require('../common/config');
const { assets } = require('../common/assets');
const { loadTasks, findNextTask, getStats } = require('../common/tasks');

// --------------- System Prompt ---------------

function buildSystemPrompt(includeScanProtocol = false) {
  let prompt = assets.read('agentProtocol');
  if (includeScanProtocol) {
    const scan = assets.read('scanProtocol');
    if (scan) prompt += '\n\n' + scan;
  }
  return prompt;
}

// --------------- Hint Builders ---------------

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

function buildTestHint() {
  const testsData = assets.readJson('tests', null);
  if (testsData) {
    const count = (testsData.test_cases || []).length;
    if (count > 0) return `tests.json 已有 ${count} 条验证记录，Step 5 时先查已有记录避免重复验证。`;
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
  if (sr?.session_result) {
    return `上次会话: ${sr.session_result}（${sr.status_before || '?'} → ${sr.status_after || '?'}）` +
      (sr.notes ? `, 要点: ${sr.notes.slice(0, 150)}` : '') + '。';
  }
  return '';
}

function buildServiceHint(maxSessions) {
  return maxSessions === 1
    ? '单次模式：收尾时停止所有后台服务。'
    : '连续模式：收尾时不要停止后台服务，保持服务运行以便下个 session 继续使用。';
}

// --------------- Coding Session ---------------

function buildCodingPrompt(sessionNum, opts = {}) {
  const config = loadConfig();
  const consecutiveFailures = opts.consecutiveFailures || 0;
  const projectRoot = assets.projectRoot;

  return assets.render('codingUser', {
    sessionNum,
    mcpHint: buildMcpHint(config),
    retryContext: buildRetryHint(consecutiveFailures, opts.lastValidateLog),
    envHint: buildEnvHint(consecutiveFailures, sessionNum),
    testHint: buildTestHint(),
    docsHint: buildDocsHint(),
    taskHint: buildTaskHint(projectRoot),
    testEnvHint: buildTestEnvHint(projectRoot),
    playwrightAuthHint: buildPlaywrightAuthHint(config),
    memoryHint: buildMemoryHint(),
    serviceHint: buildServiceHint(opts.maxSessions || 50),
  });
}

// --------------- Scan Session ---------------

function buildScanPrompt(projectType, requirement) {
  const requirementLine = requirement
    ? `用户需求概述: ${requirement.slice(0, 500)}`
    : '';

  return assets.render('scanUser', {
    projectType,
    requirement: requirementLine,
  });
}

// --------------- Plan Session ---------------

function buildPlanSystemPrompt() {
  return '你是一个任务分解专家，擅长将模糊需求拆解为结构化、可执行的原子任务。你只分析需求和分解任务，不实现任何代码。';
}

function buildPlanPrompt(planPath) {
  const projectRoot = assets.projectRoot;
  const addGuide = assets.read('addGuide');

  let profileContext = '';
  const profile = assets.readJson('profile', null);
  if (profile) {
    const stack = profile.tech_stack || {};
    const parts = [];
    if (stack.backend?.framework) parts.push(`后端: ${stack.backend.framework}`);
    if (stack.frontend?.framework) parts.push(`前端: ${stack.frontend.framework}`);
    if (stack.backend?.language) parts.push(`语言: ${stack.backend.language}`);
    if (parts.length) profileContext = `项目技术栈: ${parts.join(', ')}`;
  }

  let taskContext = '';
  let recentExamples = '';
  try {
    const taskData = loadTasks();
    if (taskData) {
      const stats = getStats(taskData);
      const features = taskData.features || [];
      const maxId = features.length ? features[features.length - 1].id : 'feat-000';
      const maxPriority = features.length ? Math.max(...features.map(f => f.priority || 0)) : 0;
      const categories = [...new Set(features.map(f => f.category))].join(', ');

      taskContext = `已有 ${stats.total} 个任务（${stats.done} done, ${stats.pending} pending, ${stats.failed} failed）。` +
        `最大 id: ${maxId}, 最大 priority: ${maxPriority}。已有 category: ${categories}。`;

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
      '`.claude-coder/assets/test_rule.md` 包含测试规范（Smart Snapshot、等待策略、步骤模板等）。端到端测试任务请参考 test_rule.md。';
  }

  return assets.render('addUser', {
    profileContext,
    taskContext,
    recentExamples,
    projectRoot,
    addGuide,
    testRuleHint,
    planPath,
  });
}

// --------------- Exports ---------------

module.exports = {
  buildSystemPrompt,
  buildCodingPrompt,
  buildScanPrompt,
  buildPlanSystemPrompt,
  buildPlanPrompt,
};
