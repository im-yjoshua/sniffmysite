import { useId } from 'react';

/**
 * Meander Divider — the Greco-Roman key pattern as a horizontal strip.
 * A single squared-spiral unit tiled via SVG pattern; stroke-based,
 * currentColor. For section breaks, arena entrances, the space between
 * the hero and what comes after.
 */
export function MeanderDivider({ className = '' }: { className?: string }) {
  const id = useId();
  return (
    <svg
      width="100%"
      height="16"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <defs>
        <pattern
          id={id}
          width="22"
          height="16"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M2 14 H20 V4 H8 V10 H16"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
          />
        </pattern>
      </defs>
      <rect x={0} y={0} width="100%" height={16} fill={`url(#${id})`} />
    </svg>
  );
}
