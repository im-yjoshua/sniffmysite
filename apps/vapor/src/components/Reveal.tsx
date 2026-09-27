import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Reveal — scroll reveal wrapper. Sections fade and rise 24px over
 * 500ms, once, when they enter the viewport. Under
 * prefers-reduced-motion the content simply appears.
 */
export function Reveal({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal${visible ? ' reveal-visible' : ''} ${className}`}
    >
      {children}
    </div>
  );
}
