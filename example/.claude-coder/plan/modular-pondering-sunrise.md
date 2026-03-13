# Claude Coder 官网优化计划

## Context

用户提出了多项优化需求，包括：
1. GitHub 链接更新为 `https://github.com/lk19940215/claude-coder`
2. 修复重复 Footer 问题
3. 修复深色模式下文字不显眼的问题
4. 添加示例仓库链接 `https://github.com/lk19940215/ai-teaching-ppt`
5. 改进动画、配色、文案，增加"摸鱼神器"等特色风格
6. 编写详细的测试用例

---

## 问题分析

### 1. GitHub 链接问题
发现以下位置使用了占位符链接 `https://github.com`：
- `src/components/common/Header.tsx:50`
- `src/components/common/Footer.tsx:7`
- `src/components/home/HeroSection.tsx:26`

### 2. 重复 Footer 问题
**根本原因**：架构设计不一致
- `App.tsx` 作为布局组件，已包含 `<Header />` 和 `<Footer />`
- 各页面组件（Home.tsx, Examples.tsx 等）又重复添加了 Header 和 Footer

**影响**：每个页面渲染两个 Footer，视觉上出现重复

### 3. 文字颜色问题
当前 CSS 变量定义正确，但需要检查是否有地方未使用变量。主要关注：
- 深色背景上使用深色文字的元素
- 缺少足够对比度的地方

### 4. 示例仓库缺失
需要在 Examples 页面或首页添加真实的使用案例链接

### 5. 文案和设计改进需求
- 增加"摸鱼神器"主题
- 增加"拥抱AI享受摸鱼人生"标语
- 优化动画效果和配色方案

---

## 实施计划

### Phase 1: GitHub 链接更新

**修改文件**：
1. `src/components/common/Header.tsx` - 第50行
2. `src/components/common/Footer.tsx` - 第7行 quickLinks 数组
3. `src/components/home/HeroSection.tsx` - 第26行

**修改内容**：
```typescript
// 将 'https://github.com' 替换为 'https://github.com/lk19940215/claude-coder'
```

---

### Phase 2: 修复重复 Footer

**修改策略**：从各页面组件中移除 Header 和 Footer，统一由 App.tsx 管理

**需要修改的文件**：
1. `src/pages/Home.tsx` - 移除 Header 和 Footer 导入及使用
2. `src/pages/Examples.tsx` - 移除 Header 和 Footer 导入及使用
3. `src/pages/Docs.tsx` - 移除 Header 和 Footer 导入及使用
4. `src/pages/QuickStart.tsx` - 移除 Header 和 Footer 导入及使用
5. `src/pages/Features.tsx` - 移除 Header 和 Footer 导入及使用

**修改示例** (以 Home.tsx 为例)：
```tsx
// 修改前
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
...
return (
  <div className="min-h-screen hero-bg">
    <Header />
    <main>...</main>
    <Footer />
  </div>
);

// 修改后
...
return (
  <div className="min-h-screen hero-bg">
    <main>...</main>
  </div>
);
```

---

### Phase 3: 深色模式文字颜色优化

**修改文件**：`src/assets/styles/global.css`

**优化内容**：
1. 增强 hero-bg 背景效果，添加更明显的渐变
2. 添加新的文字强调类，提高可读性
3. 检查并修复任何硬编码颜色

**新增 CSS 规则**：
```css
/* 高亮文字效果 */
.text-glow {
  text-shadow: 0 0 20px rgba(139, 92, 246, 0.5);
}

/* 强调标题 */
.highlight-title {
  background: linear-gradient(135deg, var(--gradient-start), var(--gradient-end));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

---

### Phase 4: 添加示例仓库

**修改文件**：`src/pages/Examples.tsx`

**添加新示例**：
```typescript
{
  id: '5',
  title: 'AI 教学 PPT 生成器',
  description: '使用 Claude Coder 自动生成的 AI 教学 PPT 工具项目',
  command: 'claude-coder run "创建AI教学PPT生成工具"',
  result: '完整的PPT生成应用',
  repo: 'https://github.com/lk19940215/ai-teaching-ppt',
}
```

**同时修改卡片组件**：添加 GitHub 仓库链接按钮

---

### Phase 5: 文案和设计改进

#### 5.1 HeroSection 文案更新

**修改文件**：`src/components/home/HeroSection.tsx`

**新文案**：
```tsx
// 主标题保持 Claude Coder
// 副标题改为：
"摸鱼神器 - 拥抱AI，享受摸鱼人生"

// 描述文案：
"一句话需求 → 完整项目。让 AI 帮你加班，你负责摸鱼。长时间自运行，自动分解任务、持续编码、验证交付。"
```

#### 5.2 统计数据优化

```tsx
<div className="text-3xl font-bold text-[var(--text-50)]">24/7</div>
<div className="text-[var(--text-400)] text-sm">AI 加班，你摸鱼</div>
```

#### 5.3 动画增强

**修改文件**：`src/assets/styles/global.css`

**新增动画**：
```css
/* 渐入动画 */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in-up {
  animation: fadeInUp 0.6s ease-out forwards;
}

/* 闪烁光标 */
@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

.cursor-blink {
  animation: blink 1s infinite;
}

/* 渐变流动 */
@keyframes gradientFlow {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

.gradient-flow {
  background-size: 200% 200%;
  animation: gradientFlow 3s ease infinite;
}
```

#### 5.4 配色优化

**新增强调色**：
```css
:root {
  /* 新增摸鱼金 - 用于强调 */
  --fish-gold: #fbbf24;
  /* 新增懒人青 - 用于次要强调 */
  --lazy-cyan: #22d3d1;
}
```

---

### Phase 6: 测试用例编写

**参考**：`.claude-coder/assets/test_rule.md`

**测试文件位置**：`.claude-coder/tests.json`

#### 6.1 Happy Path 测试

| 测试ID | 测试场景 | 测试步骤 |
|--------|---------|---------|
| HP-001 | 首页加载 | 1. 访问 `http://localhost:5173/` <br> 2. 验证标题 "Claude Coder" 显示 <br> 3. 验证 "摸鱼神器" 文案显示 <br> 4. 验证 GitHub 链接正确指向 `lk19940215/claude-coder` |
| HP-002 | 功能特性页面 | 1. 点击导航 "功能特性" <br> 2. 验证页面标题显示 <br> 3. 验证 6 个特性卡片渲染 |
| HP-003 | 案例页面 | 1. 点击导航 "案例" <br> 2. 验证 AI 教学 PPT 示例显示 <br> 3. 验证 GitHub 仓库链接可点击 |
| HP-004 | 快速上手页面 | 1. 点击 "开始使用" 按钮 <br> 2. 验证跳转到快速上手页面 <br> 3. 验证安装步骤显示 |
| HP-005 | 导航功能 | 1. 点击各个导航链接 <br> 2. 验证 URL 变化正确 <br> 3. 验证页面内容切换 |
| HP-006 | Footer 单一性 | 1. 访问任意页面 <br> 2. 验证页面只有一个 Footer 元素 |
| HP-007 | 深色模式文字 | 1. 访问首页 <br> 2. 验证所有文字在深色背景下清晰可见 <br> 3. 验证对比度符合 WCAG AA 标准 |

#### 6.2 Unhappy Path 测试

| 测试ID | 测试场景 | 测试步骤 |
|--------|---------|---------|
| UP-001 | 无效路由 | 1. 访问 `/invalid-route` <br> 2. 验证 404 或重定向处理 |
| UP-002 | 外部链接 | 1. 点击 GitHub 链接 <br> 2. 验证新标签页打开 <br> 3. 验证 rel="noopener noreferrer" |

#### 6.3 探索性测试

| 测试ID | 测试场景 | 关注点 |
|--------|---------|--------|
| ET-001 | 响应式布局 | 在不同屏幕尺寸下验证布局适应性 |
| ET-002 | 动画流畅度 | 验证动画效果流畅，无明显卡顿 |
| ET-003 | 链接有效性 | 验证所有外部链接可访问 |

#### 6.4 tests.json 更新

```json
{
  "feature_claude_coder_website": {
    "tests": [
      {
        "test_id": "HP-001",
        "name": "首页加载验证",
        "priority": "P0",
        "steps": [
          "【规则】阅读 .claude-coder/assets/test_rule.md",
          "【环境】启动开发服务器 npm run dev，确认 http://localhost:5173 可访问",
          "【P0】browser_navigate 到 http://localhost:5173/",
          "【P0】browser_snapshot 确认页面加载",
          "【P0】验证标题 'Claude Coder' 存在",
          "【P0】验证 '摸鱼神器' 文案存在",
          "【P0】验证 GitHub 链接 href 包含 'lk19940215/claude-coder'"
        ],
        "expected_result": "页面正确加载，所有关键元素显示"
      },
      {
        "test_id": "HP-006",
        "name": "Footer单一性验证",
        "priority": "P0",
        "steps": [
          "【P0】browser_navigate 到 http://localhost:5173/",
          "【P0】browser_snapshot 获取页面快照",
          "【P0】验证页面上 footer 元素只出现一次"
        ],
        "expected_result": "页面只渲染一个 Footer"
      }
    ]
  }
}
```

---

## 关键文件清单

| 文件路径 | 修改类型 |
|---------|---------|
| `src/components/common/Header.tsx` | GitHub 链接更新 |
| `src/components/common/Footer.tsx` | GitHub 链接更新 |
| `src/components/home/HeroSection.tsx` | GitHub 链接 + 文案更新 |
| `src/pages/Home.tsx` | 移除重复 Header/Footer |
| `src/pages/Examples.tsx` | 移除重复 + 添加示例仓库 |
| `src/pages/Docs.tsx` | 移除重复 Header/Footer |
| `src/pages/QuickStart.tsx` | 移除重复 Header/Footer |
| `src/pages/Features.tsx` | 移除重复 Header/Footer |
| `src/assets/styles/global.css` | 动画 + 配色优化 |
| `.claude-coder/tests.json` | 测试用例添加 |

---

## 验证方式

### 本地验证步骤

1. **启动开发服务器**
   ```bash
   cd example
   npm run dev
   ```

2. **检查 GitHub 链接**
   - 打开浏览器开发者工具
   - 搜索页面中的 GitHub 链接
   - 验证所有链接指向 `https://github.com/lk19940215/claude-coder`

3. **检查 Footer 重复**
   - 访问各个页面
   - 使用开发者工具检查 footer 元素数量
   - 应该只有一个 footer

4. **检查文字可读性**
   - 在深色模式下浏览所有页面
   - 确认所有文字清晰可见
   - 使用对比度检查工具验证 WCAG AA 标准

5. **检查新功能**
   - 验证 AI 教学 PPT 示例显示
   - 验证动画效果流畅
   - 验证新文案显示正确

### 自动化测试验证

```bash
# 运行 Playwright 测试
npm run test
```

---

## 预估工作量

| 任务 | 预估时间 |
|-----|---------|
| Phase 1: GitHub 链接更新 | 5 分钟 |
| Phase 2: 修复重复 Footer | 15 分钟 |
| Phase 3: 文字颜色优化 | 10 分钟 |
| Phase 4: 添加示例仓库 | 10 分钟 |
| Phase 5: 文案和设计改进 | 20 分钟 |
| Phase 6: 测试用例编写 | 15 分钟 |
| **总计** | **约 75 分钟** |