import type { TierLabel } from '../../lib/tiers';
import { ThumbGlyph } from './ThumbSeal';
import { Laurel } from './Laurel';

/**
 * TierMark — the five small seals, one per tier. Simplified variants at
 * small size for leaderboard rows, the live feed, share cards.
 *
 *   LAUREATE   — laurel wreath (gold, victory)
 *   GLADIATOR  — thumb up (a proven fighter)
 *   RECRUIT    — hollow ring (unproven, the wax not yet pressed)
 *   JESTER     — thumb sideways (the crowd laughs, not with you)
 *   LION FOOD  — thumb down (thrown to the lions)
 */
const COLORS: Record<TierLabel, string> = {
  LAUREATE: 'var(--color-seal-laureate)',
  GLADIATOR: 'var(--color-seal-gladiator)',
  RECRUIT: 'var(--color-seal-recruit)',
  JESTER: 'var(--color-seal-jester)',
  'LION FOOD': 'var(--color-seal-lionfood)',
};

export function TierMark({
  tier,
  size = 24,
  className = '',
}: {
  tier: TierLabel;
  size?: number;
  className?: string;
}) {
  const color = COLORS[tier];
  const label = `${tier} seal`;

  if (tier === 'LAUREATE') {
    return (
      <span
        className={className}
        style={{ width: size, height: size, color, display: 'inline-flex' }}
        role="img"
        aria-label={label}
        title={tier}
      >
        <Laurel title={label} />
      </span>
    );
  }

  if (tier === 'RECRUIT') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        className={className}
        role="img"
        aria-label={label}
      >
        <title>{label}</title>
        <circle
          cx={12}
          cy={12}
          r={8}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
        />
        <circle cx={12} cy={12} r={2.4} fill={color} />
      </svg>
    );
  }

  const direction =
    tier === 'GLADIATOR' ? 'up' : tier === 'LION FOOD' ? 'down' : 'side';
  return (
    <svg
      width={size}
      height={size}
      viewBox="18 8 60 84"
      className={className}
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      <ThumbGlyph direction={direction} color={color} strokeWidth={7} />
    </svg>
  );
}
