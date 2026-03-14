import React, { useState, useCallback } from 'react';
import { scrollToElement } from '../utils';

const sections = [
  { id: 'hook', title: 'Hook 提示注入' },
  { id: 'session', title: 'Session 守护' },
  { id: 'model', title: '多模型路由' },
  { id: 'test', title: '测试凭证' },
];

const Features: React.FC = () => {
  const [activeSection, setActiveSection] = useState('hook');

  const handleNavClick = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setActiveSection(id);
    scrollToElement(id);
  }, []);

  return (
    <div className="min-h-screen">
      <main className="pt-24 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl font-bold text-[var(--text-50)] mb-8">功能特性</h1>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Sidebar Navigation */}
            <aside className="lg:col-span-1">
              <nav className="card sticky top-24">
                <ul className="space-y-2">
                  {sections.map((section) => (
                    <li key={section.id}>
                      <a
                        href={`#${section.id}`}
                        className={`nav-item ${activeSection === section.id ? 'active' : ''}`}
                        onClick={(e) => handleNavClick(e, section.id)}
                      >
                        {section.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            </aside>

            {/* Main Content */}
            <div className="lg:col-span-3 space-y-12">
              {/* Hook Injection */}
              <section id="hook" className="card">
                <h2 className="text-2xl font-bold text-[var(--text-50)] mb-4">Hook 提示注入机制</h2>
                <p className="text-[var(--text-300)] mb-4 leading-relaxed">
                  核心亮点：通过 JSON 配置，在 SDK 工具调用时自动向模型注入上下文引导。
                  <strong className="text-[var(--text-50)]">零代码修改</strong>即可扩展 AI 行为规则——
                  无需改动源码，只需编辑配置文件就能引导 Agent 遵守编码规范、安全策略。
                </p>
                <div className="code-block mb-4">
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
                <p className="text-sm text-[var(--text-400)]">
                  支持三级匹配（全局 / 工具级 / 参数级），可灵活控制注入粒度。
                </p>
              </section>

              {/* Session Guardian */}
              <section id="session" className="card">
                <h2 className="text-2xl font-bold text-[var(--text-50)] mb-4">Session 守护机制</h2>
                <p className="text-[var(--text-300)] mb-4 leading-relaxed">
                  专为<strong className="text-[var(--text-50)]">长时间无人值守编码</strong>设计。
                  多 Session 编排 + 倒计时活跃度监控，Agent 可连续运行数小时自主完成数十个任务。
                </p>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <span className="text-[var(--gradient-start)] mt-0.5">●</span>
                    <span className="text-[var(--text-300)]">自动检测 Session 超时 / 中断，智能恢复上下文</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-[var(--gradient-start)] mt-0.5">●</span>
                    <span className="text-[var(--text-300)]">倒计时活跃度检测 + 工具运行状态实时追踪</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-[var(--gradient-start)] mt-0.5">●</span>
                    <span className="text-[var(--text-300)]">失败自动 git 回滚 + 重试，保障代码仓库安全</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-[var(--gradient-start)] mt-0.5">●</span>
                    <span className="text-[var(--text-300)]">智能防刷屏机制，避免无效循环消耗 Token</span>
                  </li>
                </ul>
              </section>

              {/* Multi-Model Routing */}
              <section id="model" className="card">
                <h2 className="text-2xl font-bold text-[var(--text-50)] mb-4">多模型路由</h2>
                <p className="text-[var(--text-300)] mb-4 leading-relaxed">
                  不绑定单一模型。支持 Claude 官方、Coding Plan 多模型路由、DeepSeek、GLM-5、Qwen 等
                  <strong className="text-[var(--text-50)]">任意 Anthropic 兼容 API</strong>，
                  按任务类型灵活分配最优模型，兼顾质量与成本。
                </p>
                <div className="code-block mb-4">
                  <pre className="text-[var(--text-200)]">{`# 推荐配置（长时间自运行最稳）
ANTHROPIC_DEFAULT_OPUS_MODEL=glm-5
ANTHROPIC_DEFAULT_SONNET_MODEL=qwen3-coder-next
ANTHROPIC_DEFAULT_HAIKU_MODEL=qwen3-coder-plus
ANTHROPIC_MODEL=kimi-k2.5`}</pre>
                </div>
              </section>

              {/* Test Credentials */}
              <section id="test" className="card">
                <h2 className="text-2xl font-bold text-[var(--text-50)] mb-4">测试凭证管理</h2>
                <p className="text-[var(--text-300)] mb-4 leading-relaxed">
                  Agent 编完代码还能<strong className="text-[var(--text-50)]">自动验证</strong>。
                  Playwright 一键导出浏览器登录态，API Key 持久化存储，
                  端到端测试全程自动化，交付即可用。
                </p>
                <div className="code-block">
                  <pre className="text-[var(--text-200)]">{`# 一键导出浏览器登录态
claude-coder auth http://localhost:3000

# Agent 测试时自动使用保存的凭证`}</pre>
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Features;
