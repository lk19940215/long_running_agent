'use strict';

const fs = require('fs');
const { paths, loadConfig, getProjectRoot } = require('../common/config');
const { readJson } = require('../common/utils');
const { loadTasks, findNextTask, getStats } = require('../common/tasks');

// --------------- Template Engine ---------------

/**
 * Replace {{key}} placeholders with values from vars object.
 * - Uses Object.prototype.hasOwnProperty.call to prevent prototype pollution
 * - Coerces values to string via String() for type safety
 * - Collapses 3+ consecutive newlines (from empty variables) into double newline
 * - Only matches \w+ inside {{ }}, so JSON braces and %{...} are safe
 */
function renderTemplate(template, vars = {}) {
  return template
    .replace(/\{\{(\w+)\}\}/g, (_, key) =>
      Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : ''
    )
    .replace(/^\s+$/gm, '')     // remove lines that became whitespace-only after replacement
    .replace(/\n{3,}/g, '\n\n') // collapse 3+ consecutive newlines into double
    .trim();
}

/**
 * Read a prompt template file and render it with variables.
 * Falls back to empty string if file doesn't exist.
 */
function loadAndRender(filepath, vars = {}) {
  if (!fs.existsSync(filepath)) return '';
  const template = fs.readFileSync(filepath, 'utf8');
  return renderTemplate(template, vars);
}

// --------------- System Prompt ---------------

/**
 * Build system prompt by combining prompt files.
 * CLAUDE.md and SCAN_PROTOCOL.md are read as-is (no variable injection).
 */
function buildSystemPrompt(includeScanProtocol = false) {
  const p = paths();
  let prompt = fs.readFileSync(p.claudeMd, 'utf8');
  if (includeScanProtocol && fs.existsSync(p.scanProtocol)) {
    prompt += '\n\n' + fs.readFileSync(p.scanProtocol, 'utf8');
  }
  return prompt;
}

// --------------- Coding Session ---------------

/**
 * Build user prompt for coding sessions.
 * Computes conditional hints, then injects them into coding_user.md template.
 */
function buildCodingPrompt(sessionNum, opts = {}) {
  const p = paths();
  const config = loadConfig();
  const consecutiveFailures = opts.consecutiveFailures || 0;
  const projectRoot = getProjectRoot();

  // Hint 1: Playwright MCP availability
  const mcpHint = config.mcpPlaywright
    ? '前端/全栈任务可用 Playwright MCP（browser_navigate、browser_snapshot、browser_click 等）做端到端测试。'
    : '';

  // Hint 2: Retry context from previous failures
  let retryContext = '';
  if (consecutiveFailures > 0 && opts.lastValidateLog) {
    retryContext = `\n注意：上次会话校验失败，原因：${opts.lastValidateLog}。请避免同样的问题。`;
  }

  // Hint 3: Environment readiness
  let envHint = '';
  if (consecutiveFailures === 0 && sessionNum > 1) {
    envHint = '环境已就绪，第二步可跳过 claude-coder init，仅确认服务存活。涉及新依赖时仍需运行 claude-coder init。';
  }

  // Hint 4: Existing test records
  let testHint = '';
  if (fs.existsSync(p.testsFile)) {
    const testsData = readJson(p.testsFile, null);
    if (testsData) {
      const count = (testsData.test_cases || []).length;
      if (count > 0) testHint = `tests.json 已有 ${count} 条验证记录，Step 5 时先查已有记录避免重复验证。`;
    }
  }

  // Hint 5: Project documentation awareness + profile quality check
  let docsHint = '';
  if (fs.existsSync(p.profile)) {
    const profile = readJson(p.profile, null);
    if (profile) {
      const docs = profile.existing_docs || [];
      if (docs.length > 0) {
        docsHint = `项目文档: ${docs.join(', ')}。Step 4 编码前先读与任务相关的文档，了解接口约定和编码规范。完成后若新增了模块或 API，更新对应文档。`;
      }
      if (profile.tech_stack?.backend?.framework &&
          (!profile.services || profile.services.length === 0)) {
        docsHint += ' 注意：project_profile.json 的 services 为空，请在本次 session 末尾补全 services 数组（command, port, health_check）。';
      }
      if (!docs.length) {
        docsHint += ' 注意：project_profile.json 的 existing_docs 为空，请在 Step 6 收尾时补全文档列表。';
      }
    }
  }

  // Hint 6: Task context (harness pre-read, saves Agent 2-3 Read calls)
  let taskHint = '';
  try {
    const taskData = loadTasks();
    if (taskData) {
      const next = findNextTask(taskData);
      const stats = getStats(taskData);
      if (next) {
        taskHint = `任务上下文: ${next.id} "${next.description}" (${next.status}), ` +
          `category=${next.category}, steps=${next.steps.length}步。` +
          `进度: ${stats.done}/${stats.total} done, ${stats.failed} failed。` +
          `项目绝对路径: ${projectRoot}。运行时目录: ${projectRoot}/.claude-coder/（隐藏目录）。` +
          `第一步无需读取 tasks.json（已注入），直接确认任务后进入 Step 2。`;
      }
    }
  } catch { /* ignore */ }

  // Hint 6b: Test environment variables (readable + writable by Agent)
  let testEnvHint = '';
  if (p.testEnvFile && fs.existsSync(p.testEnvFile)) {
    testEnvHint = `测试凭证文件: ${projectRoot}/.claude-coder/test.env（含 API Key、测试账号等），测试前用 source ${projectRoot}/.claude-coder/test.env 加载。发现新凭证需求时可追加写入（KEY=value 格式）。`;
  } else {
    testEnvHint = `如需持久化测试凭证（API Key、测试账号密码等），写入 ${projectRoot}/.claude-coder/test.env（KEY=value 格式，每行一个）。后续 session 会自动感知。`;
  }

  // Hint 6c: Playwright mode awareness
  let playwrightAuthHint = '';
  if (config.mcpPlaywright) {
    const mode = config.playwrightMode;
    switch (mode) {
      case 'persistent':
        playwrightAuthHint = 'Playwright MCP 使用 persistent 模式（user-data-dir），浏览器登录状态持久保存在本地配置中，无需额外登录操作。';
        break;
      case 'isolated':
        playwrightAuthHint = fs.existsSync(p.playwrightAuth)
          ? `Playwright MCP 使用 isolated 模式，已检测到登录状态文件（playwright-auth.json），每次会话自动加载 cookies 和 localStorage。`
          : 'Playwright MCP 使用 isolated 模式，但未检测到登录状态文件。如目标页面需要登录，请先运行 claude-coder auth <URL>。';
        break;
      case 'extension':
        playwrightAuthHint = 'Playwright MCP 使用 extension 模式，已连接用户真实浏览器，直接复用浏览器已有的登录态和扩展。注意：操作会影响用户正在使用的浏览器。';
        break;
    }
  }

  // Hint 7: Session memory (read flat session_result.json)
  let memoryHint = '';
  if (fs.existsSync(p.sessionResult)) {
    const sr = readJson(p.sessionResult, null);
    if (sr?.session_result) {
      memoryHint = `上次会话: ${sr.session_result}（${sr.status_before || '?'} → ${sr.status_after || '?'}）` +
        (sr.notes ? `, 要点: ${sr.notes.slice(0, 150)}` : '') + '。';
    }
  }

  // Hint 8: Service management (continuous vs single-shot mode)
  const maxSessions = opts.maxSessions || 50;
  const serviceHint = maxSessions === 1
    ? '单次模式：收尾时停止所有后台服务。'
    : '连续模式：收尾时不要停止后台服务，保持服务运行以便下个 session 继续使用。';

  return loadAndRender(p.codingUser, {
    sessionNum,
    mcpHint,
    retryContext,
    envHint,
    testHint,
    docsHint,
    taskHint,
    testEnvHint,
    playwrightAuthHint,
    memoryHint,
    serviceHint,
  });
}

// --------------- Scan Session ---------------

/**
 * Build user prompt for scan sessions.
 * Scan only generates profile — task decomposition is handled by add session.
 */
function buildScanPrompt(projectType, requirement) {
  const p = paths();
  const requirementLine = requirement
    ? `用户需求概述: ${requirement.slice(0, 500)}`
    : '';

  return loadAndRender(p.scanUser, {
    projectType,
    requirement: requirementLine,
  });
}

// --------------- Plan Session ---------------

/**
 * Build lightweight system prompt for plan sessions.
 * CLAUDE.md is NOT injected to avoid role conflict and save ~2000 tokens.
 */
function buildPlanSystemPrompt() {
  return '你是一个任务分解专家，擅长将模糊需求拆解为结构化、可执行的原子任务。你只分析需求和分解任务，不实现任何代码。';
}

/**
 * Build user prompt for plan sessions.
 * Structure: Role (primacy) → Dynamic context → ADD_GUIDE.md (reference) → Plan path (recency)
 * @param {string} planPath - Path to the generated plan file
 */
function buildPlanPrompt(planPath) {
  const p = paths();
  const projectRoot = getProjectRoot();

  // --- Load ADD_GUIDE.md reference document ---
  let addGuide = '';
  if (fs.existsSync(p.addGuide)) {
    addGuide = fs.readFileSync(p.addGuide, 'utf8');
  }

  // --- Context injection: project tech stack ---
  let profileContext = '';
  if (fs.existsSync(p.profile)) {
    const profile = readJson(p.profile, null);
    if (profile) {
      const stack = profile.tech_stack || {};
      const parts = [];
      if (stack.backend?.framework) parts.push(`后端: ${stack.backend.framework}`);
      if (stack.frontend?.framework) parts.push(`前端: ${stack.frontend.framework}`);
      if (stack.backend?.language) parts.push(`语言: ${stack.backend.language}`);
      if (parts.length) profileContext = `项目技术栈: ${parts.join(', ')}`;
    }
  }

  // --- Context injection: existing tasks summary ---
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

  // --- Conditional: Playwright test rule hint ---
  let testRuleHint = '';
  const testRulePath = p.userTestRule;
  const hasMcp = fs.existsSync(p.mcpConfig);
  if (fs.existsSync(testRulePath) && hasMcp) {
    testRuleHint = '【Playwright 测试规则】项目已配置 Playwright MCP（.mcp.json），' +
      '`.claude-coder/assets/test_rule.md` 包含测试规范（Smart Snapshot、等待策略、步骤模板等）。端到端测试任务请参考 test_rule.md。';
  }

  return loadAndRender(p.addUser, {
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
  renderTemplate,
  loadAndRender,
  buildSystemPrompt,
  buildCodingPrompt,
  buildScanPrompt,
  buildPlanSystemPrompt,
  buildPlanPrompt,
};
