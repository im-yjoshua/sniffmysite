import { useEffect, useState } from 'react';
import { ThumbSeal } from './seals/ThumbSeal';
import { TIER_TAGLINES, type TierLabel } from '../lib/tiers';

/**
 * VerdictReveal — the judgment choreography. The seal stamps in
 * (scale 1.6 → 1, 4° settle, 450ms), the verdict word fades up 150ms
 * later, then the score counts 0 → score over 900ms in mono tabular.
 * Respects prefers-reduced-motion: everything appears instantly.
 */
function useCountUp(target: number, duration = 900, delay = 400): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target);
      return;
    }
    let raf = 0;
    let started = false;
    const t0 = performance.now() + delay;
    const tick = (now: number) => {
      if (!started && now < t0) {
        raf = requestAnimationFrame(tick);
        return;
      }
      started = true;
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(eased * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, delay]);
  return value;
}

export function VerdictReveal({
  score,
  tier,
}: {
  score: number;
  tier: TierLabel;
}) {
  const shown = useCountUp(score);
  const up = score >= 50;
  const tagline = TIER_TAGLINES[tier];

  return (
    <div className="flex flex-col items-center text-center">
      <div className="seal-stamp" aria-hidden="true">
        <ThumbSeal direction={up ? 'up' : 'down'} size={128} filled />
      </div>
      <p className="verdict-rise mt-6 font-inscription text-5xl font-bold uppercase md:text-6xl">
        {tier}
      </p>
      <p
        className="verdict-rise mt-3 max-w-md font-data text-sm uppercase tracking-[0.18em] text-ink-faint"
        style={{ animationDelay: '280ms' }}
      >
        {tagline}
      </p>
      <p className="verdict-rise mt-5 font-data text-6xl font-bold tabular-nums text-hazard">
        <span className="tabular-nums">{shown}</span>
        <span className="text-2xl font-medium text-ink-faint">/100</span>
      </p>
    </div>
  );
}
