import { Link } from 'react-router-dom';
import { TierMark } from './seals/TierMark';
import { SiteLogo } from './SiteLogo';
import type { ApiLeaderboardEntry } from '../lib/api';

/** Trailing window the Den looks back over. */
const DEN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** How many condemned pages the Den holds. */
const DEN_SIZE = 5;

/**
 * The Lions' Den: the week's lowest sniff scores, computed fresh from the
 * board — no human picks them, the scores do. Each row links to the full
 * roast report, which carries the share card, so the shame is shareable.
 *
 * Honesty rules: only pages tested in the trailing 7 days qualify (a stale
 * low score is not this week's shame), and an empty Den says so plainly —
 * the lions are fasting, not fed with invented rows.
 */
export function LionsDen({ entries }: { entries: ApiLeaderboardEntry[] | null }) {
  const cutoff = Date.now() - DEN_WINDOW_MS;
  const condemned =
    entries === null
      ? null
      : entries
          .filter((e) => {
            const t = Date.parse(e.scanned_at);
            return Number.isFinite(t) && t >= cutoff;
          })
          .sort((x, y) => x.sniff_score - y.sniff_score)
          .slice(0, DEN_SIZE);

  return (
    <section aria-label="The Lions' Den" className="mt-16">
      <p className="eyebrow text-ink-faint">
        <em className="not-italic">Morituri te salutant</em>
      </p>
      <h2 className="mt-3 font-inscription text-3xl font-bold uppercase tracking-tight md:text-4xl">
        The Lions&rsquo; Den
      </h2>
      <p className="mt-3 max-w-2xl text-lg leading-relaxed text-ink-soft">
        The five lowest scores of the last seven days. Nobody chose them —
        the nose did. Tap any page for the full roast.
      </p>

      {condemned === null && (
        <p className="eyebrow mt-8 border-t border-hairline py-10 text-ink-faint">
          The lions are waiting…
        </p>
      )}

      {condemned !== null && condemned.length === 0 && (
        <div className="mt-8 border-t border-hairline py-10">
          <p className="font-inscription text-2xl font-bold uppercase tracking-tight">
            The lions are fasting.
          </p>
          <p className="mt-2 max-w-xl text-lg leading-relaxed text-ink-soft">
            No page tested this week scored low enough to feed them. Sniff
            a page — maybe yours will volunteer.
          </p>
        </div>
      )}

      {condemned !== null && condemned.length > 0 && (
        <ol className="mt-8 border-t border-hairline">
          {condemned.map((e, i) => (
            <li key={e.domain}>
              <Link
                to={`/scan?url=${encodeURIComponent(`https://${e.domain}`)}`}
                title={`Read the ${e.domain} roast`}
                className="group flex w-full items-center gap-3 border-b border-hairline py-4 sm:gap-4"
              >
                <span className="w-10 shrink-0 font-data text-lg font-bold tabular-nums text-roman-red">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <SiteLogo domain={e.domain} size="md" />
                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate text-lg font-bold leading-tight tracking-tight group-hover:text-hazard"
                    title={e.domain}
                  >
                    {e.domain}
                  </span>
                  <span className="block truncate font-data text-sm text-ink-faint">
                    fed to the lions {formatAgo(e.scanned_at)}
                  </span>
                </span>
                <span className="w-16 shrink-0 text-right font-data text-2xl font-bold tabular-nums text-hazard">
                  {e.sniff_score}
                </span>
                <span className="hidden w-60 shrink-0 items-center justify-end gap-3 md:flex">
                  <TierMark tier={e.tier} size={44} />
                  <span className="font-data text-sm uppercase tracking-[0.14em] text-ink-soft">
                    {e.tier}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Relative "fed Xm ago" from an ISO timestamp. No fake precision. */
function formatAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
