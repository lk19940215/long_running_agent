# 模型配置传导链路

## 概述

Claude Coder 通过环境变量将模型配置传递给 Claude Agent SDK。本文档描述配置从 `.env` 文件到 SDK 的完整传导路径。

## 传导链路图

```
┌─────────────────────────────────────────────────────────────────────┐
│                         .claude-coder/.env                          │
│                                                                     │
│  MODEL_PROVIDER=coding-plan                                        │
│  ANTHROPIC_BASE_URL=https://open.bigmodel.cn/api/anthropic         │
│  ANTHROPIC_API_KEY=xxx                                             │
│  ANTHROPIC_DEFAULT_OPUS_MODEL=glm-5                                │
│  ANTHROPIC_DEFAULT_SONNET_MODEL=qwen3-coder-next                   │
│  ANTHROPIC_DEFAULT_HAIKU_MODEL=qwen3-coder-plus                    │
│  ANTHROPIC_MODEL=kimi-k2.5                                         │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    src/common/config.js                             │
│                                                                     │
│  parseEnvFile(p.envFile)                                           │
│      ↓                                                              │
│  loadConfig() → { provider, baseUrl, defaultOpus, ... }            │
│      ↓                                                              │
│  buildEnvVars(config) → { ANTHROPIC_DEFAULT_OPUS_MODEL, ... }      │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    src/core/session.js                              │
│                                                                     │
│  static async ensureSDK(config) {                                  │
│    Object.assign(process.env, buildEnvVars(config));               │
│    Session._sdk = await loadSDK();                                 │
│  }                                                                  │
│                                                                     │
│  // Session.run() 启动前自动调用 ensureSDK()                         │
│  Session.run('coding', config, { execute }) → ensureSDK(config)    │
│  Session.run('scan', config, { execute })   → ensureSDK(config)    │
│  Session.run('plan', config, { execute })   → ensureSDK(config)    │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       process.env                                   │
│                                                                     │
│  process.env.ANTHROPIC_DEFAULT_OPUS_MODEL = "glm-5"                │
│  process.env.ANTHROPIC_DEFAULT_SONNET_MODEL = "qwen3-coder-next"   │
│  ...                                                                │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Claude Agent SDK                                 │
│                                                                     │
│  SDK 从 process.env 读取环境变量                                     │
│  根据 alias (opus/sonnet/haiku) 自动选择对应模型                      │
└─────────────────────────────────────────────────────────────────────┘
```

## SDK 支持的环境变量

| 环境变量 | 说明 |
|----------|------|
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | 控制 `opus` alias 映射到哪个模型 |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | 控制 `sonnet` alias 映射 |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | 控制 `haiku` alias 映射 |
| `ANTHROPIC_MODEL` | 默认模型 |
| `ANTHROPIC_BASE_URL` | API 端点 |
| `ANTHROPIC_API_KEY` | API 密钥 |

**已废弃**: `ANTHROPIC_SMALL_FAST_MODEL` → 使用 `ANTHROPIC_DEFAULT_HAIKU_MODEL` 替代

## 调用时机

`Session.ensureSDK(config)` 在首次 `Session.run()` 时懒加载 SDK 单例，同时注入环境变量：

```javascript
// src/core/session.js

class Session {
  static _sdk = null;

  static async ensureSDK(config) {
    if (!Session._sdk) {
      Object.assign(process.env, buildEnvVars(config));
      const { loadSDK } = require('../common/sdk');
      Session._sdk = await loadSDK();
    }
    return Session._sdk;
  }

  static async run(type, config, { execute, ... }) {
    await Session.ensureSDK(config);  // 自动确保 SDK + 环境变量就绪
    const session = new Session(type, config, { ... });
    const result = await execute(session);
    session.finish();
    return result;
  }
}
```

## 相关文档

- [Claude Code Model Configuration](https://code.claude.com/docs/en/model-config)
- [Claude Code Settings](https://code.claude.com/docs/en/settings)
