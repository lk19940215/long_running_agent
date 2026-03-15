import React, { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { scrollToElement } from '../utils';

const docs = [
  { id: 'getting-started', title: '入门指南' },
  { id: 'core-concepts', title: '核心概念' },
  { id: 'commands', title: '命令参考' },
  { id: 'troubleshooting', title: '故障排查' },
];

const Docs: React.FC = () => {
  const [activeDoc, setActiveDoc] = useState('getting-started');

  const handleNavClick = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setActiveDoc(id);
    scrollToElement(id);
  }, []);

  return (
    <div className="min-h-screen">
      <main className="pt-24 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Sidebar */}
            <aside className="lg:col-span-1">
              <nav className="card sticky top-24">
                <h3 className="text-[var(--text-50)] font-semibold mb-4 px-2">文档目录</h3>
                <ul className="space-y-1">
                  {docs.map((item) => (
                    <li key={item.id}>
                      <a
                        href={`#${item.id}`}
                        className={`nav-item ${activeDoc === item.id ? 'active' : ''}`}
                        onClick={(e) => handleNavClick(e, item.id)}
                      >
                        {item.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            </aside>

            {/* Content */}
            <div className="lg:col-span-3">
              <h1 className="text-4xl font-bold text-[var(--text-50)] mb-8">文档中心</h1>

              <div className="space-y-8">
                {/* Getting Started */}
                <section id="getting-started" className="card">
                  <h2 className="text-2xl font-bold text-[var(--text-50)] mb-4">入门指南</h2>
                  <p className="text-[var(--text-300)] mb-4 leading-relaxed">
                    三步即可启动你的第一个自主编码 Agent：安装 → 配置 → 运行。
                  </p>
                  <ul className="space-y-2">
                    <li className="flex items-center gap-2">
                      <span className="text-[var(--gradient-start)]">→</span>
                      <Link to="/quick-start" className="text-[var(--primary-400)] hover:underline">安装指南</Link>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-[var(--gradient-start)]">→</span>
                      <span className="text-[var(--text-300)]">模型配置：<code className="text-sm text-[var(--primary-300)]">claude-coder setup</code></span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-[var(--gradient-start)]">→</span>
                      <span className="text-[var(--text-300)]">第一个项目：<code className="text-sm text-[var(--primary-300)]">claude-coder run "你的需求"</code></span>
                    </li>
                  </ul>
                </section>

                {/* Core Concepts */}
                <section id="core-concepts" className="card">
                  <h2 className="text-2xl font-bold text-[var(--text-50)] mb-4">核心概念</h2>
                  <div className="space-y-5">
                    <div>
                      <h3 className="text-lg font-semibold text-[var(--text-50)] mb-1">Hook 注入机制</h3>
                      <p className="text-[var(--text-300)] leading-relaxed">
                        在 SDK 工具调用（如 edit_file、run_command）时自动注入上下文提示，
                        三级匹配粒度灵活控制 AI 行为，无需修改源码。
                      </p>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-[var(--text-50)] mb-1">Session 守护</h3>
                      <p className="text-[var(--text-300)] leading-relaxed">
                        Harness 持续监控 Agent Session 状态，自动处理超时、中断、无响应。
                        失败时 git 回滚 + 重试，确保长时间无人值守编码的稳定性。
                      </p>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-[var(--text-50)] mb-1">任务分解与编排</h3>
                      <p className="text-[var(--text-300)] leading-relaxed">
                        将复杂需求拆分为独立子任务，按依赖关系排序。每个 Session 执行 6 步流程：
                        恢复上下文 → 环境检查 → 选任务 → 编码 → 测试 → 收尾。
                      </p>
                    </div>
                  </div>
                </section>

                {/* Commands */}
                <section id="commands" className="card">
                  <h2 className="text-2xl font-bold text-[var(--text-50)] mb-4">命令参考</h2>
                  <div className="space-y-3">
                    {[
                      { cmd: 'setup', desc: '交互式配置（模型、MCP、安全限制、自动审查）' },
                      { cmd: 'init', desc: '初始化项目（扫描技术栈、生成 profile、部署食谱）' },
                      { cmd: 'go', desc: 'AI 对话式需求收集与方案组装' },
                      { cmd: 'go "需求"', desc: 'AI 自动分析需求并组装方案' },
                      { cmd: 'plan "需求"', desc: '生成任务计划方案' },
                      { cmd: 'run "需求"', desc: '启动自动编码循环' },
                      { cmd: 'simplify', desc: '代码审查和简化' },
                      { cmd: 'auth [url]', desc: '导出 Playwright 登录状态' },
                      { cmd: 'status', desc: '查看进度和成本统计' },
                    ].map(({ cmd, desc }) => (
                      <div key={cmd} className="flex items-center gap-4">
                        <code className="code-block px-3 py-1 text-sm shrink-0 text-white">{cmd}</code>
                        <span className="text-[var(--text-300)]">{desc}</span>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Troubleshooting */}
                <section id="troubleshooting" className="card">
                  <h2 className="text-2xl font-bold text-[var(--text-50)] mb-4">故障排查</h2>
                  <div className="space-y-5">
                    <div>
                      <h3 className="text-lg font-semibold text-[var(--text-50)] mb-1">余额不足 (Credit balance too low)</h3>
                      <p className="text-[var(--text-300)] leading-relaxed">
                        运行 <code className="text-sm text-[var(--primary-300)]">claude-coder setup</code> 重新配置 API Key，或切换至其他模型。
                      </p>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-[var(--text-50)] mb-1">中断恢复</h3>
                      <p className="text-[var(--text-300)] leading-relaxed">
                        Session 自动保存进度，直接重新运行 <code className="text-sm text-[var(--primary-300)]">claude-coder run</code> 即可从断点继续。
                      </p>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-[var(--text-50)] mb-1">长时间无响应</h3>
                      <p className="text-[var(--text-300)] leading-relaxed">
                        模型处理复杂任务时可能出现长思考间隔，这是正常行为。
                        超过阈值后 Harness 自动中断并重试。可通过 <code className="text-sm text-[var(--primary-300)]">SESSION_STALL_TIMEOUT</code> 调整。
                      </p>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Docs;
