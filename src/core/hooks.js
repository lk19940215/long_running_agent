'use strict';

const fs = require('fs');
const path = require('path');
const { inferPhaseStep } = require('../common/indicator');
const { log } = require('../common/config');
const { EDIT_THRESHOLD } = require('../common/constants');
const { createAskUserQuestionHook } = require('../common/interaction');
const { assets } = require('../common/assets');
const { localTimestamp } = require('../common/utils');
// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const DEFAULT_EDIT_THRESHOLD = EDIT_THRESHOLD;

// Feature name constants
const FEATURES = Object.freeze({
  GUIDANCE: 'guidance',
  EDIT_GUARD: 'editGuard',
  STOP: 'stop',
  STALL: 'stall',
  INTERACTION: 'interaction',
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
   * Load rules from user's guidance.json and pre-compile regex patterns.
   */
  load() {
    if (this.loaded) return;

    try {
      const content = assets.read('guidance');
      const config = JSON.parse(content);
      this.rules = config.rules || [];
    } catch {
      this.rules = [];
    }

    this._compiledMatchers = new Map();
    this._compiledConditions = new Map();
    for (const rule of this.rules) {
      try {
        this._compiledMatchers.set(rule.name, new RegExp(rule.matcher));
      } catch {
        this._compiledMatchers.set(rule.name, null);
      }
      if (rule.condition?.pattern !== undefined) {
        try {
          this._compiledConditions.set(rule.name, new RegExp(rule.condition.pattern, 'i'));
        } catch {
          this._compiledConditions.set(rule.name, null);
        }
      }
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
   * @param {string} [ruleName] - Rule name for looking up pre-compiled regex
   */
  matchCondition(input, condition, ruleName) {
    if (!condition) return true;

    if (condition.field && condition.pattern !== undefined) {
      const value = this.getFieldValue(input, condition.field);
      const re = (ruleName && this._compiledConditions?.get(ruleName)) ||
        new RegExp(condition.pattern, 'i');
      return re.test(String(value || ''));
    }

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
    const matcherRe = this._compiledMatchers?.get(rule.name) ?? new RegExp(rule.matcher);
    if (!matcherRe.test(input.tool_name)) {
      return null;
    }

    if (!this.matchCondition(input, rule.condition, rule.name)) {
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
   * Reset per-session state for clean session boundaries.
   * Also clears loaded flag so guidance.json is re-read on next hook call.
   */
  reset() {
    this.injectedRules.clear();
    this.cache = {};
    this.loaded = false;
  }

  /**
   * Create hook function for PreToolUse
   */
  createHook() {
    const basePath = assets.dir('loop');

    return async (input, _toolUseID, _context) => {
      this.load();

      if (this.rules.length === 0) return {};

      const guidanceParts = [];
      const tipParts = [];

      for (const rule of this.rules) {
        const result = this.processRule(rule, input, basePath);
        if (result) {
          if (result.guidance) guidanceParts.push(result.guidance);
          if (result.tip) tipParts.push(result.tip);
        }
      }

      const allParts = [...guidanceParts, ...tipParts];
      if (allParts.length === 0) return {};

      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          additionalContext: allParts.join('\n\n'),
        }
      };
    };
  }
}

// Shared instance (reset per session via createGuidanceModule)
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
    logStream.write(`[${localTimestamp()}] ${input.tool_name}: ${detail}\n`);
  }
}

// ─────────────────────────────────────────────────────────────
// Module Factories
// ─────────────────────────────────────────────────────────────

/**
 * Create guidance injection module.
 * Resets the shared injector's per-session state to prevent cross-session leaks.
 */
function createGuidanceModule() {
  guidanceInjector.reset();
  return {
    hook: guidanceInjector.createHook()
  };
}

/**
 * Create edit guard module.
 * Uses a sliding time window: edits older than cooldownMs are decayed,
 * allowing the model to resume editing after a "thinking" break.
 */
function createEditGuardModule(options) {
  const editTimestamps = {};
  const threshold = options.editThreshold || DEFAULT_EDIT_THRESHOLD;
  const cooldownMs = options.editCooldownMs || 60000;

  return {
    hook: async (input, _toolUseID, _context) => {
      if (!['Write', 'Edit', 'MultiEdit'].includes(input.tool_name)) return {};
      const target = input.tool_input?.file_path || input.tool_input?.path || '';
      if (!target) return {};

      const now = Date.now();
      if (!editTimestamps[target]) editTimestamps[target] = [];

      editTimestamps[target] = editTimestamps[target].filter(t => now - t < cooldownMs);
      editTimestamps[target].push(now);

      if (editTimestamps[target].length > threshold) {
        return {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason:
              `${cooldownMs / 1000}s 内对 ${target} 编辑 ${editTimestamps[target].length} 次（上限 ${threshold}），疑似死循环。请重新审视方案后再继续。`
          }
        };
      }
      return {};
    }
  };
}

/**
 * Create stall detection module (idle timeout only)
 */
function createStallModule(indicator, logStream, options) {
  let stallDetected = false;
  let stallChecker = null;
  const timeoutMs = options.stallTimeoutMs || 1200000;
  const abortController = options.abortController;

  const checkStall = () => {
    const now = Date.now();
    const idleMs = now - indicator.lastActivityTime;

    if (idleMs > timeoutMs && !stallDetected) {
      stallDetected = true;
      const idleMin = Math.floor(idleMs / 60000);
      log('warn', `\n无响应超过 ${idleMin} 分钟，自动中断 session`);
      if (logStream) {
        logStream.write(`\n[${localTimestamp()}] STALL: 无响应 ${idleMin} 分钟，自动中断\n`);
      }
      if (abortController) {
        abortController.abort();
        log('warn', '\n已发送中断信号');
      }
    }
  };

  stallChecker = setInterval(checkStall, 30000);

  return {
    cleanup: () => { if (stallChecker) clearInterval(stallChecker); },
    isStalled: () => stallDetected
  };
}

/**
 * Create Stop hook — per-turn activity logger.
 * Stop fires on EVERY model response turn (not just session end).
 * For session completion detection, use the result message (SDKResultMessage.subtype).
 */
function createStopHook(logStream) {
  return async (_input) => {
    if (logStream?.writable) {
      logStream.write(`[${localTimestamp()}] STOP: turn completed\n`);
    }
    return {};
  };
}

/**
 * Create PostToolUse hook — resets tool running state and activity timer.
 * Unified for all session types (replaces the former createCompletionModule).
 */
function createEndToolHook(indicator) {
  return async (_input, _toolUseID, _context) => {
    indicator.endTool();
    indicator.updatePhase('thinking');
    return {};
  };
}

/**
 * Create PostToolUseFailure hook to ensure endTool on tool errors
 */
function createFailureHook(indicator) {
  return async (_input, _toolUseID, _context) => {
    indicator.endTool();
    return {};
  };
}

/**
 * Create logging hook
 */
function createLoggingHook(indicator, logStream) {
  return async (input, _toolUseID, _context) => {
    inferPhaseStep(indicator, input.tool_name, input.tool_input);
    logToolCall(logStream, input);
    return {};
  };
}

// ─────────────────────────────────────────────────────────────
// Hook Factory: createHooks
// ─────────────────────────────────────────────────────────────

const FEATURE_MAP = {
  coding: [FEATURES.GUIDANCE, FEATURES.EDIT_GUARD, FEATURES.STOP, FEATURES.STALL],
  plan: [FEATURES.STOP, FEATURES.STALL],
  plan_interactive: [FEATURES.STOP, FEATURES.STALL, FEATURES.INTERACTION],
  scan: [FEATURES.STOP, FEATURES.STALL],
  add: [FEATURES.STOP, FEATURES.STALL],
  simplify: [FEATURES.STOP, FEATURES.STALL, FEATURES.INTERACTION],
  go: [FEATURES.STOP, FEATURES.STALL, FEATURES.INTERACTION],
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

  if (features.includes(FEATURES.STOP)) {
    modules.stopHook = createStopHook(logStream);
  }

  if (features.includes(FEATURES.EDIT_GUARD)) {
    modules.editGuard = createEditGuardModule(options);
  }

  if (features.includes(FEATURES.GUIDANCE)) {
    modules.guidance = createGuidanceModule();
  }

  if (features.includes(FEATURES.INTERACTION)) {
    modules.interaction = { hook: createAskUserQuestionHook(indicator) };
  }

  // Assemble PreToolUse hooks
  const preToolUseHooks = [];
  preToolUseHooks.push(createLoggingHook(indicator, logStream));

  if (modules.editGuard) {
    preToolUseHooks.push(modules.editGuard.hook);
  }

  if (modules.guidance) {
    preToolUseHooks.push(modules.guidance.hook);
  }

  if (modules.interaction) {
    preToolUseHooks.push(modules.interaction.hook);
  }

  // PostToolUse: unified endTool for all session types
  const endToolHook = createEndToolHook(indicator);

  // PostToolUseFailure: ensure endTool even on tool errors
  const failureHook = createFailureHook(indicator);

  // Build hooks object
  const hooks = {};
  if (preToolUseHooks.length > 0) {
    hooks.PreToolUse = [{ matcher: '*', hooks: preToolUseHooks }];
  }
  hooks.PostToolUse = [{ matcher: '*', hooks: [endToolHook] }];
  hooks.PostToolUseFailure = [{ matcher: '*', hooks: [failureHook] }];

  // Stop hook: per-turn activity logger
  if (modules.stopHook) {
    hooks.Stop = [{ hooks: [modules.stopHook] }];
  }

  // SessionStart hook: log query lifecycle
  const sessionStartHook = async (input) => {
    indicator.updateActivity();
    if (logStream?.writable) {
      logStream.write(`[${localTimestamp()}] SESSION_START: source=${input.source || 'unknown'}\n`);
    }
    return {};
  };
  hooks.SessionStart = [{ hooks: [sessionStartHook] }];

  // Cleanup functions
  const cleanupFns = [];
  if (modules.stall) {
    cleanupFns.push(modules.stall.cleanup);
  }

  return {
    hooks,
    cleanup: () => cleanupFns.forEach(fn => fn()),
    isStalled: () => modules.stall?.isStalled() || false,
  };
}

// ─────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────

module.exports = {
  createHooks,
  GuidanceInjector,
  createGuidanceModule,
  createEditGuardModule,
  createStopHook,
  createEndToolHook,
  createStallModule,
  FEATURES,
};