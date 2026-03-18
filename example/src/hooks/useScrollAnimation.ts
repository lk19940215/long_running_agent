import { useEffect, useRef, useState, RefObject } from 'react';

interface UseScrollAnimationOptions {
  /** 触发阈值 (0-1) */
  threshold?: number;
  /** 根元素边界 */
  rootMargin?: string;
  /** 是否只触发一次 */
  triggerOnce?: boolean;
  /** 是否启用 */
  enabled?: boolean;
}

interface UseScrollAnimationReturn {
  /** 附加到目标元素的 ref */
  ref: RefObject<HTMLDivElement>;
  /** 元素是否在视口中 */
  isVisible: boolean;
  /** 元素是否曾经进入过视口 */
  hasBeenVisible: boolean;
}

/**
 * 滚动触发动画 Hook
 * 使用 IntersectionObserver 监听元素进入视口
 *
 * @example
 * ```tsx
 * const { ref, isVisible } = useScrollAnimation({ threshold: 0.2 });
 *
 * return (
 *   <div
 *     ref={ref}
 *     className={`transition-all duration-500 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
 *   >
 *     Content that animates on scroll
 *   </div>
 * );
 * ```
 */
export function useScrollAnimation(
  options: UseScrollAnimationOptions = {}
): UseScrollAnimationReturn {
  const {
    threshold = 0.1,
    rootMargin = '0px',
    triggerOnce = true,
    enabled = true,
  } = options;

  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  // Use ref to avoid triggering effect re-runs
  const hasBeenVisibleRef = useRef(false);

  useEffect(() => {
    const element = ref.current;

    if (!enabled || !element) {
      return;
    }

    // If triggerOnce is true and already triggered, set visible and return
    if (triggerOnce && hasBeenVisibleRef.current) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        const isIntersecting = entry.isIntersecting;

        if (isIntersecting) {
          setIsVisible(true);
          hasBeenVisibleRef.current = true;
        } else if (!triggerOnce) {
          setIsVisible(false);
        }
      },
      {
        threshold,
        rootMargin,
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [threshold, rootMargin, triggerOnce, enabled]);

  return { ref, isVisible, hasBeenVisible: hasBeenVisibleRef.current };
}

export default useScrollAnimation;