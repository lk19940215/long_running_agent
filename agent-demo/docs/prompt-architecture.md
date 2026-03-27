# Claude Code 提示词架构

> **Claude Code**: [Piebald-AI/claude-code-system-prompts](https://github.com/Piebald-AI/claude-code-system-prompts) (v2.1.85, 134+ 版本迭代)
> **Cursor**: [x1xhlol/system-prompts-and-models-of-ai-tools](https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools) → `Cursor Prompts/Agent Prompt 2.0.txt` + `Agent Tools v1.0.json`
> **合集**: 上述 x1xhlol 仓库收录 30+ AI 编程工具（133K stars），含 Windsurf、Trae、Devin、v0 等

---

## 核心机制：动态拼装

Claude Code 没有一个大 system prompt。它有 110+ 个字符串片段，每次 API 调用前按当前状态拼装：

```
最终 prompt = 环境信息
  + 模式片段（plan / auto / minimal）
  + system-prompt-* 行为指导（~40个，按条件包含）
  + tool-description-* 工具描述（每个注册工具的说明）
  + system-reminder-* 运行时提醒（动态事件触发）
  + CLAUDE.md（项目级 > 目录级 > 全局级）
```

**条件包含** 用 JS 模板字面量：
```javascript
${AVAILABLE_TOOL_NAMES.has("Bash") ? bashFragments : ""}
${isSubAgentContext ? "限制可用工具..." : "完整工具集..."}
```

**模板变量** 统一引用工具名：`${GREP_TOOL_NAME}` → "Grep"，改名只改一处。

总计 ~27,000-30,000 tokens。Bash 工具自己就占 ~3,000（30+ 子片段）。

---

## 提示词写法模式

这是整个文档的核心。Claude Code 的提示词遵循几个明确的写法模式：

### 模式 1：系统提示词 = 一句话路由

系统提示词只做一件事：**告诉模型用什么工具，不要用什么**。

```
# 搜索内容
To search the content of files, use Grep instead of grep or rg

# 搜索文件
To search for files use Glob instead of find or ls

# 读文件
To read files use Read instead of cat, head, tail, or sed

# 编辑文件
To edit files use Edit instead of sed or awk

# Bash 定位
Reserve using Bash exclusively for system commands and terminal operations
that require shell execution. If unsure and there is a relevant dedicated tool,
default to using the dedicated tool.
```

每个片段 20-30 tokens。不解释为什么，不给示例，不教策略。

### 模式 2：工具描述 = 能力说明 + 边界约束

工具描述回答两个问题：**这个工具能做什么** 和 **怎么避免出错**。

以 Grep 为例（300 tokens）：

```
A powerful search tool built on ripgrep

Usage:
- ALWAYS use Grep for search tasks. NEVER invoke grep or rg as a Bash command.
- Supports full regex syntax (e.g., "log.*Error", "function\s+\w+")
- Filter files with glob/type parameter
- Output modes: "content" / "files_with_matches" (default) / "count"
- Use Task tool for open-ended searches requiring multiple rounds
- Pattern syntax: Uses ripgrep — literal braces need escaping
  (use interface\{\} to find interface{} in Go code)
- Multiline matching: use multiline: true for cross-line patterns
```

注意它写了什么和**没写什么**：

| 写了 | 没写 |
|------|------|
| 支持完整正则 | "应该用 \| 组合多个模式" |
| 有 output_mode 参数 | "避免多次调用" |
| 转义规则（Go `interface\{\}`） | "搜关键词用 keyword1\|keyword2" |
| 复杂搜索用 Task | "grep 结果无需再 read" |

**Claude Code 不指导搜索策略**。因为 Claude Sonnet/Opus 自己知道怎么搜。

再看 Edit（246 tokens）：

```
Performs exact string replacements in files.

Usage:
- [必须先 Read]
- 保留 Read 输出中的精确缩进（制表符/空格）
- old_string 必须在文件中唯一，否则用 replace_all
- replace_all 适用于重命名变量
- ALWAYS prefer editing existing files. NEVER write new files unless required.
```

写法模式一致：**能力 + 约束，不教策略**。

### 模式 3：负面约束集中在 Bash

所有 "NOT xxx" 都附在 Bash 工具描述上，不在系统提示词里：

```
Content search: Use Grep (NOT grep or rg)
File search: Use Glob (NOT find or ls)
Edit files: Use Edit (NOT sed/awk)
Read files: Use Read (NOT cat/head/tail)
Write files: Use Write (NOT echo >/cat <<)
Communication: Output text directly (NOT echo/printf)
```

加上一个兜底：
```
While Bash can do similar things, it's better to use the built-in tools
as they provide a better user experience and make it easier to review
tool calls and give permission.
```

**原理**：模型倾向用 Bash 做一切（因为 Bash 最灵活），需要在 Bash 的入口处拦截。

### 模式 4：SubAgent 提示词 = 角色 + 约束 + 效率要求

Explore SubAgent（494 tokens）的结构：

```
1. 角色定义：You are a file search specialist. You excel at navigating codebases.

2. 硬约束（大写强调）：
   === CRITICAL: READ-ONLY MODE ===
   STRICTLY PROHIBITED from creating/modifying/deleting files.

3. 能力描述：
   - Rapidly finding files using glob patterns
   - Searching code with powerful regex patterns  
   - Reading and analyzing file contents

4. 工具指导：
   - Use Glob/Grep for search
   - Use Read when you know the specific file path
   - Use Bash ONLY for read-only operations

5. 效率要求：
   You are meant to be a fast agent. In order to achieve this you must:
   - Make efficient use of tools: be smart about how you search
   - Wherever possible spawn multiple parallel tool calls
```

General Purpose SubAgent（277 tokens）更简洁：

```
Do what has been asked; nothing more, nothing less.
Report concisely — the caller will relay to the user.

Guidelines:
- Search broadly when you don't know where something lives.
- Start broad and narrow down.
- Use multiple search strategies if the first doesn't yield results.
- Be thorough: Check multiple locations, consider different naming conventions.
```

### 模式 5：委派提示词写法指导

Claude Code 有一个专门教「怎么给 SubAgent 写 prompt」的片段（365 tokens）：

```
有上下文继承时（fork）：
- Agent 已经知道一切，不需要解释背景
- Prompt 是指令：做什么、范围多大、不做什么
- 需要短回复就明说（"under 200 words"）

无上下文时（指定 subagent_type）：
- 像对一个刚走进房间的聪明同事做简报
- 解释你要完成什么、为什么
- 描述你已经了解或排除的内容

核心原则：永远不要委派理解。
不要写 "based on your findings, fix the bug"。
包含文件路径、行号、具体要改什么。
```

配有完整示例：

```javascript
// 好的委派 — 具体、有上下文
Task({
  description: "Independent migration review",
  subagent_type: "code-reviewer",
  prompt: "Review migration 0042_user_schema.sql for safety.
    Context: adding a NOT NULL column to a 50M-row table.
    Existing rows get a backfill default. I want a second
    opinion on whether the backfill is safe under concurrent writes."
})

// 坏的委派 — 模糊、委派理解
Task({ prompt: "Review the migration and fix any issues." })
```

### 模式 6：输出效率 = 行动优先

```
IMPORTANT: Go straight to the point. Try the simplest approach first
without going in circles. Do not overdo it. Be extra concise.

Lead with the answer or action, not the reasoning.
Skip filler words, preamble, and unnecessary transitions.
Do not restate what the user said — just do it.

Focus text output on:
- Decisions that need the user's input
- High-level status updates at natural milestones
- Errors or blockers that change the plan

If you can say it in one sentence, don't use three.
```

---

## 片段选用规则

| 触发条件 | 包含的片段 |
|----------|----------|
| **始终包含** | `parallel-tool-call-note`, `doing-tasks-*`(10+个), `tool-usage-*`(10+个), `output-efficiency` |
| **有 Bash 工具** | `bash-overview` + 30+ 子片段（alternatives, sandbox, git, sleep...） |
| **有 Task 工具** | `agent-when-to-launch`, `agent-usage-notes`, `writing-subagent-prompts`, `delegation-examples` |
| **Plan 模式** | `plan-mode-is-active` (923-1297 tokens) |
| **Auto 模式** | `auto-mode` (255 tokens) |
| **SubAgent 上下文** | 限制工具集，移除部分参数说明 |
| **运行时事件** | `file-modified`, `file-truncated`, `token-usage` 等 system-reminder 动态注入 |

---

## 与我们的对比

| 维度 | Claude Code | 我们（GLM-5） |
|------|------------|---------------|
| 系统提示词 | 40+ 片段，每个 1-3 句 | 单一 SYSTEM_PROMPT |
| grep 描述 | 能力说明，无策略 | 能力 + **策略补偿**（用 \| 组合，多次=低效） |
| 负面约束 | 集中在 Bash 描述 | 集中在 SYSTEM_PROMPT |
| SubAgent | Explore / General Purpose / code-reviewer | 单一 task 工具 |
| 模板变量 | `${GREP_TOOL_NAME}` 运行时替换 | 硬编码工具名 |

### 为什么我们需要策略补偿

Claude Code 不写 grep 策略，因为 Claude Sonnet/Opus 自己知道怎么搜。

我们用 GLM-5，测试结论：
- 去掉策略 → export 搜索从 1 次 grep 退化到 12 次
- 加回策略（在工具描述中）→ 恢复到 2 次 grep

**位置正确**（在工具描述而非系统提示词）但**内容是补偿性的**。当模型能力提升后可以去掉。

---

## 完整片段索引

110+ 个片段按功能分类：

```
system-prompt-doing-tasks-*     (10个) — 任务执行原则
system-prompt-tool-usage-*      (10个) — 工具选择路由
system-prompt-*                 (20个) — 其他行为指导
tool-description-*              (18个) — 工具专属描述
tool-description-bash-*         (30个) — Bash 子片段
agent-prompt-*                  (25个) — SubAgent + 工具提示词
system-reminder-*               (30个) — 运行时动态提醒
data-*                          (20个) — SDK/API 参考数据
skill-*                         (10个) — 内置技能
```

完整列表见 [GitHub 仓库](https://github.com/Piebald-AI/claude-code-system-prompts)。
