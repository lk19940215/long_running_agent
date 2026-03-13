/**
 * Claude Coder 官网 - 工具函数
 */

/**
 * GitHub 仓库地址
 */
export const GITHUB_REPO_URL = 'https://github.com/lk19940215/claude-coder';

/**
 * 延迟指定毫秒
 */
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 平滑滚动到指定元素
 */
export const scrollToElement = (elementId: string): void => {
  const element = document.getElementById(elementId);
  if (element) {
    element.scrollIntoView({ behavior: 'smooth' });
  }
};

/**
 * 截断文本，超过长度显示省略号
 */
export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
};

/**
 * 复制文本到剪贴板
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy text:', err);
    return false;
  }
};

/**
 * 检测是否为移动端
 */
export const isMobile = (): boolean => {
  return window.innerWidth < 768;
};

/**
 * 防抖函数
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const debounce = <T extends (...args: any[]) => void>(
  fn: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};

/**
 * 获取当前活跃的路由路径
 */
export const getActivePath = (pathname: string): string => {
  const paths = ['/', '/features', '/quick-start', '/docs', '/examples'];
  return paths.find((path) => pathname.startsWith(path)) || '/';
};
