# Claude Coder

[中文](../README.md) | **English**

A **long-running autonomous coding Agent Harness**: built on Claude Agent SDK, using Hook-based prompt injection to guide model behavior, countdown-based activity monitoring for stable operation, and multi-session orchestration for fully automated delivery from a one-liner requirement to a complete project.

### Highlights

- **Session Lifecycle Management**: Session class encapsulating SDK management, query execution, hooks, and indicator — with AI-driven JSON self-healing repair in the runner loop
- **Hook Prompt Injection**: JSON-configured rules inject contextual guidance during tool calls — extend rules without code changes ([mechanism details](../design/hook-mechanism.md))
- **Long-running Auto-coding Loop**: Multi-session orchestration + countdown activity monitoring + git rollback & retry — Agent codes continuously for hours ([guard details](../design/session-guard.md))
- **Configuration-driven**: Supports Claude official, Coding Plan multi-model routing, DeepSeek, or any Anthropic-compatible API

---

## Quick Start

```bash
# Prerequisites: Install Claude Agent SDK
npm install -g @anthropic-ai/claude-agent-sdk

# Install
npm install -g claude-coder

# Configure model
claude-coder setup

# Start auto-coding
cd your-project
claude-coder run "Implement user registration and login"
```

## Commands

| Command | Description |
|---------|-------------|
| `claude-coder setup` | Interactive configuration (model, MCP, safety limits, auto-review) |
| `claude-coder init` | Initialize project environment (scan tech stack, generate profile) |
| `claude-coder init --deploy-templates` | Deploy templates and recipes to project directory (customizable) |
| `claude-coder plan "requirement"` | Generate plan document |
| `claude-coder plan -r [file]` | Generate plan from requirements file |
| `claude-coder plan --planOnly` | Generate plan only, no task decomposition |
| `claude-coder plan -i "requirement"` | Interactive mode, allow model to ask questions |
| `claude-coder go` | AI-driven interactive requirement assembly |
| `claude-coder go "requirement"` | AI auto-analyzes and assembles solution |
| `claude-coder go -r file` | Read requirement from file and auto-assemble |
| `claude-coder run [requirement]` | Auto-coding loop |
| `claude-coder run --max 1` | Single session |
| `claude-coder run --dry-run` | Preview mode (view task queue) |
| `claude-coder simplify [focus]` | Code review and simplification |
| `claude-coder auth [url]` | Export Playwright login state |
| `claude-coder status` | View progress and costs |

**Options**: `--max N` limit sessions (default 50), `--pause N` pause every N sessions for confirmation, `--model M` specify model.

## How It Works

```
Requirement ─→ Project scan ─→ Task decomposition ─→ Coding loop
                                                       │
                                                 ┌─────┴─────┐
                                                 │  Session N  │
                                                 │  Claude SDK │
                                                 │  3-step flow│
                                                 └─────┬─────┘
                                                       │
                                                  Runner validate
                                                  (with AI repair)
                                                       │
                                             Pass → simplify? → push → next task
                                             Fail → git rollback + retry
```

Each session, the agent autonomously follows 3 steps: **implement** (task context injected by harness, code the feature) → **verify** (lightweight tests by category) → **wrap up** (git commit + write session_result.json).

After each session, the runner validates `session_result.json` + git progress. If JSON is corrupted, AI auto-repairs it via `repair.js`. If validation fails, code is rolled back and retried.

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](../design/ARCHITECTURE.md) | Core design rules, Session class responsibilities, module relations, prompt injection |
| [Hook Injection Mechanism](../design/hook-mechanism.md) | SDK Hook research, GuidanceInjector matching pipeline, config format, side effects |
| [Session Guard](../design/session-guard.md) | Abort strategy, countdown activity detection, tool running state, anti-flooding |
| [Go Command Flow](../design/go-flow.md) | AI-driven requirement assembly, recipe system, plan handoff |
| [Playwright Credentials](PLAYWRIGHT_CREDENTIALS.md) | Test cookies and API key management |
| [SDK Guide](CLAUDE_AGENT_SDK_GUIDE.md) | Claude Agent SDK API reference |

## Model Support

| Provider | Description |
|----------|-------------|
| Default | Claude official, uses system login credentials |
| Coding Plan | Self-hosted API with recommended multi-model routing |
| API | DeepSeek or any Anthropic-compatible API |

## Recommended Configurations

### Long-running Agent (Most Stable)

```bash
ANTHROPIC_DEFAULT_OPUS_MODEL=glm-5
ANTHROPIC_DEFAULT_SONNET_MODEL=qwen3-coder-next
ANTHROPIC_DEFAULT_HAIKU_MODEL=qwen3-coder-plus
ANTHROPIC_MODEL=kimi-k2.5
```

### Personal Claude Code (Strongest)

```bash
ANTHROPIC_DEFAULT_OPUS_MODEL=qwen3-max-2026-01-23
ANTHROPIC_DEFAULT_SONNET_MODEL=qwen3-coder-next
ANTHROPIC_DEFAULT_HAIKU_MODEL=qwen3-coder-plus
ANTHROPIC_MODEL=glm-5
```

## Project Structure

```
your-project/
  .claude-coder/              # Runtime data (gitignored)
    .env                    # Model config
    project_profile.json    # Project scan results
    tasks.json              # Task list + status
    session_result.json     # Last session result
    progress.json           # Session history + costs
    test.env                # Test credentials (optional)
    go/                     # Go command output files
    recipes/                # Recipe library (deployed with --deploy-templates, optional)
    .runtime/
      harness_state.json    # Runtime state (session count, etc.)
      logs/                 # Per-session logs
```

## FAQ

**"Credit balance is too low"**: Run `claude-coder setup` to reconfigure your API Key.

**Resume after interruption**: Just re-run `claude-coder run` — it picks up where it left off.

**Long idle periods**: The model may have extended thinking intervals on complex tasks (indicator shows yellow "tool running" or red "no response"). Auto-interrupts and retries after the threshold. Adjust via `claude-coder setup` safety limits or `SESSION_STALL_TIMEOUT=seconds` in `.env`.

## References

[Anthropic: Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents),

## License

MIT
