/**
 * RomeBackdrop — the arena's stone under everything.
 *
 * A fixed-geometry whisper of Roman ashlar masonry (opus quadratum): large
 * stone courses in running bond, drawn as 1px hairlines in the theme's
 * hairline token at half strength. Evocative, not costume — no columns, no
 * clip-art, no gradients. The hairline token already remaps for dark mode,
 * so the wall reads on both parchment and the arena at night.
 *
 * Static (no animation — reduced-motion safe) and pointer-transparent.
 * Mounted as the first child of the app root, which is `relative`.
 */
export function RomeBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden opacity-50"
    >
      <svg className="h-full w-full" aria-hidden="true">
        <defs>
          {/* 360 × 240 course: two 120px stone rows, joints offset per row
              (running bond, the way Roman walls were actually laid). */}
          <pattern
            id="rome-ashlar"
            width="360"
            height="240"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M0 0 H360 M0 120 H360 M0 240 H360 M180 0 V120 M90 120 V240 M270 120 V240 M0 120 V240 M360 0 V120"
              fill="none"
              stroke="var(--color-hairline)"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#rome-ashlar)" />
      </svg>
    </div>
  );
}
