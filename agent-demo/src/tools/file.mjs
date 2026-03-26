/**
 * 文件操作工具：read / write / edit
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { define } from './registry.mjs';

define(
  'read',
  '读取文件全部内容。先用 grep 定位再读取，避免盲目读取大文件。修改文件前必须先读取。',
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
  '创建新文件或完全覆盖文件。自动创建父目录。仅用于创建新文件，修改已有文件必须用 edit，禁止用 write 覆盖。',
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
  '通过 Search & Replace 修改文件。old_string 必须完全匹配文件内容（从 read 结果复制，含空格和换行）。如有多处匹配需提供更多上下文行来保证唯一性。',
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
