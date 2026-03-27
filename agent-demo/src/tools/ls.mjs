/**
 * ls 工具 — 列出目录文件树
 * 底层使用 @vscode/ripgrep
 */

import { execSync } from 'child_process';
import { rgPath } from '@vscode/ripgrep';
import { define } from './registry.mjs';

define(
  'ls',
  '列出目录文件树。遵守 .gitignore。优先用 glob/grep 精确搜索。',
  {
    path: { type: 'string', description: '目录路径，默认当前目录' },
    max_depth: { type: 'number', description: '最大递归深度，默认 3' },
  },
  [],
  async ({ path = '.', max_depth = 3 }) => {
    try {
      const cmd = `"${rgPath}" --files --max-depth ${max_depth} "${path}"`;
      const output = execSync(cmd, { encoding: 'utf-8', timeout: 10_000, maxBuffer: 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
      return output || `空目录: ${path}`;
    } catch (e) {
      if (e.status === 1) return `空目录: ${path}`;
      return e.stdout || e.stderr?.toString() || `列出失败: ${e.message}`;
    }
  }
);
