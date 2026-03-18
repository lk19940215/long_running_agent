import React, { useState, useCallback } from 'react';
import PageLayout from '../components/layout/PageLayout';
import SectionCard from '../components/ui/SectionCard';
import { useMobileSidebar } from '../hooks/useMobileSidebar';
import { scrollToElement } from '../utils';

const sections = [
  { id: 'hook', title: 'Hook 提示注入' },
  { id: 'session', title: 'Session 守护' },
  { id: 'model', title: '多模型路由' },
  { id: 'test', title: '测试凭证' },
];

// Menu icon component
const MenuIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

// Close icon component
const CloseIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const Features: React.FC = () => {
  const [activeSection, setActiveSection] = useState('hook');
  const { isOpen, toggle, close } = useMobileSidebar();

  const handleNavClick = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setActiveSection(id);
    scrollToElement(id);
    close(); // Close mobile sidebar after navigation
  }, [close]);

  // Sidebar navigation content (reused for both mobile and desktop)
  const SidebarNav = () => (
    <nav>
      <ul className="space-y-2">
        {sections.map((section, index) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              className={`nav-item animate-slide-in-left ${activeSection === section.id ? 'nav-item-active' : ''}`}
              style={{ animationDelay: `${index * 0.1}s` }}
              onClick={(e) => handleNavClick(e, section.id)}
            >
              {section.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );

  return (
    <PageLayout>
      {/* Mobile sidebar toggle button */}
      <button
        onClick={toggle}
        className="sidebar-toggle-btn fixed top-20 left-4 z-50 lg:hidden"
        aria-label="Toggle sidebar"
      >
        <MenuIcon />
      </button>

      {/* Mobile sidebar overlay */}
      {isOpen && (
        <div
          className="sidebar-overlay visible lg:hidden"
          onClick={close}
        />
      )}

      {/* Mobile sidebar */}
      <aside className={`fixed top-0 left-0 w-[280px] h-screen bg-[var(--bg-100)] border-r border-[var(--border-300)] z-50 overflow-y-auto p-6 transition-transform duration-300 lg:hidden ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-heading-3 text-[var(--text-50)]">导航</h3>
          <button
            onClick={close}
            className="p-2 rounded-lg hover:bg-[var(--bg-200)] transition-colors"
            aria-label="Close sidebar"
          >
            <CloseIcon />
          </button>
        </div>
        <SidebarNav />
      </aside>

      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-heading-1 text-[var(--text-50)] mb-4">功能特性</h1>
        <p className="text-body text-[var(--text-400)]">探索 Claude Coder 的核心能力</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Desktop Sidebar Navigation */}
        <aside className="hidden lg:block lg:col-span-1">
          <div className="sticky top-24">
            <div className="card p-4">
              <h3 className="text-caption text-[var(--text-400)] uppercase tracking-wider mb-4">功能导航</h3>
              <SidebarNav />
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <div className="lg:col-span-3 space-y-8">
          {/* Hook Injection */}
          <SectionCard id="hook" variant="default" className="card-hover-enhanced">
            <h2 className="text-heading-2 text-[var(--text-50)] mb-4">Hook 提示注入机制</h2>
            <p className="text-body mb-4 leading-relaxed">
              核心亮点：通过 JSON 配置，在 SDK 工具调用时自动向模型注入上下文引导。
              <strong className="text-[var(--text-50)]">零代码修改</strong>即可扩展 AI 行为规则——
              无需改动源码，只需编辑配置文件就能引导 Agent 遵守编码规范、安全策略。
            </p>
            <div className="code-block-responsive mb-4">
              <pre className="text-[var(--text-200)]">{`{
  "hooks": [
    {
      "trigger": "tool_call",
      "tool": "edit_file",
      "inject": "请确保代码符合项目编码规范"
    }
  ]
}`}</pre>
            </div>
            <p className="text-caption">
              支持三级匹配（全局 / 工具级 / 参数级），可灵活控制注入粒度。
            </p>
          </SectionCard>

          {/* Session Guardian */}
          <SectionCard id="session" variant="default" className="card-hover-enhanced">
            <h2 className="text-heading-2 text-[var(--text-50)] mb-4">Session 守护机制</h2>
            <p className="text-body mb-4 leading-relaxed">
              专为<strong className="text-[var(--text-50)]">长时间无人值守编码</strong>设计。
              多 Session 编排 + 倒计时活跃度监控，Agent 可连续运行数小时自主完成数十个任务。
            </p>
            <ul className="space-y-3">
              <li className="flex items-start gap-3 animate-slide-in-left" style={{ animationDelay: '0.1s' }}>
                <span className="text-[var(--gradient-start)] mt-0.5">●</span>
                <span className="text-body">自动检测 Session 超时 / 中断，智能恢复上下文</span>
              </li>
              <li className="flex items-start gap-3 animate-slide-in-left" style={{ animationDelay: '0.2s' }}>
                <span className="text-[var(--gradient-start)] mt-0.5">●</span>
                <span className="text-body">倒计时活跃度检测 + 工具运行状态实时追踪</span>
              </li>
              <li className="flex items-start gap-3 animate-slide-in-left" style={{ animationDelay: '0.3s' }}>
                <span className="text-[var(--gradient-start)] mt-0.5">●</span>
                <span className="text-body">失败自动 git 回滚 + 重试，保障代码仓库安全</span>
              </li>
              <li className="flex items-start gap-3 animate-slide-in-left" style={{ animationDelay: '0.4s' }}>
                <span className="text-[var(--gradient-start)] mt-0.5">●</span>
                <span className="text-body">智能防刷屏机制，避免无效循环消耗 Token</span>
              </li>
            </ul>
          </SectionCard>

          {/* Multi-Model Routing */}
          <SectionCard id="model" variant="default" className="card-hover-enhanced">
            <h2 className="text-heading-2 text-[var(--text-50)] mb-4">多模型路由</h2>
            <p className="text-body mb-4 leading-relaxed">
              不绑定单一模型。支持 Claude 官方、Coding Plan 多模型路由、DeepSeek、GLM-5、Qwen 等
              <strong className="text-[var(--text-50)]">任意 Anthropic 兼容 API</strong>，
              按任务类型灵活分配最优模型，兼顾质量与成本。
            </p>
            <div className="code-block-responsive mb-4">
              <pre className="text-[var(--text-200)]">{`# 推荐配置（长时间自运行最稳）
ANTHROPIC_DEFAULT_OPUS_MODEL=glm-5
ANTHROPIC_DEFAULT_SONNET_MODEL=qwen3-coder-next
ANTHROPIC_DEFAULT_HAIKU_MODEL=qwen3-coder-plus
ANTHROPIC_MODEL=kimi-k2.5`}</pre>
            </div>
          </SectionCard>

          {/* Test Credentials */}
          <SectionCard id="test" variant="default" className="card-hover-enhanced">
            <h2 className="text-heading-2 text-[var(--text-50)] mb-4">测试凭证管理</h2>
            <p className="text-body mb-4 leading-relaxed">
              Agent 编完代码还能<strong className="text-[var(--text-50)]">自动验证</strong>。
              Playwright 一键导出浏览器登录态，API Key 持久化存储，
              端到端测试全程自动化，交付即可用。
            </p>
            <div className="code-block-responsive">
              <pre className="text-[var(--text-200)]">{`# 一键导出浏览器登录态
claude-coder auth http://localhost:3000

# Agent 测试时自动使用保存的凭证`}</pre>
            </div>
          </SectionCard>
        </div>
      </div>
    </PageLayout>
  );
};

export default Features;