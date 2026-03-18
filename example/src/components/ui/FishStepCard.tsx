import React from 'react';

// Variant styles - moved outside component to avoid recreation
const VARIANT_STYLES = {
  default: 'bg-[var(--bg-200)] border border-[var(--border-300)]',
  primary: 'bg-gradient-to-br from-[var(--bg-200)] to-[var(--bg-100)] border border-[var(--primary-600)]/30',
  success: 'bg-[var(--bg-200)] border border-[var(--success-500)]/30',
} as const;

interface FishStepCardProps {
  stepNumber: number;
  title: string;
  description?: string;
  children?: React.ReactNode;
  icon?: React.ReactNode;
  variant?: 'default' | 'primary' | 'success';
  animate?: boolean;
  staggerIndex?: number;
  className?: string;
}

const FishStepCard: React.FC<FishStepCardProps> = ({
  stepNumber,
  title,
  description,
  children,
  icon,
  variant = 'default',
  animate = true,
  staggerIndex = 1,
  className = '',
}) => {
  // Compute delay dynamically instead of fixed CSS classes
  const animationDelay = staggerIndex * 100;
  const animationStyle = animate
    ? { animationDelay: `${animationDelay}ms` }
    : undefined;

  return (
    <div
      className={`
        rounded-xl p-6 transition-all duration-500 ease-out
        ${VARIANT_STYLES[variant]}
        ${animate ? 'animate-stagger-1' : ''}
        hover:shadow-lg hover:shadow-[var(--primary-600)]/5
        ${className}
      `}
      style={animationStyle}
    >
      <div className="flex gap-4">
        {/* Step number with gradient background */}
        <div className="flex-shrink-0">
          <div className="step-number relative group">
            {/* Glow effect on hover */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[var(--fish-gold)] to-[var(--lazy-cyan)] opacity-0 group-hover:opacity-30 blur-lg transition-opacity" />
            <span className="relative z-10">{stepNumber}</span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title with optional icon */}
          <div className="flex items-center gap-2 mb-2">
            {icon && (
              <span className="text-[var(--lazy-cyan)] flex-shrink-0">
                {icon}
              </span>
            )}
            <h3 className="text-lg font-semibold text-[var(--text-50)]">
              {title}
            </h3>
          </div>

          {/* Description */}
          {description && (
            <p className="text-[var(--text-400)] mb-4 leading-relaxed">
              {description}
            </p>
          )}

          {/* Additional content (e.g., code blocks) */}
          {children && (
            <div className="mt-4">
              {children}
            </div>
          )}
        </div>
      </div>

      {/* Decorative bottom gradient line */}
      <div className="mt-6 h-0.5 bg-gradient-to-r from-[var(--fish-gold)] via-[var(--lazy-cyan)] to-transparent opacity-30 rounded-full" />
    </div>
  );
};

export default FishStepCard;