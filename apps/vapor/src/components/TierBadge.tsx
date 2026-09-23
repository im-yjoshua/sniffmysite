import type { TierLabel } from '../lib/api';

/**
 * The circular tier badge — our rubber-stamp seal as a reusable SVG.
 * Mirrors the share-card PNG's tierBadgeSVG (double ring, −8° slam,
 * PURE UNCUT VAPOR filled). Used in the share popup and anywhere else a
 * compact tier mark is needed.
 */
const INK: Record<TierLabel, string> = {
  'CERTIFIED REAL': '#141310',
  'MOSTLY HARMLESS': '#141310',
  SUS: '#C23A00',
  'CERTIFIED VAPOR': '#C23A00',
  'PURE UNCUT VAPOR': '#C23A00',
};

function badgeLines(tier: TierLabel): string[] {
  switch (tier) {
    case 'CERTIFIED REAL':
      return ['CERTIFIED', 'REAL'];
    case 'MOSTLY HARMLESS':
      return ['MOSTLY', 'HARMLESS'];
    case 'SUS':
      return ['SUS'];
    case 'CERTIFIED VAPOR':
      return ['CERTIFIED', 'VAPOR'];
    case 'PURE UNCUT VAPOR':
      return ['PURE UNCUT', 'VAPOR'];
  }
}

export function TierBadge({
  tier,
  size = 120,
  className = '',
}: {
  tier: TierLabel;
  size?: number;
  className?: string;
}) {
  const color = INK[tier];
  const solid = tier === 'PURE UNCUT VAPOR';
  const fg = solid ? '#FAF8F4' : color;
  const lines = badgeLines(tier);
  const longest = lines.reduce((a, b) => (a.length >= b.length ? a : b));
  // Shrink-to-fit for the longest line inside the ring (0–100 viewBox).
  const fontSize = Math.max(
    9,
    Math.min(17, (72 / Math.max(1, longest.length)) * 1.55),
  );
  const gap = fontSize * 1.12;
  const firstY = 50 - ((lines.length - 1) * gap) / 2 + fontSize * 0.36;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={`Tier: ${tier}`}
      className={className}
    >
      <g transform="rotate(-8 50 50)">
        <circle
          cx="50"
          cy="50"
          r="45"
          fill={solid ? color : '#FAF8F4'}
          stroke={color}
          strokeWidth="5"
        />
        <circle
          cx="50"
          cy="50"
          r="36"
          fill="none"
          stroke={fg}
          strokeWidth="1.6"
        />
        <circle cx="50" cy="9.5" r="2" fill={fg} />
        <circle cx="50" cy="90.5" r="2" fill={fg} />
        {lines.map((ln, i) => (
          <text
            key={ln}
            x="50"
            y={(firstY + i * gap).toFixed(1)}
            textAnchor="middle"
            fontFamily="'JetBrains Mono',monospace"
            fontWeight="700"
            fontSize={fontSize.toFixed(1)}
            letterSpacing="1"
            fill={fg}
          >
            {ln}
          </text>
        ))}
      </g>
    </svg>
  );
}
