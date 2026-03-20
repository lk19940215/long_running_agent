'use strict';

const fs = require('fs');
const path = require('path');

const BUNDLED_DIR = path.join(__dirname, '..', '..', 'templates');
const BUNDLED_RECIPES_DIR = path.join(__dirname, '..', '..', 'recipes');

// kind: 'template' — 双目录解析（用户 assets → 内置 bundled），有缓存
// kind: 'data'     — .claude-coder/ 目录，无缓存
// kind: 'runtime'  — .claude-coder/.runtime/ 目录，无缓存
// kind: 'root'     — 项目根目录，无缓存
const REGISTRY = new Map([
  // Go templates
  ['goSystem',       { file: ['go', 'system.md'],           kind: 'template' }],

  // Plan templates
  ['planSystem',     { file: ['plan', 'system.md'],         kind: 'template' }],
  ['planUser',       { file: ['plan', 'user.md'],           kind: 'template' }],

  // Coding templates
  ['codingSystem',   { file: ['coding', 'system.md'],       kind: 'template' }],
  ['codingUser',     { file: ['coding', 'user.md'],         kind: 'template' }],

  // Scan templates
  ['scanSystem',     { file: ['scan', 'system.md'],         kind: 'template' }],
  ['scanUser',       { file: ['scan', 'user.md'],           kind: 'template' }],

  // Design templates
  ['designBase',     { file: ['design', 'base.md'],         kind: 'template' }],
  ['designSystem',   { file: ['design', 'system.md'],       kind: 'template' }],
  ['designFixSystem',{ file: ['design', 'fixSystem.md'],    kind: 'template' }],
  ['designInit',     { file: ['design', 'init.md'],         kind: 'template' }],
  ['designUser',     { file: ['design', 'user.md'],         kind: 'template' }],
  ['designFixUser',  { file: ['design', 'fixUser.md'],      kind: 'template' }],

  // Shared / other templates
  ['coreProtocol',   { file: ['other', 'coreProtocol.md'],  kind: 'template' }],
  ['testRule',       { file: ['other', 'test_rule.md'],     kind: 'template' }],
  ['guidance',       { file: ['other', 'guidance.json'],    kind: 'template' }],
  ['webTesting',     { file: ['other', 'web-testing.md'],   kind: 'template' }],
  ['bashProcess',    { file: ['other', 'bash-process.md'],  kind: 'template' }],
  ['requirements',   { file: ['other', 'requirements.example.md'], kind: 'template' }],

  // Data files (.claude-coder/)
  ['env',            { file: '.env',                       kind: 'data' }],
  ['tasks',          { file: 'tasks.json',                 kind: 'data' }],
  ['progress',       { file: 'progress.json',              kind: 'data' }],
  ['sessionResult',  { file: 'session_result.json',        kind: 'data' }],
  ['profile',        { file: 'project_profile.json',       kind: 'data' }],
  ['testEnv',        { file: 'test.env',                   kind: 'data' }],
  ['playwrightAuth', { file: 'playwright-auth.json',       kind: 'data' }],
  ['designMap',      { file: ['design', 'design_map.json'], kind: 'data' }],

  // Runtime files (.claude-coder/.runtime/)
  ['harnessState',   { file: 'harness_state.json',         kind: 'data' }],
  ['browserProfile', { file: 'browser-profile',            kind: 'runtime' }],

  // Root files (project root)
  ['mcpConfig',      { file: '.mcp.json',                  kind: 'root' }],
]);

const DIRS = new Map([
  ['loop',    ''],
  ['assets',  'assets'],
  ['runtime', '.runtime'],
  ['logs',    '.runtime/logs'],
  ['design',  'design'],
  ['designPages', 'design/pages'],
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

  _fileSegments(file) {
    return Array.isArray(file) ? file : [file];
  }


  path(name) {
    this._ensureInit();
    const entry = this.registry.get(name);
    if (!entry) return null;
    const segs = this._fileSegments(entry.file);
    switch (entry.kind) {
      case 'template': return this._resolveTemplate(segs);
      case 'data':     return path.join(this.loopDir, ...segs);
      case 'runtime':  return path.join(this.loopDir, '.runtime', ...segs);
      case 'root':     return path.join(this.projectRoot, ...segs);
      default:         return null;
    }
  }

  _resolveTemplate(segments) {
    if (this.assetsDir) {
      const userPath = path.join(this.assetsDir, ...segments);
      if (fs.existsSync(userPath)) return userPath;
    }
    const bundled = path.join(this.bundledDir, ...segments);
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

    const filePath = this.path(name);
    if (!filePath || !fs.existsSync(filePath)) return entry.kind === 'template' ? '' : null;
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
    const deployed = [];
    const walk = (srcBase, destBase) => {
      const entries = fs.readdirSync(srcBase, { withFileTypes: true });
      for (const entry of entries) {
        const srcPath = path.join(srcBase, entry.name);
        const destPath = path.join(destBase, entry.name);
        if (entry.isDirectory()) {
          if (!fs.existsSync(destPath)) fs.mkdirSync(destPath, { recursive: true });
          walk(srcPath, destPath);
        } else {
          if (fs.existsSync(destPath)) continue;
          try {
            fs.copyFileSync(srcPath, destPath);
            deployed.push(path.relative(this.assetsDir, destPath));
          } catch { /* skip */ }
        }
      }
    };
    walk(this.bundledDir, this.assetsDir);
    return deployed;
  }

  deployRecipes() {
    this._ensureInit();
    const destDir = path.join(this.loopDir, 'recipes');
    if (!fs.existsSync(BUNDLED_RECIPES_DIR)) return [];
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    const deployed = [];
    const walk = (srcBase, destBase) => {
      const entries = fs.readdirSync(srcBase, { withFileTypes: true });
      for (const entry of entries) {
        const srcPath = path.join(srcBase, entry.name);
        const destPath = path.join(destBase, entry.name);
        if (entry.isDirectory()) {
          if (!fs.existsSync(destPath)) fs.mkdirSync(destPath, { recursive: true });
          walk(srcPath, destPath);
        } else {
          if (fs.existsSync(destPath)) continue;
          try {
            fs.copyFileSync(srcPath, destPath);
            deployed.push(path.relative(destDir, destPath));
          } catch { /* skip */ }
        }
      }
    };
    walk(BUNDLED_RECIPES_DIR, destDir);
    return deployed;
  }

  recipesDir() {
    this._ensureInit();
    const projectRecipes = path.join(this.loopDir, 'recipes');
    if (fs.existsSync(projectRecipes) && fs.readdirSync(projectRecipes).length > 0) {
      return projectRecipes;
    }
    return BUNDLED_RECIPES_DIR;
  }

}

const assets = new AssetManager();

module.exports = { AssetManager, assets, renderTemplate };
