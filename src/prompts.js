'use strict';

const fs = require('fs');
const { paths, loadConfig, getRequirementsHash } = require('./config');

/**
 * Build system prompt by combining template files.
 * @param {boolean} includeScanProtocol - Whether to append SCAN_PROTOCOL.md
 */
function buildSystemPrompt(includeScanProtocol = false) {
  const p = paths();
  let prompt = fs.readFileSync(p.claudeMd, 'utf8');
  if (includeScanProtocol && fs.existsSync(p.scanProtocol)) {
    prompt += '\n\n' + fs.readFileSync(p.scanProtocol, 'utf8');
  }
  return prompt;
}

/**
 * Build user prompt for coding sessions.
 * Includes conditional hints based on session state.
 */
function buildCodingPrompt(sessionNum, opts = {}) {
  const p = paths();
  const config = loadConfig();
  const consecutiveFailures = opts.consecutiveFailures || 0;

  // Hint 1: Requirements change detection
  const reqHash = getRequirementsHash();
  let reqSyncHint = '';
  if (reqHash) {
    fs.writeFileSync(p.reqHashFile, reqHash, 'utf8');
    let lastHash = '';
    if (fs.existsSync(p.syncState)) {
      try { lastHash = JSON.parse(fs.readFileSync(p.syncState, 'utf8')).last_requirements_hash || ''; } catch { /* ignore */ }
    }
    if (lastHash !== reqHash) {
      reqSyncHint = '需求已变更：第一步中请读取 requirements.md，将新增需求追加为 pending 任务到 tasks.json。';
    }
  } else if (fs.existsSync(p.reqHashFile)) {
    fs.unlinkSync(p.reqHashFile);
  }

  // Hint 2: Playwright MCP availability
  const mcpHint = config.mcpPlaywright
    ? '前端/全栈任务可用 Playwright MCP（browser_navigate、browser_snapshot、browser_click 等）做端到端测试。'
    : '';

  // Hint 3: Retry context from previous failures
  let retryContext = '';
  if (consecutiveFailures > 0 && opts.lastValidateLog) {
    retryContext = `\n注意：上次会话校验失败，原因：${opts.lastValidateLog}。请避免同样的问题。`;
  }

  // Hint 4: Environment readiness
  let envHint = '';
  if (consecutiveFailures === 0 && sessionNum > 1) {
    envHint = '环境已就绪，第二步可跳过 auto-coder init，仅确认服务存活。涉及新依赖时仍需运行 auto-coder init。';
  }

  // Hint 5: Existing test records
  let testHint = '';
  if (fs.existsSync(p.testsFile)) {
    try {
      const count = (JSON.parse(fs.readFileSync(p.testsFile, 'utf8')).test_cases || []).length;
      if (count > 0) testHint = `tests.json 已有 ${count} 条验证记录，Step 5 时先查已有记录避免重复验证。`;
    } catch { /* ignore */ }
  }

  // Hint 6: Project documentation awareness
  let docsHint = '';
  if (fs.existsSync(p.profile)) {
    try {
      const profile = JSON.parse(fs.readFileSync(p.profile, 'utf8'));
      const docs = profile.existing_docs || [];
      if (docs.length > 0) {
        docsHint = `项目文档: ${docs.join(', ')}。Step 4 编码前先读与任务相关的文档，了解接口约定和编码规范。完成后若新增了模块或 API，更新对应文档。`;
      }
    } catch { /* ignore */ }
  }

  return [
    `Session ${sessionNum}。执行 6 步流程。`,
    '效率要求：先规划后编码，完成全部编码后再统一测试，禁止编码-测试反复跳转。后端任务用 curl 验证，不启动浏览器。',
    reqSyncHint,
    mcpHint,
    testHint,
    docsHint,
    envHint,
    `完成后写入 session_result.json。${retryContext}`,
  ].filter(Boolean).join('\n');
}

/**
 * Build task decomposition guide for scan and add sessions.
 * Placed in user prompt (recency zone) for maximum attention.
 */
function buildTaskGuide(projectType) {
  const lines = [
    '任务分解指导（严格遵守）：',
    '1. 粒度：每个任务是独立可测试的功能单元，1-3 session 可完成，不超 500 行新增',
    '2. steps 具体可验证：最后一步必须是 curl/grep 等验证命令',
    '3. depends_on 形成 DAG（有向无环图），不得循环依赖',
    '4. 单任务 steps 不超过 5 步，超过则拆分为多个任务',
    '5. category 准确：backend | frontend | fullstack | infra',
    '6. 第一个任务从第一个有业务逻辑的功能开始，不重复脚手架内容',
    '',
    '验证命令模板：',
    '  API: curl -s -o /dev/null -w "%{http_code}" http://localhost:PORT/path → 200',
    '  文件: grep -q "关键内容" path/to/file && echo "pass"',
    '  构建: npm run build 2>&1 | tail -1 → 无 error',
    '',
    '反面案例（禁止出现）：',
    '  X "实现用户功能" → 太模糊，应拆为具体接口',
    '  X "编写测试" → 无具体内容，测试应内嵌在 steps 末尾',
    '  X steps 只有 "实现xxx" 没有验证步骤',
  ];

  if (projectType === 'new') {
    lines.push('', '新项目注意：infra 任务合并为尽量少的条目，不拆碎');
  }
  return lines.join('\n');
}

/**
 * Build user prompt for scan sessions.
 */
function buildScanPrompt(projectType, requirement) {
  const taskGuide = buildTaskGuide(projectType);
  return [
    '你是项目初始化 Agent，同时也是资深的需求分析师。',
    '',
    `项目类型: ${projectType}`,
    `用户需求: ${requirement || '(无指定需求)'}`,
    '',
    '步骤 1-2：按「项目扫描协议」扫描项目、生成 project_profile.json。',
    '步骤 3：根据以下指导分解任务到 tasks.json（格式见 CLAUDE.md）：',
    '',
    taskGuide,
    '',
    '步骤 4：写入 session_result.json 并 git commit。',
  ].join('\n');
}

/**
 * Build user prompt for view sessions.
 * @param {Object} opts - { needsScan, projectType, requirement, allDone }
 */
function buildViewPrompt(opts = {}) {
  if (opts.needsScan) {
    return `你是项目初始化 Agent。项目类型: ${opts.projectType}。用户需求: ${opts.requirement || ''}。按照「项目扫描协议」执行。`;
  }
  if (opts.allDone) {
    return '所有任务已完成，无需执行 6 步流程。直接与用户对话，按需回答问题或执行临时请求。';
  }
  return '执行 6 步流程，完成下一个任务。';
}

/**
 * Build user prompt for add sessions.
 */
function buildAddPrompt(instruction) {
  const taskGuide = buildTaskGuide();
  return [
    '重要：这是任务追加 session，不是常规编码 session。不执行 6 步流程。',
    '',
    '步骤：',
    '1. 读取 .auto-coder/tasks.json 了解已有任务和最大 id/priority',
    '2. 读取 .auto-coder/project_profile.json 了解项目技术栈',
    '3. 根据用户指令追加新任务（status: pending）',
    '',
    taskGuide,
    '',
    '新任务 id 和 priority 从已有最大值递增。不修改已有任务，不实现代码。',
    'git add -A && git commit -m "chore: add new tasks"',
    '写入 session_result.json',
    '',
    `用户指令：${instruction}`,
  ].join('\n');
}

module.exports = {
  buildSystemPrompt,
  buildCodingPrompt,
  buildTaskGuide,
  buildScanPrompt,
  buildViewPrompt,
  buildAddPrompt,
};
