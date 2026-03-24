'use strict';

const fs = require('fs');
const path = require('path');
const { log } = require('./display');

let _sdkModule = null;

/**
 * 加载 Claude Agent SDK
 */
async function loadSDK() {
  if (_sdkModule) return _sdkModule;

  const pkgName = '@anthropic-ai/claude-agent-sdk';
  const attempts = [
    () => import(pkgName),
    () => {
      const { createRequire } = require('module');
      const resolved = createRequire(__filename).resolve(pkgName);
      return import(resolved);
    },
    () => {
      const { createRequire } = require('module');
      const resolved = createRequire(path.join(process.cwd(), 'noop.js')).resolve(pkgName);
      return import(resolved);
    },
    () => {
      const { execSync } = require('child_process');
      const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
      const sdkDir = path.join(globalRoot, pkgName);
      const pkgJson = JSON.parse(fs.readFileSync(path.join(sdkDir, 'package.json'), 'utf8'));
      const entry = pkgJson.exports?.['.'] || pkgJson.main || 'index.js';
      const entryFile = typeof entry === 'object' ? (entry.import || entry.default || entry.node) : entry;
      return import(path.join(sdkDir, entryFile));
    },
  ];

  for (const attempt of attempts) {
    try {
      _sdkModule = await attempt();
      return _sdkModule;
    } catch { /* try next */ }
  }

  throw new Error(`未找到 ${pkgName}，请先安装：npm install -g ${pkgName}`);
}

module.exports = { loadSDK };