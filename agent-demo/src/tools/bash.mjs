/**
 * bash — 命令执行工具
 */

import { execSync } from 'child_process';
import { define } from './registry.mjs';

define(
  'bash',
  '执行 bash 命令。用于 git 操作、运行测试、安装依赖、构建等。禁止用于搜索代码（用 grep）或列目录（用 ls）。禁止执行 rm -rf、sudo 等危险命令。',
  { command: { type: 'string', description: '要执行的 bash 命令' } },
  ['command'],
  async ({ command }) => {
    try {
      const output = execSync(command, {
        encoding: 'utf-8',
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return output || '(命令执行成功，无输出)';
    } catch (e) {
      return [
        `退出码: ${e.status ?? 'unknown'}`,
        e.stdout ? `stdout:\n${e.stdout}` : '',
        e.stderr ? `stderr:\n${e.stderr}` : ''
      ].filter(Boolean).join('\n');
    }
  }
);
