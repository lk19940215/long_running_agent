'use strict';

const fs = require('fs');
const path = require('path');
const { inferPhaseStep } = require('../common/indicator');
const { log, paths } = require('../common/config');
const { EDIT_THRESHOLD, FILES } = require('../common/constants');

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const DEFAULT_EDIT_THRESHOLD = EDIT_THRESHOLD;
const SESSION_RESULT_FILENAME = FILES.SESSION_RESULT;

// Feature name constants
const FEATURES = Object.freeze({
  GUIDANCE: 'guidance',
  EDIT_GUARD: 'editGuard',
  COMPLETION: 'completion',
  STALL: 'stall',
});

// ─────────────────────────────────────────────────────────────
// GuidanceInjector: JSON-based configurable guidance system
// ─────────────────────────────────────────────────────────────

class GuidanceInjector {
  constructor() {
    this.rules = [];
    this.cache = {};
    this.injectedRules = new Set(); // Track which rules have been injected once
    this.loaded = false;
  }

  /**
   * Load rules from user's guidance.json
   */
  load() {
    if (this.loaded) return;

    const p = paths();
    const configPath = p.userGuidanceFile;

    try {
      const content = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(content);
      this.rules = config.rules || [];
    } catch {
      // Config file not found or parse error
      this.rules = [];
    }

    this.loaded = true;
  }

  /**
   * Get nested field value from object
   * @param {object} obj - Source object
   * @param {string} fieldPath - Dot-separated path (e.g., "tool_input.command")
   */
  getFieldValue(obj, fieldPath) {
    return fieldPath.split('.').reduce((o, k) => o?.[k], obj);
  }

  /**
   * Check if condition matches
   * Supports: { field, pattern } or { any: [...] }
   */
  matchCondition(input, condition) {
    if (!condition) return true;

    // Single condition: { field, pattern }
    if (condition.field && condition.pattern !== undefined) {
      const value = this.getFieldValue(input, condition.field);
      return new RegExp(condition.pattern, 'i').test(String(value || ''));
    }

    // Multiple conditions (OR): { any: [...] }
    if (condition.any && Array.isArray(condition.any)) {
      return condition.any.some(c => this.matchCondition(input, c));
    }

    return true;
  }

  /**
   * Extract tool tip key from tool name
   * @param {string} toolName - Full tool name (e.g., "mcp__playwright__browser_snapshot")
   * @param {string} extractor - Regex pattern to extract key
   */
  extractToolTipKey(toolName, extractor) {
    if (!extractor) return null;
    const match = toolName.match(new RegExp(extractor));
    return match ? match[1] : null;
  }

  /**
   * Get rule file content
   * @param {object|string} file - File config or path string
   * @param {string} basePath - Base directory for relative paths
   */
  getFileContent(file, basePath) {
    if (!file) return null;

    const filePath = typeof file === 'string' ? file : file.path;
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(basePath, filePath);

    try {
      return fs.readFileSync(absolutePath, 'utf8');
    } catch {
      return null;
    }
  }

  /**
   * Process a single rule and return guidance content
   */
  processRule(rule, input, basePath) {
    // Check matcher
    if (!new RegExp(rule.matcher).test(input.tool_name)) {
      return null;
    }

    // Check condition
    if (!this.matchCondition(input, rule.condition)) {
      return null;
    }

    const result = { guidance: '', tip: '' };

    // Process file content
    if (rule.file) {
      const fileConfig = typeof rule.file === 'object' ? rule.file : { path: rule.file };
      const injectOnce = fileConfig.injectOnce === true;
      const ruleKey = `${rule.name}_file`;

      // Skip if already injected and injectOnce is true
      if (injectOnce && this.injectedRules.has(ruleKey)) {
        // Don't inject file content again
      } else {
        if (injectOnce) this.injectedRules.add(ruleKey);

        // Get cached content or read file
        const cacheKey = `${rule.name}_content`;
        if (!this.cache[cacheKey]) {
          this.cache[cacheKey] = this.getFileContent(fileConfig.path, basePath);
        }
        result.guidance = this.cache[cacheKey] || '';
      }
    }

    // Process tool tips
    if (rule.toolTips && rule.toolTips.items) {
      const tipKey = this.extractToolTipKey(input.tool_name, rule.toolTips.extractor);
      if (tipKey && rule.toolTips.items[tipKey]) {
        const tipInjectOnce = rule.toolTips.injectOnce !== false; // Default true
        const tipRuleKey = `${rule.name}_tip_${tipKey}`;

        if (!tipInjectOnce || !this.injectedRules.has(tipRuleKey)) {
          if (tipInjectOnce) this.injectedRules.add(tipRuleKey);
          result.tip = rule.toolTips.items[tipKey];
        }
      }
    }

    return result;
  }

  /**
   * Create hook function for PreToolUse
   */
  createHook() {
    // Cache paths at hook creation time
    const cachedPaths = paths();

    return async (input) => {
      this.load();

      if (this.rules.length === 0) return {};

      const guidanceParts = [];
      const tipParts = [];

      for (const rule of this.rules) {
        const result = this.processRule(rule, input, cachedPaths.loopDir);
        if (result) {
          if (result.guidance) guidanceParts.push(result.guidance);
          if (result.tip) tipParts.push(result.tip);
        }
      }

      // Combine guidance and tips
      const allParts = [...guidanceParts, ...tipParts];
      if (allParts.length === 0) return {};

      return { additionalContext: allParts.join('\n\n') };
    };
  }
}

// Singleton instance
const guidanceInjector = new GuidanceInjector();

// ─────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────

function logToolCall(logStream, input) {
  if (!logStream) return;
  const target = input.tool_input?.file_path || input.tool_input?.path || '';
  const cmd = input.tool_input?.command || '';
  const pattern = input.tool_input?.pattern || '';
  const detail = target || cmd.slice(0, 200) || (pattern ? `pattern: ${pattern}` : '');
  if (detail) {
    logStream.write(`[${new Date().toISOString()}] ${input.tool_name}: ${detail}\n`);
  }
}

function isSessionResultWrite(toolName, toolInput) {
  if (toolName === 'Write') {
    const target = toolInput?.file_path || toolInput?.path || '';
    return target.endsWith(SESSION_RESULT_FILENAME);
  }
  if (toolName === 'Bash') {
    const cmd = toolInput?.command || '';
    if (!cmd.includes(SESSION_RESULT_FILENAME)) return false;
    return />\s*[^\s]*session_result/.test(cmd);
  }
  return false;
}

// ─────────────────────────────────────────────────────────────
// Module Factories
// ─────────────────────────────────────────────────────────────

/**
 * Create guidance injection module
 */
function createGuidanceModule() {
  return {
    hook: {
      matcher: '*',
      hooks: [guidanceInjector.createHook()]
    }
  };
}

/**
 * Create edit guard module
 */
function createEditGuardModule(options) {
  const editCounts = {};
  const threshold = options.editThreshold || DEFAULT_EDIT_THRESHOLD;

  return {
    hook: async (input) => {
      if (!['Write', 'Edit', 'MultiEdit'].includes(input.tool_name)) return {};
      const target = input.tool_input?.file_path || input.tool_input?.path || '';
      if (!target) return {};

      editCounts[target] = (editCounts[target] || 0) + 1;
      if (editCounts[target] > threshold) {
        return {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: `已对 ${target} 编辑 ${editCounts[target]} 次，疑似死循环。请重新审视方案后再继续。`
          }
        };
      }
      return {};
    }
  };
}

/**
 * Create stall detection module (includes completion timeout handling)
 */
function createStallModule(indicator, logStream, options) {
  let stallDetected = false;
  let stallChecker = null;
  const timeoutMs = options.stallTimeoutMs || 1200000;
  const completionTimeoutMs = options.completionTimeoutMs || 300000;
  const abortController = options.abortController;
  let completionDetectedAt = 0;

  const checkStall = () => {
    const now = Date.now();
    const idleMs = now - indicator.lastActivityTime;

    // Priority: completion timeout
    if (completionDetectedAt > 0) {
      const sinceCompletion = now - completionDetectedAt;
      if (sinceCompletion > completionTimeoutMs && !stallDetected) {
        stallDetected = true;
        const shortMin = Math.ceil(completionTimeoutMs / 60000);
        const actualMin = Math.floor(sinceCompletion / 60000);
        log('warn', `\nsession_result 已写入 ${actualMin} 分钟，超过 ${shortMin} 分钟上限，自动中断`);
        if (logStream) {
          logStream.write(`\n[${new Date().toISOString()}] STALL: session_result 写入后 ${actualMin} 分钟（上限 ${shortMin} 分钟），自动中断\n`);
        }
        if (abortController) {
          abortController.abort();
          log('warn', '\n已发送中断信号');
        }
      }
      return;
    }

    // Normal stall detection
    if (idleMs > timeoutMs && !stallDetected) {
      stallDetected = true;
      const idleMin = Math.floor(idleMs / 60000);
      log('warn', `\n无响应超过 ${idleMin} 分钟，自动中断 session`);
      if (logStream) {
        logStream.write(`\n[${new Date().toISOString()}] STALL: 无响应 ${idleMin} 分钟，自动中断\n`);
      }
      if (abortController) {
        abortController.abort();
        log('warn', '\n已发送中断信号');
      }
    }
  };

  stallChecker = setInterval(checkStall, 30000);

  return {
    setCompletionDetected: () => { completionDetectedAt = Date.now(); },
    onCompletionDetected: () => {
      completionDetectedAt = Date.now();
      const shortMin = Math.ceil(completionTimeoutMs / 60000);
      indicator.setCompletionDetected(shortMin);
      log('info', '');
      log('info', `检测到 session_result 写入，${shortMin} 分钟内模型未终止将自动中断`);
      if (logStream) {
        logStream.write(`\n[${new Date().toISOString()}] COMPLETION_DETECTED: session_result.json written, ${shortMin}min grace period\n`);
      }
    },
    cleanup: () => { if (stallChecker) clearInterval(stallChecker); },
    isStalled: () => stallDetected
  };
}

/**
 * Create completion detection module (PostToolUse hook)
 */
function createCompletionModule(indicator, stallModule) {
  return {
    hook: async (input) => {
      indicator.updatePhase('thinking');
      indicator.updateStep('');
      indicator.toolTarget = '';

      if (isSessionResultWrite(input.tool_name, input.tool_input)) {
        stallModule.onCompletionDetected();
      }
      return {};
    }
  };
}

/**
 * Create logging hook
 */
function createLoggingHook(indicator, logStream) {
  return async (input) => {
    inferPhaseStep(indicator, input.tool_name, input.tool_input);
    logToolCall(logStream, input);
    return {};
  };
}

// ─────────────────────────────────────────────────────────────
// Hook Factory: createHooks
// ─────────────────────────────────────────────────────────────

const FEATURE_MAP = {
  coding: [FEATURES.GUIDANCE, FEATURES.EDIT_GUARD, FEATURES.COMPLETION, FEATURES.STALL],
  plan: [FEATURES.STALL],
  scan: [FEATURES.STALL],
  add: [FEATURES.STALL],
  simplify: [FEATURES.STALL],
  custom: null
};

/**
 * Create hooks based on session type
 */
function createHooks(type, indicator, logStream, options = {}) {
  const features = type === 'custom'
    ? (options.features || [FEATURES.STALL])
    : (FEATURE_MAP[type] || [FEATURES.STALL]);

  const modules = {};

  if (features.includes(FEATURES.STALL)) {
    modules.stall = createStallModule(indicator, logStream, options);
  }

  if (features.includes(FEATURES.EDIT_GUARD)) {
    modules.editGuard = createEditGuardModule(options);
  }

  if (features.includes(FEATURES.COMPLETION) && modules.stall) {
    modules.completion = createCompletionModule(indicator, modules.stall);
  }

  if (features.includes(FEATURES.GUIDANCE)) {
    modules.guidance = createGuidanceModule();
  }

  // Assemble PreToolUse hooks
  const preToolUseHooks = [];
  preToolUseHooks.push(createLoggingHook(indicator, logStream));

  if (modules.editGuard) {
    preToolUseHooks.push(modules.editGuard.hook);
  }

  if (modules.guidance) {
    preToolUseHooks.push(...modules.guidance.hook.hooks);
  }

  // Assemble PostToolUse hooks
  const postToolUseHooks = [];
  if (modules.completion) {
    postToolUseHooks.push(modules.completion.hook);
  }

  // Build hooks object
  const hooks = {};
  if (preToolUseHooks.length > 0) {
    hooks.PreToolUse = [{ matcher: '*', hooks: preToolUseHooks }];
  }
  if (postToolUseHooks.length > 0) {
    hooks.PostToolUse = [{ matcher: '*', hooks: postToolUseHooks }];
  }

  // Cleanup functions
  const cleanupFns = [];
  if (modules.stall) {
    cleanupFns.push(modules.stall.cleanup);
  }

  return {
    hooks,
    cleanup: () => cleanupFns.forEach(fn => fn()),
    isStalled: () => modules.stall?.isStalled() || false
  };
}

// ─────────────────────────────────────────────────────────────
// Backward Compatibility: createSessionHooks
// ─────────────────────────────────────────────────────────────

function createSessionHooks(indicator, logStream, options = {}) {
  const {
    enableStallDetection = false,
    enableEditGuard = false,
    enableCompletionDetection = true,
    enableGuidanceInjection = false,
  } = options;

  const features = ['stall'];

  if (!enableStallDetection) {
    features.pop();
  }

  if (enableEditGuard) features.push('editGuard');
  if (enableCompletionDetection) features.push('completion');
  if (enableGuidanceInjection) features.push('guidance');

  return createHooks('custom', indicator, logStream, { ...options, features });
}

// ─────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────

module.exports = {
  // Main API
  createHooks,
  createSessionHooks,

  // GuidanceInjector class
  GuidanceInjector,

  // Module factories
  createGuidanceModule,
  createEditGuardModule,
  createCompletionModule,
  createStallModule,

  // Constants
  FEATURES,

  // Utilities
  logToolCall,
  isSessionResultWrite,
};