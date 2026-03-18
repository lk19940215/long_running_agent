import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { GITHUB_REPO_URL } from '../../utils';

const navLinks = [
  { path: '/', label: '首页' },
  { path: '/quick-start', label: '快速上手' },
  { path: '/features', label: '功能特性' },
  { path: '/docs', label: '文档' },
  { path: '/examples', label: '案例' },
];

const Header: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  const toggleMenu = () => setMobileMenuOpen(!mobileMenuOpen);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-opacity-90 backdrop-blur-md border-b border-[var(--border-300)] bg-[var(--bg-100)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--gradient-start)] to-[var(--gradient-end)] flex items-center justify-center">
              <span className="text-white font-bold text-lg">C</span>
            </div>
            <span className="text-xl font-bold text-[var(--text-50)]">Claude Coder</span>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-8">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`text-sm font-medium relative py-1 transition-colors ${
                  location.pathname === link.path
                    ? 'text-[var(--text-50)]'
                    : 'text-[var(--text-400)] hover:text-[var(--text-50)]'
                }`}
              >
                {link.label}
                {/* Active indicator with gradient border */}
                {location.pathname === link.path && (
                  <span className="absolute bottom-[-4px] left-0 right-0 h-[2px] bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)] rounded-full" />
                )}
                {/* Hover underline animation */}
                <span className="absolute bottom-[-4px] left-0 w-0 h-[2px] bg-[var(--text-400)] transition-all duration-300 group-hover/link:w-full" />
              </Link>
            ))}
          </nav>

          {/* Right Buttons */}
          <div className="hidden md:flex items-center space-x-4">
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-2 text-[var(--text-400)] hover:text-[var(--text-50)] transition-colors group"
            >
              <svg className="w-5 h-5 transition-transform duration-300 group-hover:rotate-12" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              <span className="link-underline">Star</span>
            </a>
            <Link to="/quick-start" className="btn-primary animate-pulse-glow text-sm no-underline">
              下载安装
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={toggleMenu}
            className="md:hidden p-2 text-[var(--text-200)]"
            aria-label="Toggle menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-[var(--bg-200)] border-t border-[var(--border-300)]">
          <div className="px-4 py-3 space-y-2">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`block py-2 text-sm relative transition-colors ${
                  location.pathname === link.path
                    ? 'text-[var(--text-50)] border-l-2 border-[var(--gradient-start)] pl-3 bg-[var(--bg-200)]'
                    : 'text-[var(--text-200)] hover:text-[var(--text-50)] pl-3'
                }`}
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;
