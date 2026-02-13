#!/bin/bash
# ============================================================
# Claude Auto Loop 前置配置
#
# 用法: bash claude-auto-loop/setup.sh
#
# 交互式配置：
#   1. 模型提供商（Claude 官方 / GLM / 自定义）
#   2. MCP 工具（Playwright 浏览器自动化等）
#
# 配置保存到 claude-auto-loop/config.env。
# run.sh 启动时自动加载此文件。
#
# config.env 包含 API Key，不应提交到 git。
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CONFIG_FILE="$SCRIPT_DIR/config.env"

# ============ 颜色输出 ============
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC}  $1"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }

# ============ 主流程 ============
main() {
    echo ""
    echo "============================================"
    echo "  Claude Auto Loop 前置配置"
    echo "============================================"
    echo ""
    echo "  第一步: 模型提供商配置"
    echo "  第二步: MCP 工具配置（可选）"
    echo ""

    # 检测已有配置
    if [ -f "$CONFIG_FILE" ]; then
        log_warn "检测到已有配置文件: $CONFIG_FILE"
        source "$CONFIG_FILE"
        echo "  当前模型提供商: ${MODEL_PROVIDER:-未知}"
        echo "  当前 BASE_URL: ${ANTHROPIC_BASE_URL:-默认}"
        echo "  Playwright MCP: ${MCP_PLAYWRIGHT:-未配置}"
        echo ""
        read -p "是否重新配置？(y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "保留现有配置，退出"
            exit 0
        fi
        echo ""
    fi

    # 选择提供商
    echo "请选择模型提供商:"
    echo ""
    echo "  1) Claude 官方"
    echo "     需要 Anthropic API Key 或 Claude Pro/Max 订阅"
    echo "     质量最高，成本较高"
    echo ""
    echo "  2) GLM 4.7 via 智谱开放平台 (open.bigmodel.cn)"
    echo "     国内直连，成本低"
    echo ""
    echo "  3) GLM 4.7 via Z.AI 平台 (api.z.ai)"
    echo "     海外节点，成本低"
    echo ""
    echo "  4) 自定义"
    echo "     手动填写 Anthropic 兼容的 BASE_URL 和 API Key"
    echo ""

    local choice
    while true; do
        read -p "选择 [1-4]: " choice
        case $choice in
            1|2|3|4) break ;;
            *) echo "请输入 1-4" ;;
        esac
    done

    echo ""

    case $choice in
        1)
            # Claude 官方
            write_claude_config
            ;;
        2)
            # GLM via 智谱
            local api_key
            api_key=$(read_api_key "智谱开放平台")
            write_glm_config "glm-bigmodel" \
                "https://open.bigmodel.cn/api/anthropic" \
                "$api_key"
            ;;
        3)
            # GLM via Z.AI
            local api_key
            api_key=$(read_api_key "Z.AI 平台")
            write_glm_config "glm-zai" \
                "https://api.z.ai/api/anthropic" \
                "$api_key"
            ;;
        4)
            # 自定义
            local base_url api_key
            echo "请输入 Anthropic 兼容的 BASE_URL:"
            read -p "  URL: " base_url
            echo ""
            api_key=$(read_api_key "自定义平台")
            write_custom_config "$base_url" "$api_key"
            ;;
    esac

    # === 第二步：MCP 工具配置 ===
    echo ""
    echo "============================================"
    echo "  MCP 工具配置（可选）"
    echo "============================================"
    echo ""

    configure_mcp_tools

    # 确保 config.env 不被提交到 git
    ensure_gitignore

    echo ""
    log_ok "配置完成！"
    echo ""
    echo "  配置文件: $CONFIG_FILE"
    echo "  使用方式: bash claude-auto-loop/run.sh \"你的需求\""
    echo "  详细需求: cp claude-auto-loop/requirements.example.md requirements.md && vim requirements.md"
    echo "  重新配置: bash claude-auto-loop/setup.sh"
    echo ""
}

# ============ 读取 API Key ============
read_api_key() {
    local platform="$1"
    echo "请输入 $platform 的 API Key:"
    local key
    read -p "  API Key: " key
    if [ -z "$key" ]; then
        echo "API Key 不能为空" >&2
        exit 1
    fi
    echo "$key"
}

# ============ 写入配置文件 ============

write_claude_config() {
    cat > "$CONFIG_FILE" << 'EOF'
# Claude Auto Loop 模型配置
# 由 setup.sh 生成，请勿提交到 git（包含 API Key）
#
# 提供商: Claude 官方
# 使用默认 Claude API，无需额外环境变量

MODEL_PROVIDER=claude
EOF
    log_ok "已配置为 Claude 官方模型"
}

write_glm_config() {
    local provider="$1"
    local base_url="$2"
    local api_key="$3"

    cat > "$CONFIG_FILE" << EOF
# Claude Auto Loop 模型配置
# 由 setup.sh 生成，请勿提交到 git（包含 API Key）
#
# 提供商: GLM ($provider)

MODEL_PROVIDER=$provider
ANTHROPIC_BASE_URL=$base_url
ANTHROPIC_API_KEY=$api_key
API_TIMEOUT_MS=3000000
MCP_TOOL_TIMEOUT=30000
EOF
    log_ok "已配置为 GLM 模型 ($provider)"
    log_info "BASE_URL: $base_url"
}

write_custom_config() {
    local base_url="$1"
    local api_key="$2"

    cat > "$CONFIG_FILE" << EOF
# Claude Auto Loop 模型配置
# 由 setup.sh 生成，请勿提交到 git（包含 API Key）
#
# 提供商: 自定义

MODEL_PROVIDER=custom
ANTHROPIC_BASE_URL=$base_url
ANTHROPIC_API_KEY=$api_key
API_TIMEOUT_MS=3000000
MCP_TOOL_TIMEOUT=30000
EOF
    log_ok "已配置为自定义模型"
    log_info "BASE_URL: $base_url"
}

# ============ MCP 工具配置 ============
configure_mcp_tools() {
    echo "是否安装 Playwright MCP（浏览器自动化测试）？"
    echo ""
    echo "  Playwright MCP 由微软官方维护 (github.com/microsoft/playwright-mcp)"
    echo "  提供 browser_click、browser_snapshot 等 25+ 浏览器自动化工具"
    echo "  适用于有 Web 前端的项目，Agent 可用它做端到端测试"
    echo ""
    echo "  1) 是 - 安装 Playwright MCP（项目有 Web 前端）"
    echo "  2) 否 - 跳过（纯后端 / CLI 项目，不需要浏览器测试）"
    echo ""

    local mcp_choice
    while true; do
        read -p "选择 [1-2]: " mcp_choice
        case $mcp_choice in
            1|2) break ;;
            *) echo "请输入 1 或 2" ;;
        esac
    done

    if [ "$mcp_choice" = "1" ]; then
        # 将 MCP 配置追加到 config.env
        echo "" >> "$CONFIG_FILE"
        echo "# MCP 工具配置" >> "$CONFIG_FILE"
        echo "MCP_PLAYWRIGHT=true" >> "$CONFIG_FILE"

        # 尝试为 Claude CLI 安装 Playwright MCP
        if command -v claude &> /dev/null; then
            log_info "为 Claude Code CLI 安装 Playwright MCP ..."
            if claude mcp add playwright npx @playwright/mcp@latest 2>/dev/null; then
                log_ok "Playwright MCP 已添加到 Claude Code"
            else
                log_warn "自动安装失败，请手动执行:"
                log_warn "  claude mcp add playwright npx @playwright/mcp@latest"
            fi
        else
            log_info "未检测到 claude CLI，跳过自动安装"
        fi

        echo ""
        log_info "如果你使用 Cursor IDE，还需要在 Cursor 中手动添加:"
        log_info "  Cursor Settings → MCP → Add new MCP Server"
        log_info "  Name: playwright"
        log_info "  Command: npx @playwright/mcp@latest"

        log_ok "Playwright MCP 配置完成"
    else
        # 记录未启用
        echo "" >> "$CONFIG_FILE"
        echo "# MCP 工具配置" >> "$CONFIG_FILE"
        echo "MCP_PLAYWRIGHT=false" >> "$CONFIG_FILE"

        log_info "已跳过 Playwright MCP 安装"
    fi
}

# ============ 确保 .gitignore 包含 config.env ============
ensure_gitignore() {
    local gitignore="$PROJECT_ROOT/.gitignore"

    # 检查 config.env 是否已在 .gitignore 中
    if [ -f "$gitignore" ]; then
        if grep -q "claude-auto-loop/config.env" "$gitignore" 2>/dev/null; then
            return  # 已存在，无需添加
        fi
    fi

    # 追加到 .gitignore
    echo "" >> "$gitignore"
    echo "# Claude Auto Loop 模型配置（含 API Key）" >> "$gitignore"
    echo "claude-auto-loop/config.env" >> "$gitignore"
    log_info "已将 config.env 添加到 .gitignore"
}

# ============ 入口 ============
main
