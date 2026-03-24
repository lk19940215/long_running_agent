/**
 * 工具定义与执行器
 *
 * 每个工具由两部分组成:
 *   1. schema — JSON Schema 描述（告诉 LLM 这个工具是什么、怎么调用）
 *   2. execute — 实际执行函数（接收 LLM 给的参数，返回字符串结果）
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { execSync } from 'child_process';
import { dirname } from 'path';

// ─── 工具注册表 ──────────────────────────────────────────
// 所有工具在这里注册。LLM 只看到 schema，运行时根据 name 找到 execute 函数。
export const registry = {};

function define(name, description, properties, required, executeFn) {
  registry[name] = {
    schema: {
      name,
      description,
      input_schema: { type: 'object', properties, required }
    },
    execute: executeFn
  };
}

// ─── read_file ───────────────────────────────────────────
define(
  'read_file',
  '读取指定路径的文件内容。用于了解代码结构和内容。',
  { path: { type: 'string', description: '文件路径' } },
  ['path'],
  async ({ path }) => {
    try {
      return await readFile(path, 'utf-8');
    } catch (e) {
      return `错误: ${e.message}`;
    }
  }
);

// ─── write_file ──────────────────────────────────────────
define(
  'write_file',
  '将内容写入指定路径的文件。如果文件已存在则覆盖。自动创建父目录。',
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

// ─── execute_bash ────────────────────────────────────────
define(
  'execute_bash',
  '执行 bash 命令并返回输出。用于运行测试、安装依赖、git 操作、查看目录等。',
  { command: { type: 'string', description: '要执行的 bash 命令' } },
  ['command'],
  async ({ command }) => {
    try {
      const output = execSync(command, {
        encoding: 'utf-8',
        timeout: 30_000,
        maxBuffer: 1024 * 1024
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

// ─── 导出 ────────────────────────────────────────────────

/** 提供给 Anthropic API 的 tools 数组 */
export const toolSchemas = Object.values(registry).map(t => t.schema);

/** 根据工具名执行对应函数 */
export async function executeTool(name, input) {
  const tool = registry[name];
  if (!tool) return `未知工具: ${name}`;
  return tool.execute(input);
}
