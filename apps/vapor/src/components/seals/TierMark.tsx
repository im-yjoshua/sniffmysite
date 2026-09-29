import type { TierLabel } from '../../lib/tiers';
import { ThumbGlyph, waxEdge } from './ThumbSeal';
import { Laurel } from './Laurel';

/**
 * TierMark — the five seals, one per tier. Small-size variants for
 * leaderboard rows, the live pulse, share cards, battle contenders.
 *
 * The arena stamps every judgment in wax: all four non-laurel tiers share
 * the same organic wax-edge ring, each with its own interior —
 *
 *   LAUREATE   — laurel wreath (gold, victory) — UNTOUCHED, the prize
 *   GLADIATOR  — wax seal, thumb up (a proven fighter, stamped deep)
 *   RECRUIT    — wax ring, unpressed center (the wax is poured, the stamp
 *                hasn't landed yet)
 *   JESTER     — wax seal, thumb sideways (the crowd laughs, not with you)
 *   LION FOOD  — wax seal, thumb down, CRACKED (condemned)
 *
 * Square 96×96 box throughout, so the mark never stretches.
 */
const COLORS: Record<TierLabel, string> = {
  LAUREATE: 'var(--color-seal-laureate)',
  GLADIATOR: 'var(--color-seal-gladiator)',
  RECRUIT: 'var(--color-seal-recruit)',
  JESTER: 'var(--color-seal-jester)',
  'LION FOOD': 'var(--color-seal-lionfood)',
};

const WAX_RING = waxEdge(48, 48, 40);

function WaxRing({ color }: { color: string }) {
  return (
    <polygon
      points={WAX_RING}
      fill="none"
      stroke={color}
      strokeWidth={5}
      strokeLinejoin="round"
    />
  );
}

/** The condemnation crack: a jagged split running edge-to-edge through the
 * LION FOOD seal — bold enough to read at 28px, where it merges with the
 * wax ring and reads as a shattered stamp. */
function Crack({ color }: { color: string }) {
  return (
    <path
      d="M26 14 L44 36 L36 52 L56 68 L46 88"
      fill="none"
      stroke={color}
      strokeWidth={5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

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
        viewBox="0 0 96 96"
        className={className}
        role="img"
        aria-label={label}
      >
        <title>{label}</title>
        <WaxRing color={color} />
        {/* the wax is poured — no stamp yet */}
        <circle cx={48} cy={48} r={7} fill={color} />
      </svg>
    );
  }

  const direction =
    tier === 'GLADIATOR' ? 'up' : tier === 'LION FOOD' ? 'down' : 'side';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      className={className}
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      <WaxRing color={color} />
      <ThumbGlyph direction={direction} color={color} strokeWidth={6} />
      {tier === 'LION FOOD' && <Crack color={color} />}
    </svg>
  );
}
