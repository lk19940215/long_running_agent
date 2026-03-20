import React, { useState, useCallback } from 'react';
import PageLayout from '../components/layout/PageLayout';
import SectionCard from '../components/ui/SectionCard';
import EnhancedCodeBlock from '../components/ui/EnhancedCodeBlock';
import FishStepCard from '../components/ui/FishStepCard';
import MobileSidebar from '../components/ui/MobileSidebar';
import SidebarNav from '../components/ui/SidebarNav';
import { useMobileSidebar } from '../hooks/useMobileSidebar';
import { scrollToElement } from '../utils';

const sections = [
  { id: 'overview', title: '概述' },
  { id: 'pencil-setup', title: 'Pencil 安装' },
  { id: 'usage', title: '命令使用' },
  { id: 'design-map', title: 'design_map.json' },
  { id: 'faq', title: '常见问题' },
];

const Design: React.FC = () => {
  const [activeSection, setActiveSection] = useState('overview');
  const { isOpen, toggle, close } = useMobileSidebar();

  const handleNavClick = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setActiveSection(id);
    scrollToElement(id);
    close();
  }, [close]);

  return (
    <PageLayout>
      <MobileSidebar isOpen={isOpen} onClose={close} onToggle={toggle} title="导航">
        <SidebarNav items={sections} activeId={activeSection} onItemClick={handleNavClick} />
      </MobileSidebar>

      <div className="mb-8">
        <h1 className="text-heading-1 text-[var(--text-50)] mb-4">设计工具 (Design)</h1>
        <p className="text-body text-[var(--text-400)]">
          使用自然语言生成 Pencil UI 设计稿，实现「需求 → 原型 → 编码」全流程
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <aside className="hidden lg:block lg:col-span-1">
          <div className="sticky top-24">
            <div className="card p-4">
              <h3 className="text-caption text-[var(--text-400)] uppercase tracking-wider mb-4">目录导航</h3>
              <SidebarNav items={sections} activeId={activeSection} onItemClick={handleNavClick} />
            </div>
          </div>
        </aside>

        <div className="lg:col-span-3 space-y-8">

          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 mb-8">
            <p className="text-sm text-yellow-200">
              <strong>⚠️ Windows 已知限制</strong>：<code className="text-yellow-300">.pen</code> 文件的跨文件组件引用（<code className="text-yellow-300">ref: "sys:header"</code>）在 Windows 的 Pencil 插件中不受支持（Pencil应用也不支持）。Mac 桌面应用、插件均正常预览。建议在 Mac 上使用 design 命令生成和预览设计稿。跨文件变量引用（<code className="text-yellow-300">$sys:color.bg</code>）和同文件内组件引用在所有平台均可用。
            </p>
          </div>

          <SectionCard id="overview" variant="default" className="card-hover-enhanced">
            <h2 className="text-heading-2 text-[var(--text-50)] mb-6">概述</h2>
            <p className="text-body text-[var(--text-200)] mb-4">
              <code className="text-[var(--lazy-cyan)]">design</code> 命令让 AI 扮演资深 UI 设计师，将自然语言翻译为
              <code className="text-[var(--lazy-cyan)]">.pen</code> 设计文件（Pencil 格式）。
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-300)]">
                    <th className="text-left py-3 px-4 text-[var(--text-400)] font-medium">类型</th>
                    <th className="text-left py-3 px-4 text-[var(--text-400)] font-medium">说明</th>
                    <th className="text-left py-3 px-4 text-[var(--text-400)] font-medium">触发条件</th>
                  </tr>
                </thead>
                <tbody className="text-[var(--text-200)]">
                  {[
                    ['init', '首次初始化设计库 + 页面', '无 system.lib.pen 时自动触发'],
                    ['new', '新增/修改页面', '已有 system.lib.pen'],
                    ['fix', '修复 .pen 文件格式问题', '--type fix 手动触发'],
                  ].map(([type, desc, trigger], i) => (
                    <tr key={i} className="border-b border-[var(--border-300)]/50 hover:bg-[var(--bg-100)]/50 transition-colors">
                      <td className="py-3 px-4 font-mono text-[var(--primary-400)]">{type}</td>
                      <td className="py-3 px-4">{desc}</td>
                      <td className="py-3 px-4 text-[var(--text-400)]">{trigger}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard id="pencil-setup" variant="primary" className="card-hover-enhanced">
            <h2 className="text-heading-2 text-[var(--text-50)] mb-2">Pencil 安装与配置</h2>
            <p className="text-body text-[var(--text-400)] mb-6">
              Pencil 是基于 JSON 的 UI 设计工具，支持 IDE 插件和桌面应用
            </p>

            <div className="space-y-6">
              <FishStepCard stepNumber={1} title="安装 Pencil 插件" staggerIndex={1}>
                <p className="text-sm text-[var(--text-200)] mb-3">
                  在 VS Code / Cursor 扩展市场搜索 <strong>Pencil</strong> 并安装。
                  安装后可直接在 IDE 中打开 <code className="text-[var(--lazy-cyan)]">.pen</code> 文件进行预览。
                </p>
              </FishStepCard>

              <FishStepCard stepNumber={2} title="确认 Library 文件" staggerIndex={2}>
                <p className="text-sm text-[var(--text-200)] mb-3">
                  打开 <code className="text-[var(--lazy-cyan)]">system.lib.pen</code> 后，顶部应显示：
                </p>
                <div className="rounded-lg bg-[var(--bg-200)] p-3 text-sm text-[var(--text-200)] border border-[var(--border-300)]">
                  "This file is a library."
                </div>
                <p className="text-sm text-[var(--text-400)] mt-2">
                  如果未显示此提示，右键文件选择 "Turn this file into a library"。
                  <code className="text-[var(--lazy-cyan)]">.lib.pen</code> 后缀会让 Pencil 自动识别为设计库。
                </p>
              </FishStepCard>

              <FishStepCard stepNumber={3} title="关联 Library" staggerIndex={3}>
                <p className="text-sm text-[var(--text-200)] mb-3">
                  打开页面文件（如 <code className="text-[var(--lazy-cyan)]">pages/home.pen</code>），
                  在 Libraries 面板中导入 <code className="text-[var(--lazy-cyan)]">system.lib.pen</code>。
                  页面中引用的组件和变量才能正确渲染。
                </p>
              </FishStepCard>
            </div>
          </SectionCard>

          <SectionCard id="usage" variant="default" className="card-hover-enhanced">
            <h2 className="text-heading-2 text-[var(--text-50)] mb-6">命令使用</h2>

            <div className="space-y-6">
              <div>
                <h3 className="text-heading-3 text-[var(--text-50)] mb-3">初始化设计（自动模式）</h3>
                <EnhancedCodeBlock language="bash" title="还原已有页面">{`claude-coder design "还原首页设计" --model glm-5`}</EnhancedCodeBlock>
                <p className="text-sm text-[var(--text-400)] mt-2">
                  AI 会扫描项目代码，提取真实文案和布局，生成对应的 .pen 设计稿。
                </p>
              </div>

              <div>
                <h3 className="text-heading-3 text-[var(--text-50)] mb-3">对话模式</h3>
                <EnhancedCodeBlock language="bash" title="交互式设计">{`claude-coder design
# AI 通过提问引导你描述需求，适合新项目从零设计`}</EnhancedCodeBlock>
              </div>

              <div>
                <h3 className="text-heading-3 text-[var(--text-50)] mb-3">迭代调整</h3>
                <EnhancedCodeBlock language="bash" title="修改已有设计">{`claude-coder design "把导航栏改为暗色主题"
claude-coder design "增加一个登录弹窗"`}</EnhancedCodeBlock>
              </div>

              <div>
                <h3 className="text-heading-3 text-[var(--text-50)] mb-3">修复文件</h3>
                <EnhancedCodeBlock language="bash" title="修复格式问题">{`claude-coder design --type fix
# 检查并修复所有 .pen 文件的格式问题`}</EnhancedCodeBlock>
              </div>
            </div>
          </SectionCard>

          <SectionCard id="design-map" variant="default" className="card-hover-enhanced">
            <h2 className="text-heading-2 text-[var(--text-50)] mb-4">design_map.json</h2>
            <p className="text-body text-[var(--text-200)] mb-4">
              设计索引文件，AI 自动维护。<code className="text-[var(--lazy-cyan)]">plan</code> 和
              <code className="text-[var(--lazy-cyan)]"> coding</code> 命令会自动读取此文件，
              在涉及 UI 的任务中引导 AI 参考设计稿。
            </p>
            <EnhancedCodeBlock language="json" title=".claude-coder/design/design_map.json">{`{
  "version": 1,
  "designSystem": "system.lib.pen",
  "pages": {
    "home": { "pen": "pages/home.pen", "description": "首页" },
    "login": { "pen": "pages/login.pen", "description": "登录页" }
  }
}`}</EnhancedCodeBlock>

            <h3 className="text-heading-3 text-[var(--text-50)] mt-6 mb-3">文件结构</h3>
            <EnhancedCodeBlock language="text" title="目录结构">{`.claude-coder/design/
├── system.lib.pen          # 设计库（颜色、组件）
├── design_map.json         # 设计索引
└── pages/
    ├── home.pen            # 首页设计稿
    └── login.pen           # 登录页设计稿`}</EnhancedCodeBlock>
          </SectionCard>

          <SectionCard id="faq" variant="default" className="card-hover-enhanced">
            <h2 className="text-heading-2 text-[var(--text-50)] mb-6">常见问题</h2>
            <div className="space-y-6">
              {[
                {
                  q: '.pen 文件打不开 / 提示 "Some invalid data was skipped"',
                  a: 'Windows 上最常见的原因是跨文件组件引用（ref: "sys:xxx"）不受支持，建议在 Mac 上预览。其他原因：JSON 语法错误、使用了非法属性。可运行 claude-coder design --type fix 尝试修复格式问题。',
                },
                {
                  q: '提示 "The library system.pen is missing"',
                  a: '页面文件需要关联设计库。打开页面 .pen 文件 → Libraries 面板 → 导入 system.lib.pen。确保文件名包含 .lib.pen 后缀。',
                },
                {
                  q: '打开后全黑 / 看不到内容',
                  a: '可能是字体颜色与背景色相同。检查 system.lib.pen 中的颜色变量定义，确保文字颜色与背景有对比度。',
                },
                {
                  q: '组件堆叠 / 布局错乱',
                  a: '检查父容器是否设置了 layout: "vertical"，子元素是否使用了 fill_container（需要祖先有确定宽度）。运行 --type fix 可自动修复部分布局问题。',
                },
                {
                  q: '推荐使用哪个模型？',
                  a: '推荐使用 --model glm-5 获得最佳设计效果。其他模型也可用但生成质量可能有差异。',
                },
              ].map(({ q, a }, i) => (
                <div key={i} className="border-b border-[var(--border-300)]/50 pb-4 last:border-0">
                  <h3 className="text-sm font-semibold text-[var(--text-50)] mb-2">{q}</h3>
                  <p className="text-sm text-[var(--text-300)]">{a}</p>
                </div>
              ))}
            </div>
          </SectionCard>

        </div>
      </div>
    </PageLayout>
  );
};

export default Design;
