import React from 'react';

// Style classes - moved outside component to avoid recreation
const VARIANT_CLASSES = {
  gradient: 'text-highlight',
  glow: 'text-glow text-[var(--lazy-cyan)]',
  flow: 'gradient-flow-text',
  default: 'text-[var(--text-50)]',
} as const;

const SIZE_CLASSES = {
  h1: 'text-4xl font-bold',
  h2: 'text-2xl font-bold',
  h3: 'text-xl font-semibold',
} as const;

interface AnimatedTitleProps {
  children: React.ReactNode;
  as?: 'h1' | 'h2' | 'h3';
  variant?: 'gradient' | 'glow' | 'flow' | 'default';
  className?: string;
  subtitle?: string;
  animate?: boolean;
}

const AnimatedTitle: React.FC<AnimatedTitleProps> = ({
  children,
  as: Component = 'h1',
  variant = 'gradient',
  className = '',
  subtitle,
  animate = true,
}) => {
  return (
    <>
      <Component
        className={`${SIZE_CLASSES[Component]} ${VARIANT_CLASSES[variant]} ${animate ? 'animate-fade-in-up' : ''} ${className}`}
      >
        {children}
      </Component>
      {subtitle && (
        <p className={`text-lg text-[var(--text-400)] mt-2 ${animate ? 'animate-fade-in-up' : ''}`} style={animate ? { animationDelay: '150ms' } : undefined}>
          {subtitle}
        </p>
      )}
    </>
  );
};

export default AnimatedTitle;