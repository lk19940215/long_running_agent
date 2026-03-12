# SDK介绍

[文档地址](https://platform.claude.com/docs/zh-CN/agent-sdk/typescript)
## 介绍
- sdk.query({promt, options})
- prompt: 用户提示词
- options:
    ```javascript
        const options = {
        // === 核心配置 ===
        systemPrompt: '...',           // 系统提示词
        // === 工具配置 ===
        allowedTools: ['Read', 'Write', 'Bash', "Glob", "Grep"],  // 允许的工具列表
        mcpServers: { ... },                      // MCP 服务器配置
        // === 控制配置 ===
        abortController: new AbortController(),   // 中断控制器
        maxTurns: 200,                            // 最大轮次（1 turn = 模型 1 次响应，默认无限制，仅 CI 推荐）
        // === Hooks ===
        hooks: {
            PreToolUse: [...],
            PostToolUse: [...],
            // ...
        },
        // === Agent 配置 ===
        agent: 'my-agent',            // 使用预定义的 agent
        agents: { ... },              // 自定义 agent 定义

        
        // === 其它 配置 ===
        continue: true, // 这个又是什么？
        includePartialMessages: true, // 流式输出 https://platform.claude.com/docs/zh-CN/agent-sdk/streaming-output

        // === 其他 ===
        additionalDirectories: ['/path/to/access'],  // 额外可访问目录
        permissionMode: 'bypassPermissions',                       // acceptEdits、bypassPermissions、default、plan
        };
        ```
- 使用方式
    ```
    import { query } from "@anthropic-ai/claude-agent-sdk";
    for await (const message of query({})) {
        // 处理消息体
    }
    ```

- 心得
    - permissionMode 配置 bypassPermissions，allowedTools 配置所有工具后，就可以自动化处理。
    - permissionMode 有:"plan"模式. 可以用子Agent模式来规划任务。


## 高阶用法
- agents 定义子Agent

# 想法定义一个自己的Plan模式执行框架

## Orchestration
 
- Context Agent (Retrieval Agent/Analysis Agent)  根据需求，查找检索代码、查找上下文。返回文件列表，不需要很具体，至少包含几个主要的入口？
- Plan Agent 根据上下文，对需求内容，做一个编排。
- Tester Agent
- Coder Agent
- Reviewer

# 代码重构

主Agent (Supervisor + harness 控制循环) 遵守 prompts\CLAUDE.md 对子Agent进行监督？

## 目录结构

```
agents/
  context-agent.ts
  planner-agent.ts
  executor-agent.ts
  reviewer-agent.ts
``
或者
```
core/
  orchestrator.ts

agents/
  context-agent
  retrieval-agent
  planner-agent
  executor-agent
  reviewer-agent

memory/
  task-memory
  project-memory
```

其它
```
prompts/
    core_prompt
    plan_prompt
    coding_prompt
    test_prompt
template/
    test_rule.md
```
### 结合 additionalContext

## 难点
- 如何通信
- 如何让子Agent返回想要的内容。

## 其它问题
- 基于这个claude Agent SDK,再封装，会不会多此一举？
- 中断的时候，不直接中断，总结一个上下文传给下一个 session?