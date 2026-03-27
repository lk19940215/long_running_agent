/**
 * 工具入口 — 聚合所有工具并导出 schema 和执行器
 */

import { registry } from './registry.mjs';

// 注册所有工具（import 即执行 define）
// task 必须在基础工具之后注册（SubAgent 依赖 read/grep/glob/ls/symbols）
import './file.mjs';
import './grep.mjs';
import './ls.mjs';
import './glob.mjs';
import './symbols.mjs';
import './bash.mjs';
import './task.mjs';

export const toolSchemas = Object.values(registry).map(t => t.schema);

export async function executeTool(name, input) {
  const tool = registry[name];
  if (!tool) return `未知工具: ${name}`;
  try {
    return await tool.execute(input);
  } catch (e) {
    return `工具异常: ${name} — ${e.message}`;
  }
}
