# 发包指南

## 前置条件

1. npm 账号（[npmjs.com](https://www.npmjs.com/) 注册）
2. 已登录 npm CLI：
   ```bash
   npm login
   npm whoami   # 确认已登录
   ```
3. GitHub 仓库已推送最新代码

## 发包步骤

### 1. 确认版本号

```bash
# 查看当前版本
node -e "console.log(require('./package.json').version)"

# 升版本（选一个）
npm version patch   # 1.0.0 → 1.0.1（Bug 修复）
npm version minor   # 1.0.0 → 1.1.0（新功能）
npm version major   # 1.0.0 → 2.0.0（不兼容变更）
```

### 2. 检查发包内容

```bash
# 预览将发布的文件列表
npm pack --dry-run

# 应包含：
#   bin/cli.js
#   src/*.js (10 个模块)
#   prompts/CLAUDE.md, SCAN_PROTOCOL.md, ADD_GUIDE.md
#   prompts/coding_user.md, scan_user.md, add_user.md
#   templates/test_rule.md, requirements.example.md
#   docs/ARCHITECTURE.md
#   docs/README.en.md
#   package.json
#   README.md
```

### 3. 语法检查

```bash
node -c bin/cli.js && \
node -c src/config.js && \
node -c src/tasks.js && \
node -c src/indicator.js && \
node -c src/validator.js && \
node -c src/scanner.js && \
node -c src/session.js && \
node -c src/runner.js && \
node -c src/setup.js && \
node -c src/prompts.js && \
node -c src/init.js && \
echo "All OK"
```

### 4. 本地测试

```bash
# 全局链接本地包
npm link

# 在测试项目中验证
cd /tmp && mkdir test-project && cd test-project
claude-coder --help        # 应显示帮助信息
claude-coder --version     # 应显示版本号
claude-coder setup         # 应进入交互式配置
claude-coder status        # 应提示未初始化

# 清理
npm unlink -g claude-coder
rm -rf /tmp/test-project
```

### 5. 发布

```bash
# 首次发布
npm publish

# 后续更新
npm version patch && npm publish
```

### 6. 验证

```bash
# 等待几分钟后
npm info claude-coder

# 全局安装测试
npm install -g claude-coder
claude-coder --version
```

## 发布检查清单

- [ ] `package.json` 的 `version` 已更新
- [ ] `package.json` 的 `author` 和 `repository` 正确
- [ ] `npm pack --dry-run` 只包含必要文件
- [ ] 所有 `.js` 文件语法检查通过
- [ ] `claude-coder --help` 正常显示
- [ ] `claude-coder setup` 交互式配置正常
- [ ] `claude-coder status` 正常运行（无 crash）
- [ ] README.md 和 docs/README.en.md 内容最新
- [ ] git 已提交并推送

## 包结构

```
claude-coder/
  package.json          # name: "claude-coder", bin: "claude-coder"
  README.md             # npm 页面展示的主文档
  bin/
    cli.js              # CLI 入口（#!/usr/bin/env node）
  src/
    config.js           # 配置管理
    runner.js           # 主循环
    session.js          # SDK 交互
    prompts.js          # 提示语构建
    init.js             # 环境初始化
    scanner.js          # 初始化扫描
    validator.js        # 校验引擎
    tasks.js            # 任务管理
    indicator.js        # 进度指示
    setup.js            # 交互式配置
    auth.js             # Playwright 凭证
    hooks.js            # Hook 工厂
  prompts/
    CLAUDE.md           # Agent 协议
    SCAN_PROTOCOL.md    # 扫描协议
    ADD_GUIDE.md        # 任务分解指南
    coding_user.md      # 编码 prompt 模板
    scan_user.md        # 扫描 prompt 模板
    add_user.md         # ADD prompt 模板
  templates/
    test_rule.md        # Playwright 测试规则
    requirements.example.md
  docs/
    ARCHITECTURE.md     # 架构文档
    README.en.md        # English README
```

## peerDependency 说明

`@anthropic-ai/claude-agent-sdk` 声明为 peerDependency 而非 dependency，原因：
- SDK 体积大，全局只需一份
- 用户可能已安装不同版本
- 减小包体积，保持零 dependency

用户安装流程：
```bash
npm install -g @anthropic-ai/claude-agent-sdk  # 前置
npm install -g claude-coder                # 本包
```

## 版本策略

| 变更类型 | 版本号 | 示例 |
|----------|--------|------|
| Bug 修复、提示语优化 | patch | 1.0.1 |
| 新命令、新提供商支持 | minor | 1.1.0 |
| Agent 协议变更、API 不兼容 | major | 2.0.0 |
