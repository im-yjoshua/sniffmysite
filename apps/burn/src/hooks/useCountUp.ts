import { useEffect, useRef, useState } from 'react';

/**
 * Count-up hook for money reveals (§3.7 — "number tickers count on load").
 * Animates 0 → target with an easeOutExpo curve over `duration` ms.
 * Starts when `start` flips true; resets to 0 when it flips false.
 * Jumps straight to the target when the user prefers reduced motion.
 */
export function useCountUp(target: number, start: boolean, duration = 1200): number {
  const [value, setValue] = useState(0);
  const raf = useRef<number>(0);

  useEffect(() => {
    if (!start) {
      setValue(0);
      return;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target);
      return;
    }
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      setValue(Math.round(target * eased));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, start, duration]);

  return value;
}
