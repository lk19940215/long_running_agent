#!/bin/bash
# ============================================================
# Long-Running Agent Harness (通用版)
#
# 用法:
#   首次运行:  bash long_running_agent/run.sh "你的需求描述"
#   继续运行:  bash long_running_agent/run.sh
#
# 核心职责（harness 不信任 Agent，做外部校验）：
#   1. 首次运行时：项目扫描 → 生成 profile/init.sh → 任务分解
#   2. 循环调用 Claude Code 执行编码会话
#   3. 每次会话后调用 validate.sh 校验
#   4. 校验失败时自动 git 回滚 + 重试
#   5. 所有任务 done 时自动退出
#
# 本脚本不含任何项目特定信息。
# 项目信息由 Agent 扫描后存入 project_profile.json。
# ============================================================

set -euo pipefail

# ============ 配置 ============
MAX_SESSIONS=50          # 最大会话数（安全上限）
MAX_RETRY=3              # 每个任务最大重试次数
PAUSE_EVERY=5            # 每 N 个会话暂停确认

# ============ 路径 ============
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TASKS_FILE="$SCRIPT_DIR/tasks.json"
PROGRESS_FILE="$SCRIPT_DIR/progress.txt"
SESSION_RESULT="$SCRIPT_DIR/session_result.json"
PROFILE="$SCRIPT_DIR/project_profile.json"
CLAUDE_MD="$SCRIPT_DIR/CLAUDE.md"
VALIDATE_SH="$SCRIPT_DIR/validate.sh"

# ============ 颜色输出 ============
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC}  $1"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ============ 前置检查 ============
check_prerequisites() {
    if ! command -v claude &> /dev/null; then
        log_error "请先安装 Claude Code: npm install -g @anthropic-ai/claude-code"
        exit 1
    fi

    if ! command -v python3 &> /dev/null; then
        log_error "需要 python3 来解析 JSON 文件"
        exit 1
    fi

    if [ ! -f "$CLAUDE_MD" ]; then
        log_error "CLAUDE.md 不存在: $CLAUDE_MD"
        exit 1
    fi

    if [ ! -f "$VALIDATE_SH" ]; then
        log_error "validate.sh 不存在: $VALIDATE_SH"
        exit 1
    fi

    # 检测模型配置
    if [ ! -f "$SCRIPT_DIR/config.env" ]; then
        log_warn "未找到模型配置文件"
        log_warn "如需使用 GLM 4.7 等替代模型降低成本，请先运行:"
        log_warn "  bash long_running_agent/setup.sh"
        log_info "本次将使用默认 Claude 模型继续"
    fi

    # 提示 Cursor 用户复制规则文件
    if [ -d "$PROJECT_ROOT/.cursor" ] && [ ! -f "$PROJECT_ROOT/.cursor/rules/long-running-agent.mdc" ]; then
        if [ -f "$SCRIPT_DIR/cursor.mdc" ]; then
            log_warn "检测到 .cursor/ 目录但未安装 Cursor 规则文件"
            log_warn "如需 Cursor IDE 支持，请执行:"
            log_warn "  mkdir -p .cursor/rules && cp long_running_agent/cursor.mdc .cursor/rules/long-running-agent.mdc"
        fi
    fi

    # 确保 git 仓库存在
    cd "$PROJECT_ROOT"
    if [ ! -d .git ]; then
        log_info "初始化 git 仓库..."
        git init
        git add -A
        git commit -m "init: 项目初始化" --allow-empty
    fi
}

# ============ 辅助函数 ============

get_head() {
    cd "$PROJECT_ROOT"
    git rev-parse HEAD 2>/dev/null || echo "none"
}

all_tasks_done() {
    python3 -c "
import json, sys
try:
    with open('$TASKS_FILE') as f:
        data = json.load(f)
    features = data.get('features', [])
    if not features:
        print('false')
        sys.exit(0)
    all_done = all(f.get('status') == 'done' for f in features)
    print('true' if all_done else 'false')
except Exception:
    print('false')
" 2>/dev/null
}

get_task_stats() {
    python3 -c "
import json
try:
    with open('$TASKS_FILE') as f:
        data = json.load(f)
    features = data.get('features', [])
    total = len(features)
    done = sum(1 for f in features if f.get('status') == 'done')
    failed = sum(1 for f in features if f.get('status') == 'failed')
    in_prog = sum(1 for f in features if f.get('status') == 'in_progress')
    testing = sum(1 for f in features if f.get('status') == 'testing')
    pending = sum(1 for f in features if f.get('status') == 'pending')
    print(f'{done}/{total} done, {in_prog} in_progress, {testing} testing, {failed} failed, {pending} pending')
except Exception as e:
    print(f'无法读取: {e}')
" 2>/dev/null
}

# 检测项目根目录是否有代码文件（判断新旧项目）
has_code_files() {
    cd "$PROJECT_ROOT"
    # 检查常见的代码/项目标志文件
    local markers=(
        "package.json" "pyproject.toml" "requirements.txt" "setup.py"
        "Cargo.toml" "go.mod" "pom.xml" "build.gradle"
        "Makefile" "Dockerfile" "docker-compose.yml"
        "README.md" "main.py" "app.py" "index.js" "index.ts"
    )
    for marker in "${markers[@]}"; do
        if [ -f "$marker" ]; then
            return 0
        fi
    done
    # 检查是否有源代码目录
    for dir in src lib app backend frontend web server client; do
        if [ -d "$dir" ]; then
            return 0
        fi
    done
    return 1
}

rollback_to() {
    local target_head="$1"
    log_warn "回滚到 $target_head ..."
    cd "$PROJECT_ROOT"
    git reset --hard "$target_head"
    log_ok "回滚完成"

    # 记录失败到 progress.txt
    local timestamp
    timestamp=$(date "+%Y-%m-%d %H:%M")
    if [ -f "$PROGRESS_FILE" ]; then
        echo "" >> "$PROGRESS_FILE"
        echo "=== FAILED SESSION | $timestamp ===" >> "$PROGRESS_FILE"
        echo "- 结果：harness 校验失败，已自动回滚" >> "$PROGRESS_FILE"
        echo "- 回滚到: $target_head" >> "$PROGRESS_FILE"
    fi
}

# ============ 初始化阶段 ============

# 步骤 1: 项目扫描（生成 project_profile.json + init.sh）
run_scan() {
    local requirement="$1"

    if has_code_files; then
        log_info "检测到已有代码 → 旧项目模式（扫描现有项目）"
        local project_type="existing"
    else
        log_info "未检测到代码文件 → 新项目模式（从零创建）"
        local project_type="new"
    fi

    claude -p "
你是项目初始化 Agent。请严格按照 long_running_agent/CLAUDE.md 中的「项目扫描协议」执行。

项目类型: $project_type
用户需求: $requirement

执行步骤:
1. 阅读 long_running_agent/CLAUDE.md 了解完整的扫描协议和文件格式

2. 如果是旧项目 (existing):
   - 按照扫描清单检查项目文件
   - 生成 long_running_agent/project_profile.json（严格按照 CLAUDE.md 中的格式）
   - 基于扫描结果生成 long_running_agent/init.sh（严格按照 CLAUDE.md 中的 init.sh 生成规则）

3. 如果是新项目 (new):
   - 根据需求设计技术架构
   - 创建项目目录结构和基础文件
   - 生成 README.md
   - 然后执行旧项目的扫描流程生成 profile 和 init.sh

4. 将需求分解为具体功能点，生成 long_running_agent/tasks.json
   - 严格按照 CLAUDE.md 中定义的 tasks.json 格式
   - 所有任务初始 status 为 \"pending\"
   - 功能点要足够细粒度，每个功能应能在一个会话内完成
   - 设置合理的 priority（数字越小优先级越高）
   - 设置正确的 depends_on 依赖关系
   - 最后一个 step 必须包含验证方法（如何测试这个功能）

5. 创建 long_running_agent/progress.txt，记录本次初始化的摘要

6. 写入 long_running_agent/session_result.json

7. Git 提交: git add -A && git commit -m 'init: 项目扫描 + 任务分解'

关键要求:
- project_profile.json 中所有字段必须基于实际文件扫描，禁止猜测
- init.sh 必须幂等（已运行的服务不重复启动）
" --cwd "$PROJECT_ROOT"

    # 验证关键文件是否生成
    local success=true
    if [ ! -f "$PROFILE" ]; then
        log_error "project_profile.json 未生成"
        success=false
    fi
    if [ ! -f "$TASKS_FILE" ]; then
        log_error "tasks.json 未生成"
        success=false
    fi
    if [ ! -f "$SCRIPT_DIR/init.sh" ]; then
        log_warn "init.sh 未生成（Agent 可能判断无需启动服务）"
    else
        chmod +x "$SCRIPT_DIR/init.sh"
    fi

    if [ "$success" = false ]; then
        log_error "初始化失败：关键文件未生成"
        return 1
    fi

    log_ok "初始化完成"
    local stats
    stats=$(get_task_stats)
    log_info "任务统计: $stats"
}

# ============ 构建 MCP 工具提示 ============
build_mcp_hint() {
    local hint=""
    if [ "${MCP_PLAYWRIGHT:-false}" = "true" ]; then
        hint="你有 Playwright MCP 可用，可以用 browser_navigate、browser_snapshot、browser_click 等工具做 Web 端到端测试。对于前端功能，优先使用 Playwright MCP 进行浏览器验证。"
    fi
    echo "$hint"
}

# ============ 编码会话 ============
run_coding_session() {
    local session_num="$1"

    rm -f "$SESSION_RESULT"

    log_info "调用 Claude Code ..."

    # 构建可选的 MCP 工具提示
    local mcp_hint
    mcp_hint=$(build_mcp_hint)

    set +e
    claude -p "
按照 long_running_agent/CLAUDE.md 中定义的工作流程执行。这是 Session $session_num。

严格执行 6 步流程：
1. 恢复上下文（读取 project_profile.json、progress.txt、tasks.json、git log）
2. 环境与健康检查（运行 init.sh，检查服务）
3. 选择下一个任务（优先 failed，其次 pending；检查依赖）
4. 增量实现（一次只做一个功能）
5. 测试验证（端到端测试，按状态机更新 status）
6. 收尾（git commit + 更新 progress.txt + 写 session_result.json）
${mcp_hint:+
可用工具提示：
$mcp_hint}

特别注意：
- 你必须在结束前写入 long_running_agent/session_result.json
- 严格遵守状态机迁移规则，不得跳步
" --cwd "$PROJECT_ROOT"
    local claude_exit=$?
    set -e

    if [ $claude_exit -ne 0 ]; then
        log_warn "Claude Code 退出码: $claude_exit"
    fi

    return $claude_exit
}

# ============ 主流程 ============
main() {
    echo ""
    echo "============================================"
    echo "  Long-Running Agent Harness"
    echo "============================================"
    echo ""

    # 信号处理：Ctrl+C / kill 时优雅退出
    trap 'echo ""; log_warn "收到中断信号，正在安全退出..."; log_info "下次运行 bash long_running_agent/run.sh 即可恢复"; exit 130' INT TERM

    # 加载模型配置（如果存在）
    if [ -f "$SCRIPT_DIR/config.env" ]; then
        source "$SCRIPT_DIR/config.env"
        # 仅导出非空变量，避免覆盖已有环境
        [ -n "${ANTHROPIC_BASE_URL:-}" ] && export ANTHROPIC_BASE_URL
        [ -n "${ANTHROPIC_API_KEY:-}" ] && export ANTHROPIC_API_KEY
        [ -n "${API_TIMEOUT_MS:-}" ] && export API_TIMEOUT_MS
        [ -n "${MCP_TOOL_TIMEOUT:-}" ] && export MCP_TOOL_TIMEOUT
        log_ok "模型配置已加载: ${MODEL_PROVIDER:-unknown}"
    fi

    check_prerequisites

    local requirement="${1:-}"

    # ---------- 初始化阶段（带重试） ----------
    # 判断顺序: profile → tasks → 需要初始化
    if [ ! -f "$PROFILE" ] || [ ! -f "$TASKS_FILE" ]; then
        if [ -z "$requirement" ]; then
            log_error "首次运行需要提供需求描述"
            echo ""
            echo "用法: bash long_running_agent/run.sh \"你的需求描述\""
            exit 1
        fi

        local init_attempt=0
        local init_max=3
        while [ $init_attempt -lt $init_max ]; do
            init_attempt=$((init_attempt + 1))
            log_info "初始化尝试 $init_attempt / $init_max ..."

            set +e
            run_scan "$requirement"
            local scan_exit=$?
            set -e

            if [ -f "$PROFILE" ] && [ -f "$TASKS_FILE" ]; then
                break  # 关键文件已生成，初始化成功
            fi

            if [ $init_attempt -lt $init_max ]; then
                log_warn "初始化未完成，将重试..."
            fi
        done

        # 重试完仍然失败才退出
        if [ ! -f "$PROFILE" ] || [ ! -f "$TASKS_FILE" ]; then
            log_error "初始化失败：已重试 $init_max 次，关键文件仍未生成"
            log_info "请检查 Agent 输出，手动排查问题后重新运行"
            exit 1
        fi
    else
        log_ok "检测到已有 project_profile.json + tasks.json，跳过初始化"
        local stats
        stats=$(get_task_stats)
        log_info "当前进度: $stats"
    fi

    # ---------- 编码循环 ----------
    log_info "开始编码循环 (最多 $MAX_SESSIONS 个会话) ..."
    echo ""

    local session=0
    local consecutive_failures=0

    while [ $session -lt $MAX_SESSIONS ]; do
        session=$((session + 1))

        echo ""
        echo "--------------------------------------------"
        log_info "Session $session / $MAX_SESSIONS"
        echo "--------------------------------------------"

        # 检查是否所有任务已完成
        if [ "$(all_tasks_done)" = "true" ]; then
            echo ""
            log_ok "所有任务已完成！"
            local stats
            stats=$(get_task_stats)
            log_info "最终统计: $stats"
            break
        fi

        # 显示当前进度
        local stats
        stats=$(get_task_stats)
        log_info "进度: $stats"

        # 记录 session 前的 HEAD
        local head_before
        head_before=$(get_head)

        # ---------- 执行编码会话 ----------
        run_coding_session "$session"

        # ---------- Harness 校验 (调用 validate.sh) ----------
        log_info "开始 harness 校验 ..."

        set +e
        bash "$VALIDATE_SH" "$head_before"
        local validate_exit=$?
        set -e

        # ---------- 根据校验结果决定 ----------
        if [ $validate_exit -eq 0 ]; then
            log_ok "Session $session 校验通过"
            consecutive_failures=0
            rm -f "$SESSION_RESULT"
        else
            # validate_exit=1 表示致命失败，需要回滚
            consecutive_failures=$((consecutive_failures + 1))
            log_error "Session $session 校验失败 (连续失败: $consecutive_failures/$MAX_RETRY)"

            rollback_to "$head_before"

            if [ $consecutive_failures -ge $MAX_RETRY ]; then
                log_error "连续失败 $MAX_RETRY 次，跳过当前任务"

                # 标记当前 in_progress 任务为 failed
                python3 -c "
import json
try:
    with open('$TASKS_FILE', 'r') as f:
        data = json.load(f)
    for feat in data['features']:
        if feat.get('status') == 'in_progress':
            feat['status'] = 'failed'
            break
    with open('$TASKS_FILE', 'w') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
except Exception:
    pass
" 2>/dev/null || true

                consecutive_failures=0
                log_warn "已将任务标记为 failed，继续下一个任务"
            fi
        fi

        # ---------- 定期暂停确认 ----------
        if [ $((session % PAUSE_EVERY)) -eq 0 ]; then
            echo ""
            local stats
            stats=$(get_task_stats)
            log_info "已完成 $session 个会话 | $stats"

            if [ -t 0 ]; then
                read -p "是否继续？(y/n) " -n 1 -r
                echo
                if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                    log_info "手动停止"
                    break
                fi
            fi
        fi
    done

    # ---------- 最终报告 ----------
    echo ""
    echo "============================================"
    echo "  运行结束"
    echo "============================================"
    echo ""
    log_info "共执行 $session 个会话"
    local final_stats
    final_stats=$(get_task_stats)
    log_info "最终进度: $final_stats"
    echo ""

    if [ $session -ge $MAX_SESSIONS ]; then
        log_warn "已达到最大会话数 ($MAX_SESSIONS)，仍有未完成任务"
        log_info "继续运行: bash long_running_agent/run.sh"
    fi

    log_info "查看进度: cat $PROGRESS_FILE"
    log_info "查看任务: cat $TASKS_FILE"
    log_info "查看项目: cat $PROFILE"
}

# ============ 入口 ============
main "$@"
