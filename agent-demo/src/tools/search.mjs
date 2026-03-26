/**
 * 搜索工具：grep / ls
 * 底层使用 @vscode/ripgrep
 */

import { execSync } from 'child_process';
import { rgPath } from '@vscode/ripgrep';
import { define } from './registry.mjs';

define(
  'grep',
  '用正则搜索代码内容。默认返回 文件:行号:匹配行。支持 output_mode 切换输出格式：files_only 只返回文件路径，count 返回匹配数。使用 \\b 词边界避免子串噪音，用 include 限定文件类型。',
  {
    pattern: { type: 'string', description: '正则表达式。精确匹配用 \\b 词边界。搜 import 用 import.*模块名。' },
    path: { type: 'string', description: '搜索目录或文件，默认当前目录' },
    include: { type: 'string', description: '文件类型过滤（如 "*.mjs"、"*.{js,ts}"），减少无关匹配' },
    output_mode: { type: 'string', description: '输出模式：content（默认，匹配行）、files_only（仅文件路径）、count（匹配数）' },
  },
  ['pattern'],
  async ({ pattern, path = '.', include, output_mode = 'content' }) => {
    try {
      const modeFlags = {
        files_only: '--files-with-matches',
        count: '--count',
        content: '--line-number --no-heading',
      };
      const flag = modeFlags[output_mode] || modeFlags.content;
      let cmd = `"${rgPath}" ${flag} --max-count 200 "${pattern}" "${path}"`;
      if (include) cmd += ` --glob "${include}"`;
      const output = execSync(cmd, { encoding: 'utf-8', timeout: 10_000, maxBuffer: 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
      return output || `未找到匹配: ${pattern}`;
    } catch (e) {
      if (e.status === 1) return `未找到匹配: ${pattern}`;
      return e.stdout || e.stderr?.toString() || `搜索失败: ${e.message}`;
    }
  }
);

define(
  'ls',
  '列出目录文件树。自动遵守 .gitignore（跳过 node_modules、.git 等）。用于了解项目结构。',
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
