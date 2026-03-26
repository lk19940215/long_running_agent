# 工具设计

---

## 工具注册模式

```javascript
define('tool_name', '描述（模型据此决定何时调用）', { 参数schema }, ['必填'], async (input) => { ... });
```

参考：`src/tools/`（按职责拆分为 file.mjs / search.mjs / glob.mjs / ast.mjs / bash.mjs）

---

## 当前工具集（8 个）

工具命名对齐 Claude Code 风格（短名称）。

| 工具 | 用途 | 依赖 | Claude Code 对应 |
|------|------|------|-----------------|
| `read` | 读取文件内容 | Node fs | Read |
| `write` | 创建新文件 | Node fs | Write |
| `edit` | Search & Replace 修改文件 | Node fs | Edit |
| `grep` | 正则搜索代码内容 | @vscode/ripgrep | Grep |
| `glob` | 按文件名模式查找文件 | @vscode/ripgrep | Glob |
| `ls` | 列出目录文件树 | @vscode/ripgrep | LS |
| `symbols` | AST 分析（列符号/获取定义） | web-tree-sitter | — |
| `bash` | 执行 bash 命令 | child_process | Bash |

---

## 工具调用链 — AI 如何决定调什么

AI 的调用链完全由 LLM 自主决策，Agent Loop 不做编排。

典型场景："把 config.mjs 里的 MAX_TOKENS 改成 16384"

```
用户 → "把 MAX_TOKENS 改成 16384"
AI 推理 → 路径不确定 → glob("**/config.*") → src/config.mjs
结果返回 → read("src/config.mjs")
结果返回 → AI 看到 '8192' → edit(path, old_string='8192', new_string='16384')
结果返回 → AI 确认完成 → end_turn
```

你的代码不关心 AI 调了什么工具、按什么顺序，只做：
```
LLM 返回 tool_use → 执行 → 结果送回 → 再调 LLM → 重复
```

SYSTEM_PROMPT 的作用是引导 AI 的工具选择偏好（如"搜索用 grep，不要用 bash"）。

---

## edit 原理

```
readFile(path)
  → content.split(old_string).length - 1  // 计算匹配次数
  → 0 次 → 报错"未找到"
  → >1 次 → 报错"不够唯一"
  → 1 次 → content.replace(old_string, new_string) → writeFile
```

模型怎么知道 old_string？Agent Loop 自然流程保证：
先 read → 内容进 messages → 模型从中复制出精确的 old_string。

---

## grep 原理

底层使用 ripgrep（通过 `@vscode/ripgrep` npm 包），VS Code 和 Cursor 用的同一个方案。

```javascript
import { rgPath } from '@vscode/ripgrep';
execSync(`"${rgPath}" ${modeFlag} --max-count 200 "${pattern}" "${path}" --glob "${include}"`);
```

### output_mode 参数

| 模式 | ripgrep 参数 | 返回内容 | 用途 |
|------|-------------|---------|------|
| `content`（默认） | `--line-number --no-heading` | 文件:行号:匹配行 | 查看具体匹配 |
| `files_only` | `--files-with-matches` | 仅文件路径 | 快速定位哪些文件包含关键词 |
| `count` | `--count` | 文件:匹配数 | 评估匹配范围大小 |

推荐策略：先 `files_only` 定位文件 → 再 `content` 看具体行 → 或直接 `read`。

ripgrep 特性：自动遵守 .gitignore、跳过二进制文件、速度极快。

### ripgrep 自动忽略规则

ripgrep 默认忽略以下内容，**不需要手动配置**：

**1. `.gitignore` 文件中声明的路径**

本项目 `.gitignore`：
```
node_modules/
.env
logs/
*.log
```

所以 `grep`、`glob`、`ls` 默认**不会搜索/列出** `node_modules/`、`logs/`、`*.log` 文件。

**2. ripgrep 内置跳过**
- 二进制文件（图片、编译产物等）
- `.git/` 目录
- 隐藏文件（以 `.` 开头的文件/目录，默认跳过）

**3. 注意事项**
- 直接指定路径时会绕过 `.gitignore`：`rg --files ./logs` 能列出 logs 下的文件
- 从父目录遍历时遵守：`rg --files .` 不会进入 logs/
- 使用 `--no-ignore` 可强制搜索所有文件（包括被忽略的）
- `read` 工具用 Node.js `fs.readFile`，不受 `.gitignore` 影响，任何文件都能读

---

## glob 原理

按文件名模式查找文件。路径不确定时先用 glob 精确定位，避免猜路径导致 ENOENT 错误。

```
glob("**/agent.*")           → src/agent.mjs
glob("**/*.test.{js,ts}")    → 找所有测试文件
glob("src/**/*.mjs")         → 找 src 下所有 .mjs 文件
```

### 与 ls / grep 的区别

| 工具 | 搜什么 | 场景 |
|------|--------|------|
| `glob` | 按文件**名称**模式匹配 | 知道文件名但不知道路径 |
| `ls` | 列出目录所有文件 | 了解项目结构 |
| `grep` | 按文件**内容**正则匹配 | 找代码中的关键词 |

底层使用 ripgrep `--files --glob`，结果超过 100 个文件自动截断。

---

## ls 原理

列出目录文件树。和 `glob` 共享 ripgrep `--files` 底层。

```javascript
execSync(`"${rgPath}" --files --max-depth ${max_depth} "${path}"`);
```

- 自动遵守 `.gitignore`
- 比 Node.js `readdir` 递归快一个数量级
- 支持 `max_depth` 控制递归深度

---

## MultiEdit 原理（未实现）

### 为什么需要 MultiEdit

`edit` 每次只能改一处。如果一个文件需要改 5 个地方：

```
edit → 改第 1 处 → API 调用 → 模型决定改第 2 处 →
edit → 改第 2 处 → API 调用 → ... → 改第 5 处
```

5 次工具调用 = 5 次 API 往返，每次都发送完整 messages 历史，token 开销巨大。

MultiEdit 把 N 次操作合并为 1 次：

```
multi_edit(path, [
  { old_string: 'A', new_string: 'A2' },
  { old_string: 'B', new_string: 'B2' },
  { old_string: 'C', new_string: 'C2' },
])
```

### 实现原理

```javascript
define('multi_edit', '对同一文件执行多处 Search & Replace', {
  path: { type: 'string' },
  edits: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        old_string: { type: 'string' },
        new_string: { type: 'string' },
      },
      required: ['old_string', 'new_string'],
    },
  },
}, ['path', 'edits'], async ({ path, edits }) => {
  let content = await readFile(path, 'utf-8');
  const results = [];

  for (const [i, edit] of edits.entries()) {
    const count = content.split(edit.old_string).length - 1;
    if (count !== 1) {
      results.push(`#${i + 1} 失败: 匹配 ${count} 次`);
      continue;
    }
    content = content.replace(edit.old_string, edit.new_string);
    results.push(`#${i + 1} 成功`);
  }

  await writeFile(path, content, 'utf-8');
  return results.join('\n');
});
```

### 关键细节

1. **顺序执行**：edits 从上到下依次应用，每次替换后文件内容变化，后续 old_string 匹配的是**更新后的内容**
2. **唯一性检查**：和 edit 相同，每个 old_string 必须精确匹配 1 次
3. **部分成功**：某处匹配失败不影响其他编辑（跳过 + 报告），最终结果告诉模型哪些成功哪些失败
4. **原子性选择**：生产级可以做全部成功才写入（回滚），或允许部分成功（当前方案）

### Edit vs MultiEdit 对比

| | Edit | MultiEdit |
|--|------|-----------|
| 每次调用 | 改 1 处 | 改 N 处 |
| API 往返 | N 次（改 N 处） | 1 次 |
| 模型难度 | 低（只关注一处） | 高（需同时准备多个 old_string） |
| 上下文消耗 | 每次都发完整历史 | 只发 1 次 |
| 适用场景 | 简单修改 | 重构、批量重命名、多处联动修改 |

### 与 Apply Patch（diff 格式）的区别

```
// MultiEdit: 精确字符串匹配
{ old_string: 'const MAX = 100', new_string: 'const MAX = 200' }

// Apply Patch: unified diff 格式
@@ -5,3 +5,3 @@
-const MAX = 100
+const MAX = 200
```

Apply Patch（OpenAI 方案）依赖模型生成正确的 diff 格式，上下文行号必须精确。
MultiEdit（Claude/Anthropic 方案）依赖精确的字符串匹配，不依赖行号，更鲁棒。

---

## Claude Code 完整工具列表

```
Bash, Read, Write, Edit, MultiEdit, Grep, Glob, LS,
WebFetch, WebSearch, Task, TodoWrite, NotebookRead, NotebookEdit, mcp__*
```

agent-demo 已实现：`Bash, Read, Write, Edit, Grep, Glob, LS` + `Symbols`（自研）

以下是未实现工具的原理和实现思路。

---

## WebFetch 原理（未实现）

### 作用

获取 URL 内容，转为可读文本返回给模型。用于查阅文档、API 参考、GitHub 代码等。

### 实现

```javascript
define('web_fetch', '获取 URL 内容，返回可读文本', {
  url: { type: 'string', description: '完整 URL' },
}, ['url'], async ({ url }) => {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'AI-Agent/1.0' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return `HTTP ${response.status}: ${response.statusText}`;

  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();

  if (contentType.includes('json')) return text;
  if (contentType.includes('html')) {
    return htmlToText(text); // 需要实现或用库
  }

  return text;
});
```

### HTML 转文本方案

| 方案 | npm 包 | 特点 |
|------|--------|------|
| HTML → Markdown | `turndown` | 保留格式，模型友好 |
| 提取正文 | `@mozilla/readability` | 去掉导航/广告，只保留文章 |
| 简单去标签 | 正则 `/<[^>]*>/g` | 粗暴但零依赖 |

生产级推荐 `turndown`（HTML→Markdown），模型理解 Markdown 比纯文本好。

---

## WebSearch 原理（未实现）

### 作用

搜索互联网，返回摘要和链接。模型通过搜索获取训练数据之外的实时信息。

### 实现

```javascript
define('web_search', '搜索互联网，返回摘要和链接', {
  query: { type: 'string', description: '搜索关键词' },
}, ['query'], async ({ query }) => {
  const resp = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}`, {
    headers: { 'X-Subscription-Token': BRAVE_API_KEY },
  });
  const data = await resp.json();
  return data.web.results.slice(0, 5).map(r =>
    `${r.title}\n${r.url}\n${r.description}`
  ).join('\n\n');
});
```

### 搜索 API 选择

| API | 免费额度 | 质量 |
|-----|---------|------|
| Brave Search | 2000次/月 | 好 |
| Google Custom Search | 100次/天 | 最好 |
| SerpAPI | 100次/月 | 好 |
| DuckDuckGo Instant | 无限（非官方） | 一般 |

Claude Code 和 Cursor 都是调第三方搜索 API，不是自己爬网页。

---

## Task / SubAgent 原理（未实现）

### 作用

将子任务委托给独立的 Agent Loop，子 Agent 有独立的 messages 历史，完成后只返回摘要。

### 为什么需要

```
父 Agent messages: [用户消息, AI回复, tool1, tool2, ... tool50, ...]
                    ↑ 每次 API 调用都发送全部，token 爆炸

SubAgent: 独立 messages，完成后只返回一段摘要文本
父 Agent messages: [用户消息, AI回复, task_result: "分析完成，共6个文件"]
                    ↑ 主上下文干净
```

### 实现

```javascript
async function runSubAgent({ client, prompt, tools, systemPrompt, maxTurns = 15 }) {
  const messages = [{ role: 'user', content: prompt }];
  let lastText = '';

  for (let i = 0; i < maxTurns; i++) {
    const response = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      tools,
      messages,
    });

    messages.push({ role: 'assistant', content: response.content });
    if (response.stop_reason === 'end_turn') break;

    const toolResults = [];
    for (const block of response.content) {
      if (block.type === 'text') lastText = block.text;
      if (block.type === 'tool_use') {
        const result = await executeTool(block.name, block.input);
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
      }
    }
    if (toolResults.length > 0) {
      messages.push({ role: 'user', content: toolResults });
    }
  }
  return lastText;
}

define('task', '委托子任务给独立 Agent', {
  prompt: { type: 'string', description: '任务描述' },
  description: { type: 'string', description: '简述（3-5 字）' },
}, ['prompt', 'description'], async ({ prompt, description }) => {
  return await runSubAgent({ client, prompt, tools: toolSchemas, systemPrompt: SYSTEM_PROMPT });
});
```

### Cursor 的 SubAgent 类型

| 类型 | 用途 | 特点 |
|------|------|------|
| `generalPurpose` | 通用任务 | 完整工具集 |
| `explore` | 代码探索 | 只读，速度快 |
| `shell` | 命令执行 | 专注终端 |
| `browser-use` | 浏览器测试 | Web 自动化 |
| `best-of-n-runner` | 并行尝试 | 独立 git worktree，取最优解 |

---

## TodoWrite 原理（未实现）

### 作用

模型在处理复杂多步任务时，自行创建和管理 TODO 列表。帮助模型组织思路，跟踪进度。

不是给用户看的——是**模型给自己用的**。

### 实现

```javascript
let _todos = [];

define('todo_write', '创建或更新任务列表', {
  todos: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        content: { type: 'string' },
        status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled'] },
      },
      required: ['id', 'content', 'status'],
    },
  },
  merge: { type: 'boolean', description: '合并还是替换' },
}, ['todos'], async ({ todos, merge = true }) => {
  if (merge) {
    for (const todo of todos) {
      const existing = _todos.find(t => t.id === todo.id);
      if (existing) Object.assign(existing, todo);
      else _todos.push(todo);
    }
  } else {
    _todos = todos;
  }
  return _todos.map(t => `[${t.status}] ${t.id}: ${t.content}`).join('\n');
});
```

---

## 设计要点

- description 写清"能做什么"+"什么时候用"（模型选工具的唯一依据）
- JSON Schema 加约束（enum、maxLength）
- 返回结果截断（demo 用 8000 字符），防止上下文溢出
- 错误用明确消息返回，让模型换策略重试

---

## CLI vs IDE 并发

| | CLI Agent（Claude Code / demo） | IDE Agent（Cursor） |
|--|------|------|
| 执行 | 串行：多个 tool_use 逐个执行 | 子代理并行：最多 8 个独立 worktree |
| 并行技巧 | "batch tool" 鼓励模型返回多 tool_use | 内置 Explore/Bash/Browser 子代理 |
| 文件访问 | 通过工具调用（消耗 token） | 直接文件系统 + LSP |

Cursor 更快：子代理并行 + 直接文件访问 + LSP 集成。
