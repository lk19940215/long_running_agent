/**
 * 工具注册表 — 所有工具模块共享
 */

export const registry = {};

export function define(name, description, properties, required, executeFn) {
  registry[name] = {
    schema: {
      name,
      description,
      input_schema: { type: 'object', properties, required }
    },
    execute: executeFn
  };
}
