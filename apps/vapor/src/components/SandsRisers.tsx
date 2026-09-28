import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TierMark } from './seals/TierMark';
import { SiteLogo } from './SiteLogo';
import {
  fetchMovers,
  ScanApiError,
  type ApiMoverRow,
} from '../lib/api';

/** How many risers the section shows. */
const RISERS_SIZE = 5;

/**
 * Rise from the Sands: the week's biggest comebacks, auto-computed from
 * the movers endpoint (hosts with ≥2 same-version scans in the trailing
 * 7 days, ranked by score gain). Nobody curates it — the deltas do.
 *
 * On a fetch failure the section stays hidden: a missing section beats a
 * fabricated one. When the window is thin the API says so honestly and we
 * print its note.
 */
export function SandsRisers() {
  const [risers, setRisers] = useState<ApiMoverRow[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchMovers('7d')
      .then((m) => {
        if (!alive) return;
        setRisers(m.gainers.slice(0, RISERS_SIZE));
        setNote(m.note ?? null);
      })
      .catch((err) => {
        if (!alive) return;
        if (err instanceof ScanApiError) setFailed(true);
        else throw err;
      });
    return () => {
      alive = false;
    };
  }, []);

  if (failed) return null;

  return (
    <section aria-label="Rise from the Sands" className="mt-16">
      <p className="eyebrow text-ink-faint">This week&rsquo;s comebacks</p>
      <h2 className="mt-3 font-inscription text-3xl font-bold uppercase tracking-tight md:text-4xl">
        Rise from the Sands
      </h2>
      <p className="mt-3 max-w-2xl text-lg leading-relaxed text-ink-soft">
        Pages that fixed their copy and climbed back up — the five biggest
        score gains of the last seven days.
      </p>

      {risers === null && (
        <p className="eyebrow mt-8 border-t border-hairline py-10 text-ink-faint">
          Watching the sands…
        </p>
      )}

      {risers !== null && risers.length === 0 && (
        <div className="mt-8 border-t border-hairline py-10">
          <p className="font-inscription text-2xl font-bold uppercase tracking-tight">
            The sands are empty.
          </p>
          <p className="mt-2 max-w-xl text-lg leading-relaxed text-ink-soft">
            {note ??
              'Nobody has fixed their page and re-tested this week. Be the first to rise.'}
          </p>
        </div>
      )}

      {risers !== null && risers.length > 0 && (
        <>
          <ol className="mt-8 border-t border-hairline">
            {risers.map((r, i) => (
              <li key={r.domain}>
                <Link
                  to={`/scan?url=${encodeURIComponent(`https://${r.domain}`)}`}
                  title={`Read the ${r.domain} roast`}
                  className="group flex w-full items-center gap-3 border-b border-hairline py-4 sm:gap-4"
                >
                  <span className="w-10 shrink-0 font-data text-lg font-bold tabular-nums text-gold">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <SiteLogo domain={r.domain} size="md" />
                  <span className="min-w-0 flex-1">
                    <span
                      className="block truncate text-lg font-bold leading-tight tracking-tight group-hover:text-hazard"
                      title={r.domain}
                    >
                      {r.domain}
                    </span>
                    <span className="block truncate font-data text-sm tabular-nums text-ink-faint">
                      {r.old_score} → {r.new_score}
                    </span>
                  </span>
                  <span
                    className="w-20 shrink-0 text-right font-data text-2xl font-bold tabular-nums text-ink"
                    title={`Climbed ${r.delta} points this week`}
                  >
                    +{r.delta}
                  </span>
                  <span className="hidden w-60 shrink-0 items-center justify-end gap-3 md:flex">
                    <TierMark tier={r.tier} size={44} />
                    <span className="font-data text-sm uppercase tracking-[0.14em] text-ink-soft">
                      {r.tier}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
          {note && (
            <p className="mt-4 text-base leading-relaxed text-ink-faint">
              {note}
            </p>
          )}
        </>
      )}
    </section>
  );
}
