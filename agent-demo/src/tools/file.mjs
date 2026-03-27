/**
 * 文件操作工具：read / write / edit / multi_edit
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { define } from './registry.mjs';

define(
  'read',
  '读取文件内容。修改前必须先读取。可同时批量读取多个相关文件。',
  { path: { type: 'string', description: '文件路径（相对或绝对）' } },
  ['path'],
  async ({ path }) => {
    try {
      return await readFile(path, 'utf-8');
    } catch (e) {
      return `错误: ${e.message}`;
    }
  }
);

define(
  'write',
  '创建新文件或完全覆盖。自动创建目录。仅用于新文件，修改已有文件用 edit/multi_edit。',
  {
    path: { type: 'string', description: '文件路径' },
    content: { type: 'string', description: '要写入的完整文件内容' }
  },
  ['path', 'content'],
  async ({ path, content }) => {
    try {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, 'utf-8');
      return `文件已写入: ${path} (${content.length} 字符)`;
    } catch (e) {
      return `写入失败: ${e.message}`;
    }
  }
);

define(
  'edit',
  'Search & Replace 修改文件一处。同文件改多处必须用 multi_edit。old_string 必须精确匹配（含空格换行）。',
  {
    path: { type: 'string', description: '文件路径（相对或绝对）' },
    old_string: { type: 'string', description: '要替换的原始文本，必须从 read 结果精确复制' },
    new_string: { type: 'string', description: '替换后的新文本' },
  },
  ['path', 'old_string', 'new_string'],
  async ({ path, old_string, new_string }) => {
    try {
      const content = await readFile(path, 'utf-8');
      const count = content.split(old_string).length - 1;

      if (count === 0) {
        return `错误: 未在 ${path} 中找到匹配内容。请确认 old_string 与文件内容完全一致（包括空格和换行）。`;
      }
      if (count > 1) {
        return `错误: 在 ${path} 中找到 ${count} 处匹配。old_string 不够唯一，请提供更多上下文行。`;
      }

      const newContent = content.replace(old_string, new_string);
      await writeFile(path, newContent, 'utf-8');
      return `已编辑: ${path}`;
    } catch (e) {
      return `编辑失败: ${e.message}`;
    }
  }
);

define(
  'multi_edit',
  '同一文件多处 Search & Replace（1 次调用替代 N 次 edit）。edits 按顺序执行，后续匹配基于已更新内容。',
  {
    path: { type: 'string', description: '文件路径' },
    edits: {
      type: 'array',
      description: '编辑操作数组，每项包含 old_string 和 new_string',
      items: {
        type: 'object',
        properties: {
          old_string: { type: 'string', description: '要替换的原始文本' },
          new_string: { type: 'string', description: '替换后的新文本' },
        },
        required: ['old_string', 'new_string'],
      },
    },
  },
  ['path', 'edits'],
  async ({ path, edits }) => {
    try {
      let content = await readFile(path, 'utf-8');
      const results = [];

      for (const [i, { old_string, new_string }] of edits.entries()) {
        const count = content.split(old_string).length - 1;
        if (count === 0) {
          results.push(`#${i + 1} 失败: 未找到匹配`);
          continue;
        }
        if (count > 1) {
          results.push(`#${i + 1} 失败: ${count} 处匹配，不够唯一`);
          continue;
        }
        content = content.replace(old_string, new_string);
        results.push(`#${i + 1} 成功`);
      }

      if (results.some(r => r.includes('成功'))) {
        await writeFile(path, content, 'utf-8');
      }

      return `${path}: ${results.join(', ')}`;
    } catch (e) {
      return `编辑失败: ${e.message}`;
    }
  }
);
