/**
 * VS Medallion — two overlapping seal rings with "VS" in Cinzel.
 * For the battle page (Phase B1): two sites enter, the score decides.
 * Stroke-based, currentColor, dark-theme safe.
 */
export function VSMedallion({
  size = 72,
  className = '',
  title = 'Versus',
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={(size * 64) / 104}
      viewBox="0 0 104 64"
      className={className}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <circle
        cx={38}
        cy={32}
        r={26}
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
      />
      <circle
        cx={66}
        cy={32}
        r={26}
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
      />
      <text
        x={52}
        y={33}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Cinzel, 'Times New Roman', serif"
        fontWeight={700}
        fontSize={20}
        letterSpacing={1}
        fill="currentColor"
      >
        VS
      </text>
    </svg>
  );
}
