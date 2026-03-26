# 代码分析与语义搜索

## 当前实现：code_symbols（tree-sitter AST）

使用 `web-tree-sitter`（WASM 版）解析代码 AST，提供两种模式：

```
code_symbols(path, mode="list")              → 文件符号表
code_symbols(path, mode="definition", name)  → 指定符号完整代码
```

### 依赖

```json
"web-tree-sitter": "^0.26.7",
"@repomix/tree-sitter-wasms": "^0.1.16"
```

- `web-tree-sitter`：官方 WASM 运行时，支持 ESM import
- `@repomix/tree-sitter-wasms`：预构建 wasm 语法文件，兼容 0.26.x（替代停更的 `tree-sitter-wasms`）

实现位置：`src/tools/ast.mjs`

支持语言：`.js` / `.mjs` / `.ts` / `.py`（通过 wasm 语法文件，包含 17 种语言）

### 与 grep_search + read_file 的分工

| 场景 | 推荐工具 | 原因 |
|------|---------|------|
| 搜索关键词/import | grep_search | 跨文件正则搜索 |
| 了解文件结构 | code_symbols(list) | 一次列出所有符号+行号 |
| 获取特定函数代码 | code_symbols(definition) | 精确范围，不读整个文件 |
| 修改前读取内容 | read_file | edit_file 需要精确匹配原文 |

### tree-sitter 特性

- **增量解析**：改一行只重新解析受影响范围
- **容错**：语法错误也能解析
- **多语言**：100+ 语言支持
- **速度**：C 底层 WASM，1000 行文件 < 5ms

## 后续扩展：语义搜索（Embedding + 向量库）

当前 Agent 使用 ripgrep 文本搜索 + tree-sitter 结构分析。如需进一步的语义搜索，路径：

```
tree-sitter 分块 → Embedding 模型 → 向量数据库 → 语义匹配
```

### 各产品方案对比

| 产品 | 搜索方式 | 向量存储 |
|------|---------|---------|
| Claude Code | ripgrep（纯文本） | 无 |
| Cursor | tree-sitter + Embedding | 云端 Turbopuffer |
| claude-context-local | AST 分块 + 本地 Embedding | SQLite |

### Cursor 架构参考

- 客户端：tree-sitter 解析 → Merkle Tree 哈希 → 只传变化块到云端
- 服务端：Embedding → Turbopuffer 向量库 → 语义匹配
- `.cursor` 目录存文件哈希和分块元数据，不存向量

### Node.js 向量库选项

| 方案 | 类型 | 适合场景 |
|------|------|---------|
| LanceDB | 嵌入式 | 本地文件存储，无需 server |
| hnswlib-node | 嵌入式 | 纯向量搜索，极轻量 |
| ChromaDB | C/S | 功能丰富，需启动服务 |

### 实现路径

1. tree-sitter 分块（已有 `code_symbols`）
2. 本地 Embedding（Ollama nomic-embed-text）
3. LanceDB 存储 + 搜索
4. 注册 `semantic_search` 工具
