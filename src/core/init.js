'use strict';

const fs = require('fs');
const net = require('net');
const http = require('http');
const { spawn, execSync } = require('child_process');
const { log } = require('../common/config');
const { assets } = require('../common/assets');
const { isGitRepo, ensureGitignore } = require('../common/utils');

function ensureEnvironment(projectRoot) {
  ensureGitignore(projectRoot);
  if (!isGitRepo(projectRoot)) {
    log('info', '初始化 git 仓库...');
    execSync('git init', { cwd: projectRoot, stdio: 'inherit' });
    execSync('git add -A && git commit -m "init: 项目初始化" --allow-empty', {
      cwd: projectRoot,
      stdio: 'inherit',
    });
  }
}

function runCmd(cmd, cwd) {
  try {
    execSync(cmd, { cwd: cwd || assets.projectRoot, stdio: 'inherit', shell: true });
    return true;
  } catch {
    return false;
  }
}

function isPortFree(port) {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => { server.close(); resolve(true); });
    server.listen(port, '127.0.0.1');
  });
}

function waitForHealth(url, timeoutMs = 15000) {
  const start = Date.now();
  return new Promise(resolve => {
    const check = () => {
      if (Date.now() - start > timeoutMs) { resolve(false); return; }
      const req = http.get(url, res => { resolve(res.statusCode < 500); });
      req.on('error', () => setTimeout(check, 1000));
      req.setTimeout(3000, () => { req.destroy(); setTimeout(check, 1000); });
    };
    check();
  });
}

function buildEnvSteps(profile, projectRoot) {
  const steps = [];
  const envSetup = profile.env_setup || {};

  if (envSetup.python_env && !['system', 'none'].includes(envSetup.python_env)) {
    if (envSetup.python_env.startsWith('conda:')) {
      const name = envSetup.python_env.slice(6);
      steps.push({ label: `Python 环境: conda activate ${name}`, cmd: `conda activate ${name}` });
    } else if (envSetup.python_env === 'venv') {
      steps.push({ label: 'Python 环境: venv', cmd: 'source .venv/bin/activate || .venv\\Scripts\\activate' });
    }
  }

  if (envSetup.node_version && envSetup.node_version !== 'none') {
    steps.push({ label: `Node.js: v${envSetup.node_version}`, cmd: `nvm use ${envSetup.node_version}` });
  }

  const pkgManagers = profile.tech_stack?.package_managers || [];
  for (const pm of pkgManagers) {
    if (['npm', 'yarn', 'pnpm'].includes(pm)) {
      if (fs.existsSync(`${projectRoot}/node_modules`)) {
        steps.push({ label: `${pm} 依赖已安装，跳过`, skip: true });
      } else {
        steps.push({ label: `安装依赖: ${pm} install`, cmd: `${pm} install`, cwd: projectRoot });
      }
    } else if (pm === 'pip' && fs.existsSync(`${projectRoot}/requirements.txt`)) {
      steps.push({ label: '安装依赖: pip install -r requirements.txt', cmd: 'pip install -r requirements.txt', cwd: projectRoot });
    }
  }

  for (const cmd of (profile.custom_init || [])) {
    steps.push({ label: `自定义: ${cmd}`, cmd, cwd: projectRoot });
  }

  return steps;
}

async function startService(svc, projectRoot, stepNum) {
  const free = await isPortFree(svc.port);
  if (!free) {
    log('ok', `[${stepNum}] ${svc.name} 已在端口 ${svc.port} 运行，跳过`);
    return;
  }

  log('info', `[${stepNum}] 启动 ${svc.name} (端口 ${svc.port})...`);
  const cwd = svc.cwd ? `${projectRoot}/${svc.cwd}` : projectRoot;
  const child = spawn(svc.command, { cwd, shell: true, detached: true, stdio: 'ignore' });
  child.unref();

  if (svc.health_check) {
    const healthy = await waitForHealth(svc.health_check);
    log(healthy ? 'ok' : 'warn',
      healthy ? `${svc.name} 就绪: ${svc.health_check}` : `${svc.name} 健康检查超时 (${svc.health_check})，继续执行`);
  }
}

async function executeInit(config, opts = {}) {
  const projectRoot = assets.projectRoot;

  ensureEnvironment(projectRoot);

  if (!assets.exists('profile')) {
    log('info', 'profile 不存在，正在执行项目扫描...');
    const { executeScan } = require('./scan');
    const scanResult = await executeScan(config, opts);
    if (!scanResult.success) {
      throw new Error('项目扫描失败');
    }
  }

  const profile = assets.readJson('profile', null);
  if (!profile) {
    throw new Error('project_profile.json 读取失败或已损坏');
  }

  for (const file of assets.deployAll()) log('ok', `已部署 → .claude-coder/assets/${file}`);
  const recipes = assets.deployRecipes();
  if (recipes.length > 0) log('ok', `已部署 ${recipes.length} 个食谱文件 → .claude-coder/recipes/`);

  const envSteps = buildEnvSteps(profile, projectRoot);
  let stepCount = 0;

  for (const step of envSteps) {
    stepCount++;
    if (step.skip) {
      log('ok', `[${stepCount}] ${step.label}`);
    } else {
      log('info', `[${stepCount}] ${step.label}`);
      runCmd(step.cmd, step.cwd);
    }
  }

  const services = profile.services || [];
  for (const svc of services) {
    stepCount++;
    await startService(svc, projectRoot, stepCount);
  }

  if (stepCount === 0) {
    log('info', '无需初始化操作');
  } else {
    log('ok', `初始化完成 (${stepCount} 步)`);
  }

  for (const svc of services) {
    console.log(`  ${svc.name}: http://localhost:${svc.port}`);
  }
}

module.exports = { executeInit };
