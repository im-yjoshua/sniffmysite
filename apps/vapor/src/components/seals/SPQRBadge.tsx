/**
 * SPQR Badge — a small stamped plate: "SNIFF·MY·SITE" in mono,
 * flanked by laurel ticks. For the footer, the share-card watermark,
 * anywhere the house mark needs to sit quietly.
 */
export function SPQRBadge({
  className = '',
  title = 'Sniff My Site',
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 132 36"
      className={className}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <rect
        x={1}
        y={1}
        width={130}
        height={34}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      />
      {/* laurel ticks */}
      <g stroke="currentColor" strokeWidth={2} strokeLinecap="round">
        <path d="M10 18 l4 -5 M10 18 l4 5" />
        <path d="M122 18 l-4 -5 M122 18 l-4 5" />
      </g>
      <text
        x={66}
        y={19}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="'JetBrains Mono', ui-monospace, monospace"
        fontSize={11}
        letterSpacing={1.5}
        fill="currentColor"
      >
        SNIFF·MY·SITE
      </text>
    </svg>
  );
}
