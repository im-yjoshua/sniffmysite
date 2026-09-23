import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ScanSearch } from 'lucide-react';
import {
  fetchLeaderboard,
  ScanApiError,
  type ApiLeaderboardEntry,
  type LeaderboardSort,
} from '../lib/api';
import { CATEGORIES, categoryFor, type CategoryKey } from '../lib/categories';
import { RosetteBadge } from '../components/RosetteBadge';
import { SiteLogo } from '../components/SiteLogo';
import { JudgingCriteria } from '../components/JudgingCriteria';

const TABS: Array<{ key: LeaderboardSort; label: string }> = [
  { key: 'real', label: 'Most Real' },
  { key: 'vapor', label: 'Most Vapor' },
  { key: 'improved', label: 'Most Improved' },
];

/** The board quietly re-checks for new scans on this interval (15–30s spec). */
const POLL_MS = 20_000;

/** Per-tab subcopy: the default board is a prize, not a shaming. */
const TAB_SUBLINES: Record<LeaderboardSort, string> = {
  real: 'The most honest pages on the internet — highest sniff score first. #1 is the prize. Every founder wants this spot.',
  vapor: 'The Wall of Shame — most vapor first. #1 is the vaporest page we\u2019ve ever tested. Say cheese.',
  improved: 'Redemption arcs — pages that fixed their copy and re-tested. Ranked by biggest glow-up.',
};

/**
 * Hall of Vapor — the full sortable board (§2.3, Task 6).
 * Hairline-separated rows, tabular mono scores, mini rosette seals — a lab
 * ledger, not a dashboard. Data is real: engine-scored public landing pages.
 */
export function LeaderboardPage() {
  const [sort, setSort] = useState<LeaderboardSort>('real');
  const [category, setCategory] = useState<'all' | CategoryKey>('all');
  const [entries, setEntries] = useState<ApiLeaderboardEntry[] | null>(null);
  const [error, setError] = useState(false);

  // Stale-response guard: tab switches and poll ticks can overlap in
  // flight, and only the newest load may write.
  const seqRef = useRef(0);

  /**
   * Hard load (default) wipes the board and shows the loading line —
   * used for tab switches and the retry button. Soft load (the quiet
   * poll) keeps the old rows on screen: success swaps the data in place,
   * failure fails silently and the next tick retries. Either way the
   * scroll position and the selected tab never move.
   */
  const load = useCallback(async (s: LeaderboardSort, opts?: { soft?: boolean }) => {
    const my = ++seqRef.current;
    const soft = opts?.soft === true;
    if (!soft) {
      setEntries(null);
      setError(false);
    }
    try {
      const board = await fetchLeaderboard(s);
      if (seqRef.current !== my) return;
      setEntries(board.entries);
      setError(false);
    } catch (err) {
      if (err instanceof ScanApiError) {
        if (seqRef.current !== my) return;
        if (!soft) setError(true);
      } else throw err;
    }
  }, []);

  // Hard load on mount and every tab switch — the user asked for a new view.
  useEffect(() => {
    void load(sort);
  }, [sort, load]);

  // Quiet poll: new scans land on the board without a reload. Paused
  // while the tab is hidden (Page Visibility API); when the tab comes
  // back it refreshes once instead of waiting out the timer. Rows are
  // keyed by domain, so React updates them in place — no full-page flash.
  const sortRef = useRef(sort);
  sortRef.current = sort;
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    const tick = () => {
      if (document.hidden) return;
      void loadRef.current(sortRef.current, { soft: true });
    };
    const id = setInterval(tick, POLL_MS);
    const onVisibility = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const allDeltasNull =
    entries !== null && entries.every((e) => e.delta === null);

  /** Category counts from the loaded board — real entries, not invented. */
  const counts = useMemo(() => {
    const map = new Map<CategoryKey, number>();
    for (const e of entries ?? []) {
      const c = categoryFor(e.domain);
      map.set(c, (map.get(c) ?? 0) + 1);
    }
    return map;
  }, [entries]);

  const filtered = useMemo(
    () =>
      entries?.filter(
        (e) => category === 'all' || categoryFor(e.domain) === category,
      ) ?? null,
    [entries, category],
  );

  return (
    <main className="mx-auto max-w-6xl px-6 pb-20 pt-12 md:pt-16">
      <p className="eyebrow text-ink-soft">
        The official ranking
      </p>
      <h1 className="mt-4 font-display text-5xl font-bold tracking-tight md:text-6xl">
        Hall of Vapor
      </h1>
      <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-soft">
        {entries === null
          ? 'Testing pages and ranking them.'
          : `${entries.length} startup pages tested and ranked.`}{' '}
        {TAB_SUBLINES[sort]} Think a score is wrong? Sniff the page again.
      </p>

      {/* Category pills — actually filters the board. */}
      <div
        role="group"
        aria-label="Filter by category"
        className="mt-10 flex flex-wrap gap-2.5"
      >
        <button
          type="button"
          aria-pressed={category === 'all'}
          onClick={() => setCategory('all')}
          className={`tap-target rounded-full border px-5 py-2.5 font-data text-sm font-medium uppercase tracking-[0.14em] transition-colors ${
            category === 'all'
              ? 'border-hazard bg-hazard text-paper'
              : 'border-hairline bg-paper text-ink-soft hover:border-ink-soft hover:text-ink'
          }`}
        >
          All · {entries?.length ?? '…'}
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            aria-pressed={category === c.key}
            onClick={() => setCategory(c.key)}
            className={`tap-target rounded-full border px-5 py-2.5 font-data text-sm font-medium uppercase tracking-[0.14em] transition-colors ${
              category === c.key
                ? 'border-hazard bg-hazard text-paper'
                : 'border-hairline bg-paper text-ink-soft hover:border-ink-soft hover:text-ink'
            }`}
          >
            {c.label} · {counts.get(c.key) ?? 0}
          </button>
        ))}
      </div>

      {/* Sort tabs — scrolls sideways on phones instead of squeezing. */}
      <div
        role="tablist"
        aria-label="Leaderboard sort"
        className="mt-10 flex gap-4 overflow-x-auto border-b border-hairline sm:gap-8"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={sort === t.key}
            onClick={() => setSort(t.key)}
            className={`tap-target -mb-px shrink-0 border-b-2 pb-3 font-data text-sm font-medium uppercase tracking-[0.14em] transition-colors ${
              sort === t.key
                ? 'border-hazard text-ink'
                : 'border-transparent text-ink-faint hover:text-ink-soft'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="border-b border-hairline py-16 text-center">
          <p className="font-display text-2xl font-bold">
            We can&rsquo;t load the rankings right now.
          </p>
          <p className="mt-2 text-base text-ink-faint">
            We couldn&rsquo;t reach our score list.
          </p>
          <button
            onClick={() => load(sort)}
            className="tap-target mt-6 inline-flex items-center font-data text-sm font-medium uppercase tracking-[0.18em] text-hazard hover:underline"
          >
            Try again
          </button>
        </div>
      )}

      {!error && entries === null && (
        <p className="eyebrow border-b border-hairline py-16 text-center text-ink-faint">
          Loading the rankings…
        </p>
      )}

      {!error &&
        filtered !== null &&
        sort === 'improved' &&
        allDeltasNull && (
        <div className="border-b border-hairline py-16 text-center md:py-20">
          <p className="font-display text-3xl font-bold tracking-tight md:text-4xl">
            No redemption arcs yet.
          </p>
          <p className="mx-auto mt-4 max-w-md text-lg leading-relaxed text-ink-soft">
            Nobody has fixed their page and re-tested yet. This board is
            empty — for now. Be the first.
          </p>
          <Link
            to="/"
            className="tap-target mt-8 inline-flex items-center gap-2 font-data text-sm font-medium uppercase tracking-[0.18em] text-hazard hover:underline"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2.25} />
            Back to the start
          </Link>
        </div>
      )}

      {!error &&
        filtered !== null &&
        !(sort === 'improved' && allDeltasNull) && (
          <ol key={`${sort}-${category}`} aria-label={`Leaderboard sorted by ${sort}`}>
            {filtered.map((e, i) => (
              <li key={e.domain}>
                <div
                  style={{ animationDelay: `${Math.min(i, 19) * 40}ms` }}
                  className="row-in group flex w-full items-center gap-3 border-b border-hairline py-4 transition-transform duration-150 hover:-translate-y-px focus-within:-translate-y-px sm:gap-4"
                >
                  <Link
                    to={`/s/${e.domain}`}
                    title={`Open the ${e.domain} report`}
                    className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4"
                  >
                    <span className={`w-10 shrink-0 font-display text-lg font-bold tabular-nums ${
                      i === 0 && sort === 'real' ? 'text-gold' : 'text-ink-faint'
                    }`}>
                      {String(i + 1).padStart(2, '0')}
                    </span>

                    <SiteLogo domain={e.domain} size="md" />

                    <span className="min-w-0 flex-1">
                      <span
                        className="block truncate font-display text-lg font-bold leading-tight tracking-tight"
                        title={e.domain}
                      >
                        {e.domain}
                      </span>
                      <span className="block truncate font-data text-sm text-ink-faint">
                        {CATEGORIES.find((c) => c.key === categoryFor(e.domain))?.label}{' · '}
                        tested {formatAgo(e.scanned_at)}
                      </span>
                    </span>

                    <span className={`w-16 shrink-0 text-right font-data text-2xl font-bold tabular-nums ${
                      i === 0 && sort === 'real' ? 'text-gold' : 'text-hazard'
                    }`}>
                      {e.sniff_score}
                    </span>

                    {e.delta !== null && (
                      <span
                        className="hidden w-16 shrink-0 text-right font-data text-base font-bold tabular-nums text-ink sm:block"
                        title={`Score change since the first sniff: ${e.delta > 0 ? '+' : ''}${e.delta}`}
                      >
                        Δ{e.delta > 0 ? '+' : ''}
                        {e.delta}
                      </span>
                    )}

                    <span className="hidden w-60 shrink-0 items-center justify-end gap-3 md:flex">
                      <RosetteBadge tier={e.tier} size={44} />
                      <span className="font-data text-sm uppercase tracking-[0.14em] text-ink-soft">
                        {e.tier}
                      </span>
                    </span>
                  </Link>

                  {/* Always visible on phones — there's no hover on touch.
                      Icon-only on small phones so the domain name fits.
                      px-3.5 keeps the icon-only hit area a full 44px wide. */}
                  <Link
                    to={`/scan?url=${encodeURIComponent(`https://${e.domain}`)}`}
                    title={`Sniff ${e.domain} again`}
                    className="tap-target flex shrink-0 items-center justify-end gap-1 px-3.5 font-data text-sm uppercase tracking-wider text-ink-faint transition-colors hover:text-hazard group-hover:text-hazard md:opacity-0 md:transition-opacity md:duration-150 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
                  >
                    <ScanSearch className="h-4 w-4" strokeWidth={2} />
                    <span className="hidden min-[400px]:inline">test again</span>
                  </Link>
                </div>
              </li>
            ))}
          </ol>
        )}

      <div className="mt-16">
        <JudgingCriteria />
      </div>

      <p className="mt-6 text-[13px] uppercase tracking-[0.14em] text-ink-faint">
        Every score comes from reading a public web page. Sniff any page
        again anytime.
      </p>
    </main>
  );
}

/** Relative "sniffed Xm ago" from an ISO timestamp. No fake precision. */
function formatAgo(iso: string): string {
  const mins = Math.max(
    0,
    Math.round((Date.now() - Date.parse(iso)) / 60000),
  );
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
