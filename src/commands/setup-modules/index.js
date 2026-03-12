'use strict';

// ── setup 子模块统一入口 ──

const helpers = require('./helpers');
const provider = require('./provider');
const mcp = require('./mcp');
const safety = require('./safety');
const simplify = require('./simplify');

module.exports = {
  createInterface: helpers.createInterface,
  ask: helpers.ask,
  askChoice: helpers.askChoice,
  askApiKey: helpers.askApiKey,
  writeConfig: helpers.writeConfig,
  ensureGitignore: helpers.ensureGitignore,
  showCurrentConfig: helpers.showCurrentConfig,
  selectProvider: provider.selectProvider,
  updateApiKeyOnly: provider.updateApiKeyOnly,
  configureMCP: mcp.configureMCP,
  appendMcpConfig: mcp.appendMcpConfig,
  updateMCPOnly: mcp.updateMCPOnly,
  updateSafetyLimits: safety.updateSafetyLimits,
  updateSimplifyConfig: simplify.updateSimplifyConfig,
};