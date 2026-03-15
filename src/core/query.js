'use strict';

const fs = require('fs');
const path = require('path');
const { buildEnvVars } = require('../common/config');
const { assets } = require('../common/assets');

/**
 * 检查项目是否包含代码文件
 */
function hasCodeFiles(projectRoot) {
  const markers = [
    'package.json', 'pyproject.toml', 'requirements.txt', 'setup.py',
    'Cargo.toml', 'go.mod', 'pom.xml', 'build.gradle',
    'Makefile', 'Dockerfile', 'docker-compose.yml',
    'README.md', 'main.py', 'app.py', 'index.js', 'index.ts',
  ];
  for (const m of markers) {
    if (fs.existsSync(path.join(projectRoot, m))) return true;
  }
  for (const d of ['src', 'lib', 'app', 'backend', 'frontend', 'web', 'server', 'client']) {
    if (fs.existsSync(path.join(projectRoot, d)) && fs.statSync(path.join(projectRoot, d)).isDirectory()) return true;
  }
  return false;
}

/**
 * 构建 SDK query 选项
 */
function buildQueryOptions(config, opts = {}) {
  const mode = opts.permissionMode || 'bypassPermissions';
  const base = {
    permissionMode: mode,
    cwd: opts.projectRoot || assets.projectRoot,
    env: buildEnvVars(config),
    settingSources: ['project'],
  };
  if (mode === 'bypassPermissions') {
    base.allowDangerouslySkipPermissions = true;
  }
  if (config.maxTurns > 0) base.maxTurns = config.maxTurns;
  if (opts.model) base.model = opts.model;
  else if (config.model) base.model = config.model;
  return base;
}

module.exports = {
  hasCodeFiles,
  buildQueryOptions,
};