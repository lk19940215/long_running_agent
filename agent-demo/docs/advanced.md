# 上下文管理 + 多模型 + 显示层

---

## 显示层：Ink（React for CLI）

原来的 `display.mjs` 用 ANSI `\r` 覆写状态，会被 `console.log` 冲掉。

当前方案：`src/core/ink.mjs`，基于 Ink v6（React for CLI）。

架构：
```
┌─ <Static> 永久区 ────────────────┐
│ ═══ AI Coding Agent ═══          │  ← 头部
│ 你: hello                        │  ← 对话历史
│ Agent: 你好                      │
│   ⚡ read_file → path: ...      │  ← 工具日志
│   ✓ read_file 完成               │
├─ 动态区（Spinner / 状态）─────────┤
│ ⠹ 思考中...                     │
│ 你: █                           │  ← 用户输入
└──────────────────────────────────┘
```

桥接模式：React `useState` setter 暴露到模块级变量 → 外部命令式代码调用 → 触发 React 重渲染。

---

## 文件编辑策略

✅ 已实现 Search & Replace：`edit_file(path, old_string, new_string)`

| 方案 | 采用者 | 状态 |
|------|--------|------|
| Search & Replace | Claude Code, Cline | ✅ 已实现 |
| Apply Patch | OpenAI / GPT | 未实现 |
| 行号定位 | IDE 插件 | 未实现 |

---

## 上下文管理策略

messages 随对话增长，最终超出模型上下文窗口。

| 策略 | 做法 | 适用 | 代价 |
|------|------|------|------|
| 滑动窗口 | 超过 N 条删最早的消息 | 最简实现 | 丢失早期上下文 |
| 工具结果裁剪 | 保留 tool_use 名称，缩短 tool_result content | token 最大头是工具结果 | 模型不知道之前工具返回了什么 |
| LLM 摘要 | 用便宜模型压缩旧消息为摘要 | 信息损失最小 | 多一次 API 调用 |
| 子代理隔离 | 子任务独立上下文，只返回结果 | 主上下文干净 | 需实现子代理 |

Claude Code 做法（PreCompact）：
1. 每次调用前估算 token 总量
2. 接近窗口 ~80% 时触发
3. 用 Haiku 压缩旧消息为一条摘要
4. 保留最近 N 轮不压缩

demo 最简实现：`messages.mjs` 的 `current` getter 加滑动窗口。

---

## 多模型策略

| 模型 | 上下文 | 最大输出 | 输入 $/MTok | 输出 $/MTok | 缓存命中 |
|------|--------|---------|------------|------------|---------|
| Opus 4.6 | 1M | 128K | 5 | 25 | 0.50 |
| Sonnet 4.6 | 1M | 64K | 3 | 15 | 0.30 |
| Haiku 4.5 | 200K | 64K | 1 | 5 | 0.10 |

路由设计（Claude Code）：
- Haiku → 意图分类、结果摘要、简单判断
- Sonnet/Opus → 代码生成、架构分析、复杂推理
- 降级 → 大模型超时 fallback 小模型

不需要节点图，while 循环 + `selectModel(stopReason, messages)` 即可。

效率：Prompt Caching、结果截断、消息裁剪、按需加载、并行工具。

---

## 待实现

- [ ] 测试上下文溢出，实现滑动窗口裁剪或 PreCompact
- [ ] config.mjs 预留 `FAST_MODEL`、`STRONG_MODEL`
- [ ] 配色方案微调
- [ ] Ink 支持 markdown 渲染（Agent 回复的格式化显示）
