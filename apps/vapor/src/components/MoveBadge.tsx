/**
 * MoveBadge — the honest movement ticker.
 *
 * A host's sniff-score delta vs its previous scan: ▲ in rise-green when the
 * page got more real, ▼ in roman-red when it slipped, a faint – when it
 * held its ground. `null` (single-snapshot history, e.g. seed entries)
 * renders nothing — a move is never fabricated.
 *
 * Shape and sign carry the meaning alongside color, so the signal survives
 * color blindness; the title spells it out in words for screen readers
 * and hover.
 */
export function MoveBadge({
  delta,
  className = '',
}: {
  /** Sniff-score delta vs the previous scan. Null = no history = no badge. */
  delta: number | null;
  className?: string;
}) {
  const base =
    'font-data font-bold tabular-nums whitespace-nowrap select-none';
  if (delta === null) return null;
  if (delta > 0) {
    return (
      <span
        title={`Score up ${delta} since the previous sniff`}
        aria-label={`Score up ${delta} since the previous sniff`}
        className={`${base} text-rise ${className}`}
      >
        ▲{delta}
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span
        title={`Score down ${-delta} since the previous sniff`}
        aria-label={`Score down ${-delta} since the previous sniff`}
        className={`${base} text-roman-red ${className}`}
      >
        ▼{-delta}
      </span>
    );
  }
  return (
    <span
      title="Same score as the previous sniff — held its ground"
      aria-label="Score unchanged since the previous sniff"
      className={`${base} text-ink-faint ${className}`}
    >
      –
    </span>
  );
}
