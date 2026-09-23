import type { TierLabel } from '../lib/api';

/**
 * The SniffMySite rosette — the seal for a sniff score. An original SVG:
 * a serrated circular medal in the tier's color, the tier name set across
 * the middle, two ribbon tails hanging below. Scales from the 28px
 * leaderboard chip to the 200px+ hero seal without breaking.
 *
 * Tier colors:
 *   CERTIFIED REAL gold · ALMOST REAL silver/slate · SUS orange
 *   JUST VIBES hazard red-orange · CERTIFIED FAKE sad gray
 *
 * Wherever the rosette appears at small sizes, the tier name is also
 * printed next to it as text — the seal carries the honor, the words
 * carry the information.
 */

/**
 * Tier colors live in the design tokens (--color-rosette-*) so the medals
 * remap with the theme automatically. Fills go through inline style (not
 * the fill attribute) so var() resolves in every browser's SVG.
 */
const COLORS: Record<TierLabel, string> = {
  'CERTIFIED REAL': 'var(--color-rosette-gold)',
  'ALMOST REAL': 'var(--color-rosette-slate)',
  SUS: 'var(--color-rosette-sus)',
  'JUST VIBES': 'var(--color-rosette-vibes)',
  'CERTIFIED FAKE': 'var(--color-rosette-fake)',
};

const DISC = 'var(--color-rosette-disc)';

function badgeLines(tier: TierLabel): string[] {
  const words = tier.split(' ');
  if (words.length <= 2) return [tier];
  if (words.length === 3) return [`${words[0]} ${words[1]}`, words[2]];
  return [`${words[0]} ${words[1]}`, words.slice(2).join(' ')];
}

export function RosetteBadge({
  tier,
  size,
  className = '',
}: {
  tier: TierLabel;
  size: number;
  className?: string;
}) {
  const color = COLORS[tier];

  // viewBox 120×150: medal disc centered at (60, 58) r=44, ribbons to y=146.
  const cx = 60;
  const cy = 58;
  const r = 44;
  const teeth = 24;
  const pts: string[] = [];
  for (let i = 0; i < teeth * 2; i++) {
    const a = (Math.PI * i) / teeth;
    const rad = i % 2 === 0 ? r : r * 0.87;
    pts.push(
      `${(cx + rad * Math.cos(a)).toFixed(1)},${(cy + rad * Math.sin(a)).toFixed(1)}`,
    );
  }

  const lines = badgeLines(tier);
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 1);
  // Shrink-to-fit: bold uppercase display type averages ~0.62em per glyph.
  const fontSize = Math.max(
    7,
    Math.min(r * 0.34, (r * 1.02) / (longest * 0.62)),
  );
  const lineHeight = fontSize * 1.12;
  const startY = cy - ((lines.length - 1) * lineHeight) / 2 + fontSize * 0.35;

  const y0 = cy + r * 0.42;
  const f = (n: number): string => n.toFixed(1);
  const left = `M${f(cx - r * 0.55)},${f(y0)} L${f(cx - r * 0.15)},${f(y0)} L${f(cx - r * 0.32)},${f(cy + r * 1.18)} L${f(cx - r * 0.46)},${f(cy + r * 1.02)} L${f(cx - r * 0.6)},${f(cy + r * 1.18)} Z`;
  const right = `M${f(cx + r * 0.15)},${f(y0)} L${f(cx + r * 0.55)},${f(y0)} L${f(cx + r * 0.6)},${f(cy + r * 1.18)} L${f(cx + r * 0.46)},${f(cy + r * 1.02)} L${f(cx + r * 0.32)},${f(cy + r * 1.18)} Z`;

  return (
    <svg
      width={size}
      height={(size * 150) / 120}
      viewBox="0 0 120 150"
      role="img"
      aria-label={`Verdict: ${tier}`}
      className={className}
    >
      <polygon points={pts.join(' ')} style={{ fill: color }} />
      <path d={left} style={{ fill: color }} />
      <path d={right} style={{ fill: color }} />
      <circle cx={cx} cy={cy} r={(r * 0.66).toFixed(1)} style={{ fill: DISC }} />
      <circle
        cx={cx}
        cy={cy}
        r={(r * 0.58).toFixed(1)}
        fill="none"
        style={{ stroke: color }}
        strokeWidth={Math.max(1, r * 0.03).toFixed(1)}
      />
      {lines.map((line, i) => (
        <text
          key={i}
          x={cx}
          y={(startY + i * lineHeight).toFixed(1)}
          textAnchor="middle"
          fontFamily="'Space Grotesk', 'Inter', system-ui, sans-serif"
          fontWeight={700}
          fontSize={fontSize.toFixed(1)}
          letterSpacing={1}
          style={{ fill: color }}
        >
          {line}
        </text>
      ))}
    </svg>
  );
}
