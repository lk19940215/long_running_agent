import React from 'react';

// Max width classes - moved outside component to avoid recreation
const MAX_WIDTH_CLASSES = {
  default: 'max-w-7xl',
  narrow: 'max-w-4xl',
  wide: 'max-w-[1400px]',
  full: 'max-w-full',
} as const;

interface PageLayoutProps {
  children: React.ReactNode;
  className?: string;
  maxWidth?: 'default' | 'narrow' | 'wide' | 'full';
}

const PageLayout: React.FC<PageLayoutProps> = ({
  children,
  className = '',
  maxWidth = 'default',
}) => {
  return (
    <div className={`min-h-screen ${className}`}>
      <main className="pt-24 pb-20 px-4 sm:px-6 lg:px-8">
        <div className={`${MAX_WIDTH_CLASSES[maxWidth]} mx-auto animate-fade-in-up`}>
          {children}
        </div>
      </main>
    </div>
  );
};

export default PageLayout;