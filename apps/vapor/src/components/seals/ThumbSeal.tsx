/**
 * The Thumb Seal — the signature of the arena. A wax-seal circle (double
 * ring, slightly irregular edge) containing a thumb rendered in four
 * confident strokes. Thumb-up seals burn hazard (torch flame); thumb-down
 * seals burn roman-red (condemned). The emperor's judgment, stamped.
 *
 * Stroke-based, currentColor-free: colors come from the design tokens so
 * the seal remaps with the theme. Every seal carries a <title> for a11y.
 */

interface ThumbSealProps {
  direction: 'up' | 'down';
  size?: number;
  /** Solid wax disc (verdict moments) vs ring (inline marks). */
  filled?: boolean;
  title?: string;
  className?: string;
}

/** Wax edge: a circle with a subtle organic wobble. Deterministic — the
 * same seal every render. */
function waxEdge(cx: number, cy: number, r: number, teeth = 44): string {
  const pts: string[] = [];
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const wobble = 1.7 * Math.sin(3 * a + 1.1) + 1.0 * Math.cos(5 * a + 0.5);
    const rr = r + wobble;
    pts.push(
      `${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`,
    );
  }
  return pts.join(' ');
}

/**
 * The thumb glyph alone — four strokes in a 96×96 box, drawn thumb-up.
 * Reused by TierMark (which rotates it for the sideways/down variants).
 */
export function ThumbGlyph({
  direction = 'up',
  color = 'currentColor',
  strokeWidth = 5.5,
}: {
  direction?: 'up' | 'down' | 'side';
  color?: string;
  strokeWidth?: number;
}) {
  const transform =
    direction === 'down'
      ? 'translate(0 96) scale(1 -1)'
      : direction === 'side'
        ? 'rotate(90 48 48)'
        : undefined;
  return (
    <g
      transform={transform}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* the thumb, rising */}
      <path d="M41 44 C41 35 42 29 46 25 C48 23 51 24 51 27 L51 44" />
      {/* the fist */}
      <path d="M35 50 Q35 44 41 44 L57 44 Q63 44 63 50 L63 62 Q63 68 57 68 L41 68 Q35 68 35 62 Z" />
      {/* knuckle ticks */}
      <path d="M43 52.5 H55 M43 59.5 H55" />
      {/* the wrist */}
      <path d="M45 68 V76" />
    </g>
  );
}

export function ThumbSeal({
  direction,
  size = 96,
  filled = false,
  title,
  className = '',
}: ThumbSealProps) {
  const color =
    direction === 'up' ? 'var(--color-hazard)' : 'var(--color-roman-red)';
  const label =
    title ?? (direction === 'up' ? 'The thumb is up' : 'The thumb is down');
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
      <polygon
        points={waxEdge(48, 48, 42)}
        fill={filled ? color : 'none'}
        stroke={color}
        strokeWidth={filled ? 2 : 5}
        strokeLinejoin="round"
      />
      {!filled && (
        <circle
          cx={48}
          cy={48}
          r={34}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          opacity={0.6}
        />
      )}
      <ThumbGlyph
        direction={direction}
        color={filled ? 'var(--color-paper)' : color}
      />
    </svg>
  );
}
