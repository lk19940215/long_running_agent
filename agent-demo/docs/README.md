# Agent Demo 文档

> 归档规则：掌握的标 ✅，正在学的标 ▶，文件内容不用搬。

---

## 基础（已掌握）

- ✅ [Agent Loop + 消息协议 + SDK](core.md) — while 循环、stop_reason、tool_use/tool_result、API 调用
- ✅ [工具设计 + CLI vs IDE](tools.md) — 注册模式、description 要点、并发对比

## 进阶（当前聚焦）

- ▶ [文件编辑 + 上下文管理](advanced.md) — Search & Replace、裁剪策略、多模型路由
- 📌 [Claude Code vs Cursor](reference_targets.md) — 架构参照、优劣对比、启示
- ✅ [评估体系](eval.md) — Eval Harness、SWE-bench、Pass@k
- ✅ [AST + 语义搜索](semantic-search.md) — tree-sitter、Embedding、向量库
- ✅ [演进记录](changelog.md) — 版本变更 + 效率指标
- ✅ [提示词架构](prompt-architecture.md) — Claude Code 40+ 片段解析、工具描述 vs 系统提示词分工

## 路线图

```
阶段 1（你在这里）: 底层实现
      ↓
阶段 2: Vercel AI SDK
      ↓
阶段 3: LangGraph 多代理
      ↓
阶段 4: CLI → VS Code 插件 → Fork
```
