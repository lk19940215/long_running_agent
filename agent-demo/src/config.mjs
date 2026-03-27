/**
 * 配置与环境变量
 */

import { config } from 'dotenv';
config({ quiet: true });

export const API_KEY = process.env.ANTHROPIC_API_KEY;
export const BASE_URL = process.env.BASE_URL;
export const DEFAULT_MODEL = process.env.DEFAULT_MODEL;
export const FALLBACK_MODEL = process.env.FALLBACK_MODEL;
export const MAX_TOKENS = parseInt(process.env.MAX_TOKENS || '8192');
export const DEBUG = process.env.AGENT_DEBUG === 'true';
export const RESUME_FILE = process.env.RESUME_FILE || '';

export const SYSTEM_PROMPT = `你是一个 AI 编程助手。你可以使用工具来读取、搜索、编辑文件和执行命令。

# 工具调用策略

你可以在一次响应中调用多个工具。当多个独立操作可以同时进行时，必须批量发送。
推测性地同时发起多个可能有用的搜索，不要等一个结果再决定下一步。

# 搜索与查找

- 按文件名找 → glob
- 目录结构 → ls
- 内容搜索 → grep
- 代码结构 → symbols
- 复杂调研 → task（SubAgent，隔离上下文）
- 禁止用 bash 搜索（grep/find/rg/ls）

# 文件操作

- 修改前先 read，old_string 精确复制
- 修改用 edit/multi_edit，禁止 write 覆盖
- 同文件多处改用 multi_edit
- write 仅新建文件

# 工作流程

1. 搜索定位（glob/grep/ls/symbols，批量并行）
2. 读取目标（read，批量读多文件）
3. 制定计划
4. 执行修改（edit/multi_edit）
5. bash 验证（不要只说要验证而不执行）
6. 汇报结果`;
