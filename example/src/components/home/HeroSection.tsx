import React from 'react';
import { Link } from 'react-router-dom';
import { GITHUB_REPO_URL } from '../../utils';

const HeroSection: React.FC = () => {
  return (
    <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto text-center">
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-[var(--text-50)] mb-6">
          <span className="bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)] bg-clip-text text-transparent">
            Claude Coder
          </span>
        </h1>
        <p className="text-xl sm:text-2xl text-[var(--text-400)] mb-8 max-w-3xl mx-auto">
          自主编码 Agent Harness
        </p>
        <p className="text-lg text-[var(--text-400)] mb-12 max-w-2xl mx-auto">
          一句话需求 → 完整项目。长时间自运行，自动分解任务、持续编码、验证交付。
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link to="/quick-start" className="btn-primary text-base no-underline">
            开始使用
          </Link>
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center space-x-2 text-[var(--text-400)] hover:text-[var(--text-50)] transition-colors"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            <span>View on GitHub</span>
          </a>
        </div>

        {/* Stats */}
        <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-8 max-w-2xl mx-auto">
          <div className="text-center">
            <div className="text-3xl font-bold text-[var(--text-50)]">50+</div>
            <div className="text-[var(--text-400)] text-sm">Sessions 自动运行</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-[var(--text-50)]">∞</div>
            <div className="text-[var(--text-400)] text-sm">模型支持</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-[var(--text-50)]">0</div>
            <div className="text-[var(--text-400)] text-sm">配置即开即用</div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
