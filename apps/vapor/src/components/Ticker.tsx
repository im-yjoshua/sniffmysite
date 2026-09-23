import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchRecentScans, ScanApiError, type ApiRecentScan } from '../lib/api';
import { RosetteBadge } from './RosetteBadge';

/** Quiet re-check cadence — new sniffs land without a reload. */
const POLL_MS = 20_000;

/**
 * Defensive client-side dedupe: the API log is "latest scan per host,
 * newest first", but if a stale response ever carries a host twice the
 * tape shouldn't show it double. First occurrence (newest) wins.
 */
function dedupeBySlug(list: ApiRecentScan[]): ApiRecentScan[] {
  const seen = new Set<string>();
  return list.filter((s) => {
    if (seen.has(s.slug)) return false;
    seen.add(s.slug);
    return true;
  });
}

/**
 * "Latest sniffs" ticker — a quiet marquee tape of the most recent
 * successful scans, fed by GET /api/vapor/recent (newest first, host only).
 *
 * Each item: the site's host, its sniff score, and a 28px rosette in the
 * tier's color. Items link to the dossier (/s/:slug) when one exists,
 * otherwise to a scan of that host. Polls every 20s so fresh scans appear
 * without a reload — paused while the tab is hidden, one refresh on
 * return. Pauses on hover AND on focus-within;
 * prefers-reduced-motion renders a static list (see index.css). On a fetch
 * failure or an empty log the ticker simply doesn't render — a missing
 * tape beats a fabricated one.
 */
export function Ticker() {
  const [scans, setScans] = useState<ApiRecentScan[]>([]);

  useEffect(() => {
    let alive = true;
    const load = () => {
      fetchRecentScans()
        .then((list) => {
          if (alive) setScans(dedupeBySlug(list));
        })
        .catch((err) => {
          if (alive && !(err instanceof ScanApiError)) throw err;
          // On failure the tape stays hidden — never fabricate sniffs.
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

  if (scans.length === 0) return null;

  // Two copies for a seamless -50% loop; the duplicate is aria-hidden.
  const loop = [...scans, ...scans];

  return (
    <div className="marquee border-t border-hairline bg-paper" aria-label="Latest sniffs">
      <div className="marquee-track py-2 sm:py-2.5">
        <span className="mx-5 shrink-0 font-data text-[13px] font-bold uppercase tracking-[0.2em] text-ink">
          Latest sniffs
        </span>
        {loop.map((s, i) => (
          <TickerItem key={`${s.slug}-${i}`} scan={s} hidden={i >= scans.length} />
        ))}
      </div>
    </div>
  );
}

function TickerItem({ scan, hidden }: { scan: ApiRecentScan; hidden: boolean }) {
  const to = scan.has_profile
    ? `/s/${scan.slug}`
    : `/scan?url=${encodeURIComponent(`https://${scan.domain}`)}`;
  return (
    <span aria-hidden={hidden || undefined} className="mx-5 shrink-0">
      <Link
        to={to}
        tabIndex={hidden ? -1 : undefined}
        className="tap-target inline-flex min-h-[44px] items-center gap-2.5 whitespace-nowrap font-data text-sm text-ink-soft transition-colors hover:text-ink"
      >
        <RosetteBadge tier={scan.tier} size={28} />
        <span className="truncate">{scan.domain}</span>
        <span className="font-bold text-ink">{scan.sniff_score}</span>
      </Link>
    </span>
  );
}
