/**
 * grep 工具 — 正则搜索代码内容
 * 底层使用 @vscode/ripgrep
 */

import { execSync } from 'child_process';
import { rgPath } from '@vscode/ripgrep';
import { define } from './registry.mjs';

define(
  'grep',
  '正则搜索代码内容（ripgrep）。返回 文件:行号:匹配行。策略：用 | 在一次调用中组合所有模式，一次覆盖全部目标。多次 grep 调用 = 低效。include 过滤文件类型减少噪音。结果已含匹配行，通常无需再 read。',
  {
    pattern: { type: 'string', description: '正则表达式。用 | 组合多个模式，\\b 词边界精确匹配。' },
    path: { type: 'string', description: '搜索目录或文件，默认当前目录' },
    include: { type: 'string', description: '文件类型过滤，如 "*.py"、"*.{js,ts}"、"*.rs"、"*.go"' },
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
