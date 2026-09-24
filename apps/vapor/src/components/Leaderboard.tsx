import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ScanSearch } from 'lucide-react';
import {
  fetchLeaderboard,
  ScanApiError,
  type ApiLeaderboardEntry,
} from '../lib/api';
import { RosetteBadge } from './RosetteBadge';
import { SiteLogo } from './SiteLogo';

interface LeaderboardProps {
  /** Fills the hero scan box with this domain when a row is clicked. */
  onSniffAgain: (domain: string) => void;
}

/**
 * Hall of Vapor leaderboard preview — top 10 most real, real engine scores
 * (§2.3). Hairline-separated rows (not cards), tabular mono sniff scores,
 * rosette seals. Rows stagger in on load; hover lifts 1px and reveals
 * the "sniff again" affordance (§2.7). Sorted the same way as the
 * /leaderboard default (Most Real) so the two never disagree.
 */
export function Leaderboard({ onSniffAgain }: LeaderboardProps) {
  const [entries, setEntries] = useState<ApiLeaderboardEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchLeaderboard('real')
      .then((board) => {
        if (alive) setEntries(board.entries.slice(0, 10));
      })
      .catch((err) => {
        if (alive && err instanceof ScanApiError) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section id="hall-of-vapor" aria-label="Hall of Vapor leaderboard" className="w-full">
      {/* flex-wrap + min-w-0: on a 320px phone the "Top 10 · most real
          first" eyebrow (~250px, was shrink-0) plus the title exceeded the
          column, and the hero grid's min-width:auto refused to shrink —
          the whole page laid out wider than the viewport. Now the eyebrow
          drops to its own line instead of forcing overflow. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b-2 border-ink pb-3">
        <h2 className="min-w-0 font-display text-2xl font-bold uppercase tracking-tight">
          Hall of Vapor
        </h2>
        <span className="eyebrow min-w-0 text-ink-faint">
          Top 10 · most real first
        </span>
      </div>

      {failed && (
        <p className="border-b border-hairline py-8 text-center font-data text-sm text-ink-faint">
          We can&rsquo;t load the board right now. The pages remain at large.
        </p>
      )}

      {!failed && entries === null && (
        <p className="eyebrow border-b border-hairline py-8 text-center text-ink-faint">
          Loading the board…
        </p>
      )}

      {entries !== null && (
        <ol>
          {entries.map((s, i) => (
            <li key={s.domain}>
              <button
                type="button"
                onClick={() => onSniffAgain(s.domain)}
                style={{ animationDelay: `${i * 55}ms` }}
                className="row-in group flex w-full items-center gap-3 border-b border-hairline py-3.5 text-left transition-transform duration-150 hover:-translate-y-px focus-visible:-translate-y-px sm:gap-4"
                title={`Sniff ${s.domain} again`}
                aria-label={`Sniff ${s.domain} again`}
              >
                <span className="w-8 shrink-0 font-data text-sm font-medium tabular-nums text-ink-faint">
                  {String(i + 1).padStart(2, '0')}
                </span>

                <SiteLogo domain={s.domain} size="sm" />

                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate font-display text-base font-bold leading-tight"
                    title={s.domain}
                  >
                    {s.domain}
                  </span>
                  <span className="block font-data text-xs font-medium uppercase tracking-[0.14em] text-ink-faint">
                    {s.tier}
                  </span>
                </span>

                <span className="w-14 shrink-0 text-right font-data text-xl font-bold tabular-nums text-hazard">
                  {s.sniff_score}
                </span>

                <span className="hidden w-12 shrink-0 justify-end md:flex">
                  <RosetteBadge tier={s.tier} size={40} />
                </span>

                {/* Always visible on phones — there's no hover on touch.
                    Icon-only so the domain name gets the room. */}
                <span className="tap-target flex h-11 w-11 shrink-0 items-center justify-center font-data text-sm uppercase tracking-wider text-ink-faint transition-colors hover:text-hazard group-hover:text-hazard md:opacity-0 md:transition-opacity md:duration-150 md:group-hover:opacity-100 md:group-focus-visible:opacity-100">
                  <ScanSearch className="h-4 w-4" strokeWidth={2} />
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}

      <Link
        to="/leaderboard"
        className="tap-target mt-4 inline-flex items-center gap-2 font-data text-sm font-medium uppercase tracking-[0.18em] text-ink-soft transition-colors hover:text-hazard"
      >
        Full board
        <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
      </Link>
    </section>
  );
}
