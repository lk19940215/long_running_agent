'use strict';

const fs = require('fs');
const path = require('path');

const BUNDLED_DIR = path.join(__dirname, '..', '..', 'templates');

// kind: 'template' — 双目录解析（用户 assets → 内置 bundled）
// kind: 'data'     — .claude-coder/ 目录
// kind: 'runtime'  — .claude-coder/.runtime/ 目录
// kind: 'root'     — 项目根目录
const REGISTRY = new Map([
  // Templates
  ['agentProtocol',  { file: 'agentProtocol.md',          kind: 'template' }],
  ['scanProtocol',   { file: 'scanProtocol.md',           kind: 'template' }],
  ['addGuide',       { file: 'addGuide.md',               kind: 'template' }],
  ['codingUser',     { file: 'codingUser.md',              kind: 'template' }],
  ['scanUser',       { file: 'scanUser.md',                kind: 'template' }],
  ['addUser',        { file: 'addUser.md',                 kind: 'template' }],
  ['testRule',       { file: 'test_rule.md',               kind: 'template' }],
  ['guidance',       { file: 'guidance.json',              kind: 'template' }],
  ['playwright',     { file: 'playwright.md',              kind: 'template' }],
  ['bashProcess',    { file: 'bash-process.md',            kind: 'template' }],
  ['requirements',   { file: 'requirements.example.md',    kind: 'template' }],

  // Data files (.claude-coder/)
  ['env',            { file: '.env',                       kind: 'data' }],
  ['tasks',          { file: 'tasks.json',                 kind: 'data' }],
  ['progress',       { file: 'progress.json',              kind: 'data' }],
  ['sessionResult',  { file: 'session_result.json',        kind: 'data' }],
  ['profile',        { file: 'project_profile.json',       kind: 'data' }],
  ['tests',          { file: 'tests.json',                 kind: 'data' }],
  ['testEnv',        { file: 'test.env',                   kind: 'data' }],
  ['playwrightAuth', { file: 'playwright-auth.json',       kind: 'data' }],

  // Runtime files (.claude-coder/.runtime/)
  ['browserProfile', { file: 'browser-profile',            kind: 'runtime' }],

  // Root files (project root)
  ['mcpConfig',      { file: '.mcp.json',                  kind: 'root' }],
]);

const DIRS = new Map([
  ['loop',    ''],
  ['assets',  'assets'],
  ['runtime', '.runtime'],
  ['logs',    '.runtime/logs'],
]);

function renderTemplate(template, vars = {}) {
  return template
    .replace(/\{\{(\w+)\}\}/g, (_, key) =>
      Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : ''
    )
    .replace(/^\s+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

class AssetManager {
  constructor() {
    this.projectRoot = null;
    this.loopDir = null;
    this.assetsDir = null;
    this.bundledDir = BUNDLED_DIR;
    this.registry = new Map(REGISTRY);
  }

  init(projectRoot) {
    this.projectRoot = projectRoot || process.cwd();
    this.loopDir = path.join(this.projectRoot, '.claude-coder');
    this.assetsDir = path.join(this.loopDir, 'assets');
  }

  _ensureInit() {
    if (!this.loopDir) this.init();
  }

  path(name) {
    this._ensureInit();
    const entry = this.registry.get(name);
    if (!entry) return null;
    switch (entry.kind) {
      case 'template': return this._resolveTemplate(entry.file);
      case 'data':     return path.join(this.loopDir, entry.file);
      case 'runtime':  return path.join(this.loopDir, '.runtime', entry.file);
      case 'root':     return path.join(this.projectRoot, entry.file);
      default:         return null;
    }
  }

  _resolveTemplate(filename) {
    if (this.assetsDir) {
      const userPath = path.join(this.assetsDir, filename);
      if (fs.existsSync(userPath)) return userPath;
    }
    const bundled = path.join(this.bundledDir, filename);
    if (fs.existsSync(bundled)) return bundled;
    return null;
  }

  dir(name) {
    this._ensureInit();
    const rel = DIRS.get(name);
    if (rel === undefined) return null;
    return rel === '' ? this.loopDir : path.join(this.loopDir, rel);
  }

  exists(name) {
    const p = this.path(name);
    return p ? fs.existsSync(p) : false;
  }

  read(name) {
    this._ensureInit();
    const entry = this.registry.get(name);
    if (!entry) return null;

    if (entry.kind === 'template') {
      const filePath = this._resolveTemplate(entry.file);
      if (!filePath) return '';
      return fs.readFileSync(filePath, 'utf8');
    }

    const filePath = this.path(name);
    if (!filePath || !fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf8');
  }

  readJson(name, fallback = null) {
    const content = this.read(name);
    if (content === null || content === '') return fallback;
    try {
      return JSON.parse(content);
    } catch {
      return fallback;
    }
  }

  write(name, content) {
    this._ensureInit();
    const entry = this.registry.get(name);
    if (!entry || entry.kind === 'template') return;
    const filePath = this.path(name);
    if (!filePath) return;
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
  }

  writeJson(name, data) {
    this.write(name, JSON.stringify(data, null, 2) + '\n');
  }

  render(name, vars = {}) {
    const raw = this.read(name);
    if (!raw) return '';
    return renderTemplate(raw, vars);
  }

  ensureDirs() {
    this._ensureInit();
    for (const [, rel] of DIRS) {
      const dir = rel === '' ? this.loopDir : path.join(this.loopDir, rel);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }
  }

  deployAll() {
    this._ensureInit();
    if (!fs.existsSync(this.assetsDir)) {
      fs.mkdirSync(this.assetsDir, { recursive: true });
    }
    const files = fs.readdirSync(this.bundledDir);
    const deployed = [];
    for (const file of files) {
      const dest = path.join(this.assetsDir, file);
      if (fs.existsSync(dest)) continue;
      const src = path.join(this.bundledDir, file);
      try {
        fs.copyFileSync(src, dest);
        deployed.push(file);
      } catch { /* skip */ }
    }
    return deployed;
  }

}

const assets = new AssetManager();

module.exports = { AssetManager, assets, renderTemplate };
