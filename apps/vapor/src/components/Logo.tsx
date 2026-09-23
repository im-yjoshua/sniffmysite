/**
 * VaporRank logo mark — custom SVG, one color (§2.7).
 * A nose's scent lines rising off an ascending bar chart.
 * The tallest bar carries the hazard accent; everything else is ink.
 */
export function Logo({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" role="img">
      {/* ascending bars */}
      <rect x="4" y="21" width="5" height="7" fill="currentColor" opacity="0.45" />
      <rect x="11" y="16" width="5" height="12" fill="currentColor" opacity="0.7" />
      <rect x="18" y="10" width="5" height="18" fill="currentColor" />
      {/* hazard tip on the tallest bar — token-driven so it tracks the theme */}
      <rect x="18" y="10" width="5" height="4" style={{ fill: 'var(--color-hazard)' }} />
      {/* scent lines */}
      <path
        d="M20.5 6.5c-1.2-1.6-1.2-3.2 0-4.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        d="M24.5 7.5c-1.2-1.6-1.2-3.2 0-4.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M16.5 6c-1-1.3-1-2.6 0-3.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.35"
      />
    </svg>
  );
}
