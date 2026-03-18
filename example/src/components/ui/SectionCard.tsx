import React from 'react';

interface SectionCardProps {
  children: React.ReactNode;
  variant?: 'default' | 'primary' | 'fish' | 'success' | 'bordered';
  className?: string;
  id?: string;
  hover?: boolean;
}

const SectionCard: React.FC<SectionCardProps> = ({
  children,
  variant = 'default',
  className = '',
  id,
  hover = true,
}) => {
  const baseClasses = 'rounded-xl p-6 transition-all duration-300';

  const variantClasses = {
    default: `bg-[var(--bg-200)] border border-[var(--border-300)] ${hover ? 'card-hover-enhanced' : ''}`,
    primary: `bg-gradient-to-br from-[var(--bg-200)] to-[var(--bg-100)] border border-[var(--primary-600)]/30 ${hover ? 'hover:border-[var(--primary-500)] hover:shadow-lg hover:shadow-[var(--primary-600)]/10' : ''}`,
    fish: `card-fish ${hover ? '' : ''}`,
    success: `bg-[var(--bg-200)] border-2 border-[var(--success-500)] ${hover ? 'hover:shadow-lg hover:shadow-[var(--success-500)]/10' : ''}`,
    bordered: `card-gradient-border p-6 ${hover ? 'card-hover-enhanced' : ''}`,
  };

  return (
    <section
      id={id}
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
    >
      {children}
    </section>
  );
};

export default SectionCard;