import React, { useEffect, useState } from 'react';

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
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (animate) {
      requestAnimationFrame(() => {
        setIsVisible(true);
      });
    }
  }, [animate]);

  const variantClasses = {
    gradient: 'text-highlight',
    glow: 'text-glow text-[var(--lazy-cyan)]',
    flow: 'gradient-flow-text',
    default: 'text-[var(--text-50)]',
  };

  const sizeClasses = {
    h1: 'text-4xl font-bold',
    h2: 'text-2xl font-bold',
    h3: 'text-xl font-semibold',
  };

  const animationClass = animate
    ? `transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`
    : '';

  return (
    <div className={`${animate ? 'animate-fade-in-up' : ''}`}>
      <Component
        className={`${sizeClasses[Component]} ${variantClasses[variant]} ${animationClass} ${className}`}
      >
        {children}
      </Component>
      {subtitle && (
        <p
          className={`text-lg text-[var(--text-400)] mt-2 ${animationClass}`}
          style={animate ? { transitionDelay: '150ms' } : {}}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
};

export default AnimatedTitle;