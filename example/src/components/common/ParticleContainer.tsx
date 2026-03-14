import React, { useRef, useState, useEffect, useCallback } from 'react';

interface Particle {
  id: number;
  x: number;
  y: number;
  color: string;
  angle: number;
  speed: number;
  size: number;
  opacity: number;
}

interface ParticleContainerProps {
  children: React.ReactNode;
  particleCount?: number;
  colors?: string[];
  autoTrigger?: boolean;
  triggerDelay?: number;
  className?: string;
}

const ParticleContainer: React.FC<ParticleContainerProps> = ({
  children,
  particleCount = 18,
  colors = ['var(--fish-gold)', 'var(--lazy-cyan)'],
  autoTrigger = false,
  triggerDelay = 0,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const animationRef = useRef<number | null>(null);
  const hasAutoTriggered = useRef(false);

  // 生成粒子
  const generateParticles = useCallback((centerX: number, centerY: number) => {
    const newParticles: Particle[] = [];
    for (let i = 0; i < particleCount; i++) {
      newParticles.push({
        id: Date.now() + i,
        x: centerX,
        y: centerY,
        color: colors[i % colors.length],
        angle: (Math.PI * 2 * i) / particleCount + Math.random() * 0.5,
        speed: 2 + Math.random() * 3,
        size: 4 + Math.random() * 6,
        opacity: 1,
      });
    }
    return newParticles;
  }, [particleCount, colors]);

  // 触发粒子动画
  const triggerParticles = useCallback(() => {
    if (isAnimating || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    setParticles(generateParticles(centerX, centerY));
    setIsAnimating(true);
  }, [isAnimating, generateParticles]);

  // 动画循环
  useEffect(() => {
    if (!isAnimating || particles.length === 0) return;

    let frameCount = 0;
    const maxFrames = 60; // 约 1 秒动画

    const animate = () => {
      frameCount++;

      setParticles(prevParticles =>
        prevParticles.map(p => ({
          ...p,
          x: p.x + Math.cos(p.angle) * p.speed,
          y: p.y + Math.sin(p.angle) * p.speed,
          opacity: Math.max(0, 1 - frameCount / maxFrames),
          size: p.size * 0.98,
        }))
      );

      if (frameCount < maxFrames) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setParticles([]);
        setIsAnimating(false);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isAnimating, particles.length]);

  // IntersectionObserver 检测视口
  useEffect(() => {
    if (!autoTrigger || !containerRef.current) return;

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting && !hasAutoTriggered.current) {
            hasAutoTriggered.current = true;
            setTimeout(() => {
              triggerParticles();
            }, triggerDelay);
          }
        });
      },
      { threshold: 0.5 }
    );

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, [autoTrigger, triggerDelay, triggerParticles]);

  // 点击触发
  const handleClick = () => {
    triggerParticles();
  };

  return (
    <div
      ref={containerRef}
      className={`particle-container relative inline-block ${className}`}
      onClick={handleClick}
      style={{ cursor: 'pointer' }}
    >
      {children}

      {/* 粒子层 */}
      {particles.map(particle => (
        <div
          key={particle.id}
          className="particle particle-fly"
          style={{
            position: 'absolute',
            left: particle.x,
            top: particle.y,
            width: particle.size,
            height: particle.size,
            borderRadius: '50%',
            backgroundColor: particle.color,
            opacity: particle.opacity,
            pointerEvents: 'none',
            transform: 'translate(-50%, -50%)',
            boxShadow: `0 0 ${particle.size}px ${particle.color}`,
          }}
        />
      ))}
    </div>
  );
};

export default ParticleContainer;