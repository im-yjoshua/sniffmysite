import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchRecentScans, ScanApiError, type ApiRecentScan } from '../lib/api';
import { TierMark } from './seals/TierMark';

/** Quiet re-check cadence — new sniffs land without a reload. */
const POLL_MS = 20_000;

/**
 * "Latest sniff" live pulse — strictly ONE site, always real, self-refreshing.
 *
 * Shows the single most recent successful scan (GET /api/vapor/recent,
 * newest first, host only). Every 20s it re-checks; when a newer scan (or a
 * re-scan with a fresh timestamp) lands, the pulse swaps to it with a brief
 * fade-rise — skipped entirely for prefers-reduced-motion (see index.css).
 * Paused while the tab is hidden, one refresh on return.
 *
 * One site, never repeated, never fabricated: on a fetch failure or an
 * empty log the pulse simply doesn't render.
 */
export function Ticker() {
  const [latest, setLatest] = useState<ApiRecentScan | null>(null);
  /** Bumps to remount the pulse content and retrigger the swap animation. */
  const [pulse, setPulse] = useState(0);
  const seen = useRef<string | null>(null);
  const firstPaint = useRef(true);

  useEffect(() => {
    let alive = true;
    const load = () => {
      fetchRecentScans()
        .then((list) => {
          if (!alive || list.length === 0) return;
          const newest = list[0];
          const stamp = `${newest.slug}@${newest.scanned_at}`;
          if (seen.current === stamp) return;
          seen.current = stamp;
          setLatest(newest);
          // Animate swaps only — not the very first paint.
          if (!firstPaint.current) setPulse((p) => p + 1);
          firstPaint.current = false;
        })
        .catch((err) => {
          if (alive && !(err instanceof ScanApiError)) throw err;
          // On failure the pulse stays hidden — never fabricate sniffs.
        });
    };
    const tick = () => {
      if (document.hidden) return;
      load();
    };
    load();
    const id = setInterval(tick, POLL_MS);
    const onVisibility = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  if (!latest) return null;

  // Dossiers are cut: the pulse links to the scan judgment.
  const to = `/scan?url=${encodeURIComponent(`https://${latest.domain}`)}`;

  return (
    <div
      className="border-t border-hairline bg-paper"
      aria-label="Latest sniff"
      aria-live="polite"
    >
      <Link
        key={pulse}
        to={to}
        className="ticker-pulse tap-target mx-auto flex min-h-[44px] w-fit max-w-full items-center gap-2.5 px-6 py-2 font-data text-sm text-ink-soft transition-colors hover:text-ink sm:py-2.5"
      >
        <span className="shrink-0 text-[13px] font-bold uppercase tracking-[0.2em] text-ink">
          Latest sniff
        </span>
        <TierMark tier={latest.tier} size={28} />
        <span className="truncate">{latest.domain}</span>
        <span className="font-bold text-ink">{latest.sniff_score}</span>
        <span className="hidden shrink-0 text-[13px] font-bold uppercase tracking-[0.18em] text-ink-faint sm:inline">
          {latest.tier}
        </span>
      </Link>
    </div>
  );
}
