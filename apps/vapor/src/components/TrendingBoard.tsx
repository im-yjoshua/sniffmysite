import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchTrending, ScanApiError, type ApiTrendingHost } from '../lib/api';
import { RosetteBadge } from './RosetteBadge';

/**
 * "Most sniffed" — the trending board (§2.12 depth feature).
 * Fed by GET /api/vapor/trending (host only, never full URLs), ranked by
 * total successful scans. Each row: rank, host, latest sniff score + mini
 * rosette, and the sniff count. Rows link to the dossier (/s/:slug) when
 * one exists, otherwise to a scan of that host.
 *
 * Honest states only: the empty tally gets a quiet "be the first" line —
 * never fabricated rows. If the API is unreachable the whole section hides.
 */
export function TrendingBoard() {
  const [hosts, setHosts] = useState<ApiTrendingHost[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchTrending()
      .then((list) => {
        if (alive) setHosts(list);
      })
      .catch((err) => {
        if (alive && !(err instanceof ScanApiError)) throw err;
        // API down: hide the section — never fake the numbers.
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (failed) return null;

  return (
    <section
      className="border-t border-hairline"
      aria-label="Most sniffed"
    >
      <div className="mx-auto max-w-6xl px-6 py-14 md:py-16">
        <p className="eyebrow text-ink-soft">Most sniffed</p>
        <p className="mt-4 max-w-2xl font-display text-2xl font-bold leading-snug tracking-tight md:text-3xl">
          The pages people keep testing.
        </p>
        {hosts.length === 0 ? (
          <p className="mt-6 text-lg leading-relaxed text-ink-soft">
            Nothing sniffed yet — be the first.
          </p>
        ) : (
          <ol className="mt-8">
            {hosts.map((h, i) => {
              const to = h.has_profile
                ? `/s/${h.slug}`
                : `/scan?url=${encodeURIComponent(`https://${h.host}`)}`;
              return (
                <li
                  key={h.slug}
                  className="border-t border-hairline last:border-b"
                >
                  <Link
                    to={to}
                    className="tap-target group flex min-h-[44px] items-center gap-4 py-3.5"
                    aria-label={`${h.host}, sniffed ${h.sniff_count} times, latest score ${h.latest_sniff_score}`}
                  >
                    <span className="w-8 shrink-0 font-data text-sm font-bold tabular-nums text-ink-faint">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <RosetteBadge tier={h.tier} size={34} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-data text-base font-bold text-ink transition-colors group-hover:text-hazard">
                        {h.host}
                      </span>
                      <span className="mt-0.5 block text-sm uppercase tracking-[0.14em] text-ink-faint">
                        {h.tier} · sniffed {h.sniff_count}{' '}
                        {h.sniff_count === 1 ? 'time' : 'times'}
                      </span>
                    </span>
                    <span className="shrink-0 font-data text-2xl font-bold tabular-nums text-hazard">
                      {h.latest_sniff_score}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
