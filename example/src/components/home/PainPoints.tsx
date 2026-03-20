import React from 'react';

const painPoints = [
  {
    emoji: '🎨',
    pain: '不会设计 UI，页面又丑又乱',
    solution: 'design 命令自动生成专业设计稿',
    detail: '一句话描述页面，AI 生成完整的 .pen 设计文件，包含配色、字体、组件规范。',
    command: 'claude-coder design "用户管理后台"',
  },
  {
    emoji: '😤',
    pain: '代码和设计稿差了十万八千里',
    solution: 'design_map 自动索引，编码时参考设计',
    detail: '设计文件通过 design_map.json 索引，编码阶段 AI 自动读取并还原设计意图。',
    command: 'claude-coder run  # AI 自动读取设计',
  },
  {
    emoji: '💥',
    pain: 'AI 编码工具总是中途崩',
    solution: '自愈 + 回滚 + 重试，连续编码数小时',
    detail: '校验失败自动回滚，JSON 损坏 AI 修复，连续失败自动跳过。不用盯着。',
    command: 'claude-coder run --max 50',
  },
  {
    emoji: '🧹',
    pain: 'AI 写的代码越堆越乱，没人 Review',
    solution: '每 N 个 session 自动审查，消除冗余',
    detail: 'simplify 自动审查累积变更，重构优化后自动提交。编码和审查一体化，代码质量持续保障。',
    command: 'claude-coder simplify',
  },
  {
    emoji: '🤹',
    pain: '一个人干前端后端测试部署',
    solution: '全流程自动化，只需描述想要什么',
    detail: '需求分析 → 设计 → 分解 → 编码 → 审查 → 测试 → 提交，一条龙自动完成。',
    command: 'claude-coder go "电商后台"',
  },
];

const PainPoints: React.FC = () => {
  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 bg-[var(--bg-200)]">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-[var(--text-50)] mb-4">
            你是不是也遇到过？
          </h2>
          <p className="text-lg text-[var(--text-400)] max-w-2xl mx-auto">
            这些让开发者头疼的问题，Claude Coder 都有解法
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {painPoints.map((item, index) => (
            <div key={index} className="card card-hover-enhanced overflow-hidden">
              <div className="flex items-start gap-4 mb-4">
                <span className="text-3xl flex-shrink-0">{item.emoji}</span>
                <div>
                  <h3 className="text-lg font-semibold text-[var(--text-50)] mb-1 line-through decoration-[var(--error-500)]/40">
                    {item.pain}
                  </h3>
                  <p className="text-[var(--primary-400)] font-medium">
                    ✨ {item.solution}
                  </p>
                </div>
              </div>
              <p className="text-[var(--text-300)] text-sm mb-4 leading-relaxed">
                {item.detail}
              </p>
              <div className="bg-[var(--bg-400)] rounded-lg px-4 py-2 font-mono text-sm text-[var(--success-500)]">
                $ {item.command}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default PainPoints;
