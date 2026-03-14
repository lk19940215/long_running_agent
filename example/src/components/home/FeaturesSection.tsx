import React from 'react';
import ParticleContainer from '../common/ParticleContainer';

const features = [
  {
    icon: 'M13 10V3L4 14h7v7l9-11h-7z',
    title: '一句话需求 → 完整项目',
    description: '告别繁琐的手动编码。自然语言描述需求，AI 自动分解为可执行任务队列，从零到交付一气呵成。',
  },
  {
    icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
    title: '数小时无人值守',
    description: 'Session 守护 + 倒计时活跃度监控 + git 回滚重试，Agent 持续编码数小时不中断，真正解放双手。',
  },
  {
    icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
    title: 'Hook 注入 · 安全可控',
    description: 'JSON 配置即可在工具调用时注入规则引导，零代码修改扩展 AI 行为，代码审查自动护航。',
  },
  {
    icon: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4',
    title: '任意模型 · 自由切换',
    description: '支持 Claude、DeepSeek、GLM-5、Qwen 等任意 Anthropic 兼容 API，多模型路由灵活编排。',
  },
  {
    icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10',
    title: 'E2E 测试自动化',
    description: 'Playwright 登录态一键导出、API Key 持久化存储，Agent 编码后自动验证，交付即可用。',
  },
  {
    icon: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4',
    title: '配置驱动 · 开箱即用',
    description: 'JSON 配置 + 环境变量 + CLI 参数三位一体，`claude-coder setup` 一键配好，即刻开跑。',
  },
];

const FeaturesSection: React.FC = () => {
  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <ParticleContainer autoTrigger={true} triggerDelay={300} className="w-full">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-[var(--text-50)] mb-4">
              核心特性
            </h2>
            <p className="text-lg text-[var(--text-400)] max-w-2xl mx-auto">
              让 AI 成为真正的编码伙伴，从需求到交付，全程自主执行
            </p>
          </div>
        </ParticleContainer>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className={`card animate-float-delay-${index % 3}`}
            >
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[var(--gradient-start)] to-[var(--gradient-end)] flex items-center justify-center mb-4">
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d={feature.icon}
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-[var(--text-50)] mb-2">
                {feature.title}
              </h3>
              <p className="text-[var(--text-300)] leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
