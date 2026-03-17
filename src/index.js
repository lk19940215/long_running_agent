'use strict';

const fs = require('fs');
const path = require('path');
const { loadConfig, log } = require('./common/config');
const { assets } = require('./common/assets');
const { Session } = require('./core/session');

function checkReady(command) {
  if (['init', 'scan'].includes(command)) return;

  const missing = [];
  if (!assets.exists('profile')) missing.push('project_profile.json');

  const recipesDir = path.join(assets.projectRoot, '.claude-coder', 'recipes');
  if (!fs.existsSync(recipesDir) || fs.readdirSync(recipesDir).length === 0) {
    missing.push('recipes/');
  }

  if (missing.length > 0) {
    throw new Error(`文件缺失: ${missing.join(', ')}，请运行 claude-coder init 初始化项目`);
  }
}

async function main(command, input, opts = {}) {
  assets.init(opts.projectRoot || process.cwd());
  assets.ensureDirs();
  const config = loadConfig();

  if (!opts.model) opts.model = config.defaultOpus || config.model;

  if (opts.readFile) {
    const reqPath = path.resolve(assets.projectRoot, opts.readFile);
    if (!fs.existsSync(reqPath)) {
      throw new Error(`文件不存在: ${reqPath}`);
    }
    opts.reqFile = reqPath;
  }

  checkReady(command);

  const displayModel = opts.model || '(default)';
  log('ok', `模型: ${config.provider || 'claude'} (${displayModel}), 命令: ${command}`);

  switch (command) {
    case 'init': {
      const { executeInit } = require('./core/init');
      return executeInit(config, opts);
    }
    case 'scan': {
      const { executeScan } = require('./core/scan');
      return executeScan(config, opts);
    }
    case 'simplify': {
      const { executeSimplify } = require('./core/simplify');
      return executeSimplify(config, input, opts);
    }
    case 'plan': {
      const { executePlan } = require('./core/plan');
      return executePlan(config, input, opts);
    }
    case 'run': {
      const { executeRun } = require('./core/runner');
      return executeRun(config, opts);
    }
    case 'go': {
      const { executeGo } = require('./core/go');
      return executeGo(config, input, opts);
    }
    default:
      throw new Error(`未知命令: ${command}`);
  }
}

module.exports = { main, Session };
