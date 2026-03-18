import React, { useState, useCallback, useMemo } from 'react';
import { copyToClipboard } from '../../utils';

// Language display mapping - moved outside component to avoid recreation
const LANGUAGE_MAP: Record<string, string> = {
  bash: 'Bash',
  sh: 'Shell',
  shell: 'Shell',
  js: 'JavaScript',
  javascript: 'JavaScript',
  ts: 'TypeScript',
  typescript: 'TypeScript',
  tsx: 'TypeScript React',
  jsx: 'JavaScript React',
  python: 'Python',
  py: 'Python',
  json: 'JSON',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  markdown: 'Markdown',
  md: 'Markdown',
  yaml: 'YAML',
  yml: 'YAML',
  sql: 'SQL',
  go: 'Go',
  rust: 'Rust',
  java: 'Java',
  cpp: 'C++',
  c: 'C',
};

interface EnhancedCodeBlockProps {
  children: string;
  language?: string;
  showLineNumbers?: boolean;
  showCopyButton?: boolean;
  title?: string;
  className?: string;
  highlightLines?: number[];
}

const EnhancedCodeBlock: React.FC<EnhancedCodeBlockProps> = ({
  children,
  language = 'bash',
  showLineNumbers = true,
  showCopyButton = true,
  title,
  className = '',
  highlightLines = [],
}) => {
  const [copied, setCopied] = useState(false);

  const lines = children.split('\n');
  const lineCount = lines.length;
  const lineNumberWidth = String(lineCount).length;

  // Use Set for O(1) lookup instead of O(n) array.includes()
  const highlightedSet = useMemo(() => new Set(highlightLines), [highlightLines]);

  const handleCopy = useCallback(async () => {
    const success = await copyToClipboard(children);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [children]);

  const getLanguageDisplay = (lang: string): string => {
    return LANGUAGE_MAP[lang.toLowerCase()] || lang.toUpperCase();
  };

  return (
    <div className={`rounded-xl overflow-hidden ${className}`}>
      {/* Header with language and copy button */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#1a1a22] border-b border-[var(--code-border)]">
        <div className="flex items-center gap-3">
          {/* Terminal dots */}
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#ff5f56]" />
            <span className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
            <span className="w-3 h-3 rounded-full bg-[#27ca40]" />
          </div>
          {/* Language badge or title */}
          {title ? (
            <span className="text-sm font-medium text-[var(--text-200)]">{title}</span>
          ) : (
            <span className="px-2 py-0.5 text-xs font-medium text-[var(--lazy-cyan)] bg-[var(--lazy-cyan)]/10 rounded">
              {getLanguageDisplay(language)}
            </span>
          )}
        </div>
        {showCopyButton && (
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[var(--text-400)] hover:text-[var(--text-200)] bg-[var(--bg-200)] hover:bg-[var(--bg-100)] rounded transition-colors"
            title={copied ? '已复制!' : '复制代码'}
          >
            {copied ? (
              <>
                <svg className="w-3.5 h-3.5 text-[var(--success-500)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-[var(--success-500)]">已复制</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span>复制</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Code content */}
      <div className="code-block-responsive overflow-x-auto">
        <pre className="min-w-max">
          <code className="block">
            {lines.map((line, index) => {
              const lineNumber = index + 1;
              const isHighlighted = highlightedSet.has(lineNumber);

              return (
                <div
                  key={index}
                  className={`flex ${isHighlighted ? 'bg-[var(--primary-500)]/10 -mx-4 px-4' : ''}`}
                >
                  {showLineNumbers && (
                    <span
                      className="select-none text-right text-[var(--text-600)] mr-4 flex-shrink-0"
                      style={{ width: `${lineNumberWidth + 0.5}rem` }}
                    >
                      {lineNumber}
                    </span>
                  )}
                  <span className={`flex-1 whitespace-pre ${isHighlighted ? 'text-[var(--text-50)]' : 'text-[var(--text-200)]'}`}>
                    {line || ' '}
                  </span>
                </div>
              );
            })}
          </code>
        </pre>
      </div>
    </div>
  );
};

export default EnhancedCodeBlock;