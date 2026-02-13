# Long-Running Agent Harness

[中文](README.md) | **English**

Let AI Agents autonomously complete complex, multi-step coding tasks.

A single AI session has limited context. When facing large requirements, agents tend to lose progress, prematurely declare success, or produce broken code. This tool wraps the agent in an **external harness** that manages task state, validates every session's output, and automatically rolls back + retries on failure — turning the agent into a "reliable, retryable function."

Based on [Anthropic: Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents), with multiple engineering-grade enhancements.

---

## Quick Start (30 seconds)

**Prerequisites**: [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) (`npm install -g @anthropic-ai/claude-code`) + Python 3 + Git

```bash
# 1. Clone this repo into your project directory
cd /path/to/your/project
git clone --depth 1 https://github.com/lk19940215/long_running_agent.git
rm -rf long_running_agent/.git    # Remove the tool's own git history to avoid nested repos

# 2. Launch (first run auto-scans the project + decomposes tasks)
bash long_running_agent/run.sh "Implement user login with email and OAuth support"

# 3. Resume later (automatically picks up where it left off)
bash long_running_agent/run.sh
```

That's it. Details below.

---

## What Happens After You Run It

```
bash long_running_agent/run.sh "your requirement"
        |
        v
  ┌─────────────────────────────────────────────┐
  │ 1. Project Scan (auto on first run)          │
  │    Agent scans project files → generates:    │
  │    - project_profile.json (project metadata) │
  │    - init.sh (environment init script)       │
  │    - tasks.json (task list + status)         │
  └─────────────────────────────────────────────┘
        |
        v
  ┌─────────────────────────────────────────────┐
  │ 2. Coding Loop (repeats until all done)      │
  │                                              │
  │    Each session:                             │
  │    ① Restore context (read progress + git)   │
  │    ② Health check (start services, ports)    │
  │    ③ Pick a task (failed first, then pending)│
  │    ④ Incremental impl (one feature at a time)│
  │    ⑤ Test & verify (end-to-end)              │
  │    ⑥ Wrap up (git commit + update progress)  │
  └─────────────────────────────────────────────┘
        |
        v
  ┌─────────────────────────────────────────────┐
  │ 3. Harness Validation (after every session)  │
  │                                              │
  │    ✓ session_result.json valid?              │
  │    ✓ New git commit exists?                  │
  │    ✓ Service health check passed?            │
  │    ✓ Custom hooks passed?                    │
  │                                              │
  │    Fail → git rollback → retry (up to 3x)   │
  │    Pass → continue to next session           │
  └─────────────────────────────────────────────┘
        |
        v
  All tasks done → auto exit
  Ctrl+C mid-way → resume on next run
```

### Check Progress

```bash
cat long_running_agent/progress.txt          # Work log for each session
cat long_running_agent/tasks.json            # Task list and statuses
cat long_running_agent/project_profile.json  # Auto-detected project metadata
```

---

## How It Works

### Core Loop: Who Does What

The system has two layers, each with a clear responsibility:

- **Outer layer — run.sh (harness)**: A while loop that makes no intelligent decisions. It only: invokes the Agent → validates output → rolls back on failure → repeats.
- **Inner layer — Agent (Claude)**: Within each session, the Agent reads `tasks.json`, picks a task, writes code, tests, and commits.

```
run.sh core logic (pseudocode):

while session < 50:                          # Safety cap, prevents infinite loops
    if all tasks done:
        exit                                 # All done, exit

    record git HEAD                          # Remember pre-session code state

    claude -p "follow CLAUDE.md"             # ← Agent picks task, implements, tests, commits

    bash validate.sh                         # ← Harness externally validates Agent's output

    if validation passed:
        continue                             # Next session
    else:
        git reset --hard HEAD_BEFORE         # Roll back to pre-session state
        consecutive_failures++
        if consecutive_failures >= 3:
            force-mark current task as failed # Skip this task, prevent dead loops
            consecutive_failures = 0

    every 5 sessions, pause and ask user to confirm
```

**Why doesn't the harness pick tasks?** Because the Agent has full project context (code, dependencies, previous progress) — it's better at making decisions than a shell script. The harness only does what the Agent can't: external validation and forced rollback.

### Task Selection Logic

At the start of each session, the Agent selects a task from `tasks.json` following these rules:

1. **Prioritize `failed` tasks** — fixing previous failures is more important than new features
2. **Then `pending` tasks** — new features that haven't been started
3. **Sort by `priority`** — lower number = higher priority
4. **Check `depends_on`** — skip if dependencies aren't `done` yet
5. **One task at a time** — prevents context exhaustion

Once selected, the Agent changes the task `status` to `in_progress` and begins implementation.

### Task State Machine

Each task has 5 states and must flow in order — no skipping:

```
pending ──→ in_progress ──→ testing ──→ done
                               │
                               v
                            failed ──→ in_progress (retry)
```

| Status | Meaning | Set By |
|---|---|---|
| `pending` | Not started | Auto-set during initialization |
| `in_progress` | Being implemented | Agent when it picks the task |
| `testing` | Code done, running tests | Agent when it starts verification |
| `done` | Tests passed | Agent after confirming tests pass |
| `failed` | Tests failed or implementation broken | Agent on discovery / harness after 3 consecutive failures |

**Forbidden transitions**: `pending` cannot go directly to `done` (must code then test), `in_progress` cannot go directly to `done` (must test first).

### Validation & Failure Handling

After each session, the harness runs `validate.sh` to check the Agent's output. There are 4 scenarios:

**Scenario 1 — Normal completion**

```
Agent implements feature → tests pass → status set to done → git commit → writes session_result.json
    → validate.sh checks: session_result valid ✓ new git commit ✓
    → Pass, move to next session
```

**Scenario 2 — Agent self-reports failure**

```
Agent implements feature → tests fail → status set to failed → git commit → session_result says "failed"
    → validate.sh checks: session_result valid (Agent honestly reported failure) ✓
    → Pass (no rollback), next session Agent will prioritize fixing this failed task
```

**Scenario 3 — Agent output invalid (rollback needed)**

```
Agent crashes / times out / didn't write session_result.json / JSON format error
    → validate.sh checks: session_result missing or invalid ✗
    → Fatal failure → harness executes git reset --hard (back to pre-session state)
    → tasks.json also rolled back, task status restored
    → Next session retries the same task
```

**Scenario 4 — 3 consecutive failures (skip)**

```
Same task triggers Scenario 3 three times in a row
    → Harness decides the Agent can't handle this task
    → Force-marks in_progress task as failed
    → Resets failure counter, moves on to next pending task
```

### Git Rollback Consistency

Rollback uses `git reset --hard HEAD_BEFORE`, which restores **all files** to pre-session state — including `tasks.json`. So the task status is also reverted. This means:

- After rollback, there's no "half-modified" dirty state
- The next session sees `tasks.json` exactly as it was after the last successful session
- The Agent will re-select the same task (since it's still `pending` or `in_progress`)

### Safety Mechanisms

Safeguards to prevent the Agent from running indefinitely or going out of control:

| Mechanism | Description |
|---|---|
| Max sessions | Defaults to 50 sessions, then auto-stops with instructions on how to continue |
| Per-task max retry | After 3 consecutive failures on the same task, force-marks it as `failed` and moves on |
| Periodic human check | Pauses every 5 sessions, waits for user confirmation to continue |
| Ctrl+C safe exit | Gracefully exits on interrupt signal, shows how to resume with `bash long_running_agent/run.sh` |
| Init retry | Project scan phase retries up to 3 times to handle transient errors |
| Git rollback | Auto `git reset --hard` on every validation failure — code never stays in a broken state |

**Checkpoint recovery**: Whether interrupted by Ctrl+C, unexpected terminal closure, or session limit reached — just re-run `bash long_running_agent/run.sh` to resume from where it left off. All progress is persisted in `tasks.json` and `progress.txt`.

---

## Cursor IDE Mode

If you use Cursor instead of Claude CLI, this tool still works. The difference: you manually trigger each conversation instead of run.sh auto-looping.

### Setup

```bash
# One-time: copy the rules file to Cursor config
mkdir -p .cursor/rules
cp long_running_agent/cursor.mdc .cursor/rules/long-running-agent.mdc
```

### Usage

1. **First conversation**: Create a new chat in Cursor and enter your requirement, e.g.:

   > "Implement user login with email and OAuth support"

   Cursor auto-reads the Agent protocol (via cursor.mdc). The Agent will perform project scanning, generate tasks.json, etc.

2. **Subsequent conversations**: Just create a new chat. The Agent will automatically:
   - Read `CLAUDE.md` for the work protocol
   - Read `progress.txt` and `tasks.json` to restore context
   - Pick the next task, implement, test, and commit

3. **After each conversation** (optional): Run validation to confirm the Agent's output is acceptable

   ```bash
   bash long_running_agent/validate.sh
   ```

### CLI Mode vs Cursor Mode

| Dimension | Claude CLI Mode | Cursor IDE Mode |
|---|---|---|
| Who drives the loop | `run.sh` auto-loops | You manually start each conversation |
| Validation | Automatic (after every session) | Optional (manually run validate.sh) |
| Rollback | Automatic git reset | Manual / Agent self-check |
| Best for | Unattended batch development | Interactive development, human-in-the-loop |

---

## Optional Configuration

By default, no configuration is needed. The following are **optional**.

```bash
bash long_running_agent/setup.sh
```

### Alternative Models (Cost Reduction)

Defaults to the official Claude API. For alternative models:

| Option | Description |
|---|---|
| Claude Official | Default, highest quality |
| GLM 4.7 (Zhipu) | `open.bigmodel.cn` compatible gateway, direct China access, lower cost |
| GLM 4.7 (Z.AI) | `api.z.ai` compatible gateway, overseas node |
| Custom | Any Anthropic-compatible BASE_URL |

### MCP Tools (Browser Testing)

For projects with a web frontend, consider installing [Playwright MCP](https://github.com/microsoft/playwright-mcp). The Agent will use it for end-to-end browser testing (click, snapshot, navigate, and 25+ other tools). Pure backend projects can skip this.

Configuration is saved in `config.env` (auto-added to `.gitignore`), only affects this tool, doesn't change global settings.

---

## Enhancements Over the Anthropic Article

This tool builds on Anthropic's [long-running agent harness](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) with engineering-grade enhancements:

| Dimension | Anthropic Original | This Tool |
|---|---|---|
| Task status | Simple bool (`passes`) | 5-state machine (`pending` → `in_progress` → `testing` → `done` / `failed`) |
| Validation | Relies on Agent self-report | External harness hard-validation (`validate.sh`) |
| Failure handling | None | Auto git rollback + up to 3 retries |
| Project info | Hardcoded in CLAUDE.md | Auto-scanned `project_profile.json` |
| Environment init | Hand-written init.sh | Agent auto-generates after scanning |
| Structured output | None | Mandatory `session_result.json` per session (machine-readable) |
| Runtime env | Claude CLI only | Claude CLI + Cursor IDE |
| Testing tools | None | Pluggable Playwright MCP browser automation |
| Validation hooks | None | `validate.d/` hook directory, user-extensible |
| Model selection | Claude only | GLM 4.7 and other Anthropic-compatible models |

---

## Reference

### File Descriptions

**Pre-packaged files** (generic, copy to any project):

| File | Description |
|---|---|
| `CLAUDE.md` | Agent protocol: state machine, 6-step workflow, hard rules |
| `run.sh` | CLI mode entry: outer loop + validation + rollback + retry |
| `validate.sh` | Standalone validation script: auto-called by CLI / manually run for Cursor |
| `setup.sh` | Interactive setup (model selection + MCP tool installation) |
| `cursor.mdc` | Cursor rules file: copy to `.cursor/rules/` to use |
| `README.md` | Chinese documentation |
| `README.en.md` | This file (English documentation) |

**Runtime-generated** (project-specific, created by Agent or setup.sh):

| File | Description |
|---|---|
| `config.env` | Model + MCP config (generated by setup.sh, contains API Keys, gitignored) |
| `project_profile.json` | Auto-detected project metadata (tech stack, services, ports, etc.) |
| `init.sh` | Auto-generated environment init script (idempotent design) |
| `tasks.json` | Task list + state machine tracking |
| `progress.txt` | Cross-session memory log (append-only) |
| `session_result.json` | Temporary file (deleted by harness after each session) |

### Custom Validation Hooks

Place `.sh` scripts in the `validate.d/` directory. `validate.sh` will automatically execute them:

```bash
mkdir -p long_running_agent/validate.d

# Example: add a lint check
cat > long_running_agent/validate.d/lint.sh << 'EOF'
#!/bin/bash
cd "$(dirname "$0")/../.."
npm run lint 2>&1 || exit 2  # exit 2 = warning, exit 1 = fatal
EOF
```

Hook exit code convention: `0` = pass, `1` = fatal failure (triggers git rollback), `2+` = warning (non-blocking).
