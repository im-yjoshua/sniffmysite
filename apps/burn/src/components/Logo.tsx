/**
 * BurnRate.lol logo mark — custom SVG, one color (§3.7).
 * A banknote with a flame licking out of its top-right corner.
 * Ember only; set via `text-ember` + currentColor so the token stays the
 * single source of truth.
 */
export function Logo({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" role="img">
      {/* banknote body */}
      <rect
        x="3"
        y="11"
        width="19"
        height="12"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      {/* the bill's denomination ring */}
      <circle cx="12.5" cy="17" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      {/* serial notches */}
      <path d="M6.5 17h.01M18.5 17h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      {/* flame escaping the top-right corner */}
      <path
        d="M21.5 10.5c1.3 2.2 3.7 2.8 3.7 5.6a3.7 3.7 0 1 1-7.4 0c0-1.6.9-2.5 1.7-3.5.4 1.1 1.1 1.8 2 1.8-.3-1.5-.3-2.6 0-3.9z"
        fill="currentColor"
      />
    </svg>
  );
}
