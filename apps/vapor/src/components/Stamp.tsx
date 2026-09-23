interface StampProps {
  /** Verdict text, e.g. "CERTIFIED VAPOR". */
  label: string;
  /** Hazard orange for vapor verdicts; ink for CERTIFIED REAL / MOSTLY HARMLESS. */
  tone?: 'hazard' | 'ink';
  size?: 'sm' | 'md' | 'lg';
  /** Re-triggers the 300ms stamp-in animation when the key changes. */
  animateKey?: string | number;
  className?: string;
}

/**
 * The rubber-stamp verdict (§2.7). Rotated, triple-ringed, worn ink edges,
 * stamps in with a 400ms thud (scale + rotation settle). PURE UNCUT VAPOR —
 * and only that tier — lands FILLED, the lab's loudest mark. One of the
 * three brand differentiators alongside the mono data type and the deadpan
 * lab voice.
 */
export function Stamp({ label, tone = 'hazard', size = 'md', animateKey, className = '' }: StampProps) {
  const sizeClass = size === 'sm' ? 'stamp-sm' : size === 'lg' ? 'stamp-lg' : '';
  const toneClass = tone === 'ink' ? 'stamp-ink' : '';
  const solidClass = label === 'PURE UNCUT VAPOR' ? 'stamp-solid' : '';
  return (
    <span
      key={animateKey}
      className={`stamp animate-stamp-in ${sizeClass} ${toneClass} ${solidClass} ${className}`}
      aria-label={`Verdict: ${label}`}
    >
      {label}
    </span>
  );
}
