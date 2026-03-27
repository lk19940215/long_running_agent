/**
 * glob — 按文件名模式查找文件
 * 底层使用 @vscode/ripgrep --files --glob
 */

import { execSync } from 'child_process';
import { rgPath } from '@vscode/ripgrep';
import { define } from './registry.mjs';

define(
  'glob',
  '按文件名模式查找文件。路径不确定时先用此工具定位。可同时发起多个模式搜索。',
  {
    pattern: { type: 'string', description: 'glob 模式。如 "**/agent.mjs"、"**/*.{ts,tsx}"、"src/**/*.test.js"' },
    path: { type: 'string', description: '搜索起始目录，默认当前目录' },
  },
  ['pattern'],
  async ({ pattern, path = '.' }) => {
    try {
      const cmd = `"${rgPath}" --files --glob "${pattern}" "${path}"`;
      const output = execSync(cmd, {
        encoding: 'utf-8',
        timeout: 10_000,
        maxBuffer: 1024 * 1024,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const files = output.trim();
      if (!files) return `未找到匹配: ${pattern}`;
      const lines = files.split('\n');
      return lines.length > 100
        ? lines.slice(0, 100).join('\n') + `\n... 共 ${lines.length} 个文件（已截断前 100）`
        : files;
    } catch (e) {
      if (e.status === 1) return `未找到匹配: ${pattern}`;
      return e.stdout || e.stderr?.toString() || `查找失败: ${e.message}`;
    }
  }
);
