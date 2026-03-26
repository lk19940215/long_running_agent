/**
 * 工具入口 — 聚合所有工具并导出 schema 和执行器
 */

import { registry } from './registry.mjs';

// 注册所有工具（import 即执行 define）
import './file.mjs';
import './search.mjs';
import './glob.mjs';
import './ast.mjs';
import './bash.mjs';

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
