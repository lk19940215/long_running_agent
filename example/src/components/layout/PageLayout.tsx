import React, { useEffect, useState } from 'react';

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
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Trigger animation on mount
    requestAnimationFrame(() => {
      setIsVisible(true);
    });
  }, []);

  const maxWidthClasses = {
    default: 'max-w-7xl',
    narrow: 'max-w-4xl',
    wide: 'max-w-[1400px]',
    full: 'max-w-full',
  };

  return (
    <div className={`min-h-screen ${className}`}>
      <main className="pt-24 pb-20 px-4 sm:px-6 lg:px-8">
        <div
          className={`${maxWidthClasses[maxWidth]} mx-auto transition-all duration-700 ease-out ${
            isVisible
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 translate-y-8'
          }`}
        >
          {children}
        </div>
      </main>
    </div>
  );
};

export default PageLayout;