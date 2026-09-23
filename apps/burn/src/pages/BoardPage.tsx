import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Flame } from 'lucide-react';
import { Ticker } from '../components/Ticker';
import { SiteHeader } from '../components/SiteHeader';
import { SiteFooter } from '../components/SiteFooter';
import { COMPANIES, DAYS_PER_MONTH, formatBurn, type Company } from '../lib/mock';

/**
 * /board — the full rankings page (§3.3, §3.4).
 *
 * Three tabs: Highest burn (the crown), Shortest runway ("living
 * dangerously"), Most efficient. Rankings come from GET /api/burn/board;
 * when the API is unreachable (local dev), the page falls back to the
 * fictional demo catalog sorted with the SAME rules — the fallback is
 * visibly labeled and never presented as live data.
 *
 * Efficiency definition (v1, stated on the page and in lib/board.ts on the
 * API side): lowest monthly burn per employee. Unknown/zero headcount =
 * "headcount undisclosed", sorted last. Awarded with maximum irony.
 */

type SortTab = 'burn' | 'runway' | 'efficiency';

interface BoardRowData {
  slug: string;
  domain: string;
  name: string;
  monthly_burn: number;
  runway_days_remaining: number | null;
  headcount: number | null;
  claimed: boolean;
}

interface BoardResponse {
  sort: SortTab;
  page: number;
  per_page: number;
  total: number;
  rows: BoardRowData[];
}

type FetchState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: BoardResponse; live: boolean };

const TABS: Array<{ key: SortTab; label: string; tagline: string }> = [
  { key: 'burn', label: 'Highest burn', tagline: 'the crown' },
  { key: 'runway', label: 'Shortest runway', tagline: 'living dangerously' },
  { key: 'efficiency', label: 'Most efficient', tagline: 'awarded with maximum irony' },
];

function slugify(domain: string): string {
  return domain.split('.')[0].toLowerCase();
}

function runwayDaysListed(listedAt: string, months: number): number {
  const ends = Date.parse(listedAt) + months * DAYS_PER_MONTH * 86_400_000;
  return Math.max(0, Math.round((ends - Date.now()) / 86_400_000));
}

function effOf(r: Pick<BoardRowData, 'monthly_burn' | 'headcount'>): number | null {
  if (r.headcount == null || r.headcount <= 0) return null;
  return r.monthly_burn / r.headcount;
}

/**
 * Fallback sorter — mirrors packages/api/src/lib/board.ts exactly. Used
 * only when the API is unreachable (local dev); the page says so.
 */
function sortFallback(rows: Company[], sort: SortTab): BoardRowData[] {
  const mapped: BoardRowData[] = rows.map((c) => ({
    slug: slugify(c.domain),
    domain: c.domain,
    name: c.name,
    monthly_burn: c.monthly_burn,
    runway_days_remaining: runwayDaysListed(c.listed_at, c.runway_months),
    headcount: c.headcount,
    claimed: false,
  }));
  const tie = (a: BoardRowData, b: BoardRowData) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
  return mapped.sort((a, b) => {
    if (sort === 'burn') return b.monthly_burn - a.monthly_burn || tie(a, b);
    if (sort === 'runway') {
      const da = a.runway_days_remaining;
      const db = b.runway_days_remaining;
      if (da == null && db == null) return tie(a, b);
      if (da == null) return 1;
      if (db == null) return -1;
      return da - db || b.monthly_burn - a.monthly_burn || tie(a, b);
    }
    const ea = effOf(a);
    const eb = effOf(b);
    if (ea == null && eb == null) return tie(a, b);
    if (ea == null) return 1;
    if (eb == null) return -1;
    return ea - eb || b.monthly_burn - a.monthly_burn || tie(a, b);
  });
}

function formatDays(days: number | null): string {
  if (days == null) return 'unknown';
  if (days <= 0) return '0 days · airborne';
  return `${days.toLocaleString('en-US')} days`;
}

function Headline({ row, tab }: { row: BoardRowData; tab: SortTab }) {
  if (tab === 'runway') {
    const critical = row.runway_days_remaining != null && row.runway_days_remaining < 7;
    return (
      <span className={`tabular text-right font-data text-base font-bold ${critical ? 'text-ember' : 'text-text'}`}>
        {formatDays(row.runway_days_remaining)}
      </span>
    );
  }
  if (tab === 'efficiency') {
    const eff = effOf(row);
    return eff == null ? (
      <span className="text-right font-data text-xs uppercase tracking-[0.12em] text-ash">
        headcount undisclosed
      </span>
    ) : (
      <span className="tabular text-right font-data text-base font-bold text-text">
        {formatBurn(eff)}
        <span className="text-ash">/emp</span>
      </span>
    );
  }
  return (
    <span className="tabular text-right font-data text-base font-bold text-text">
      {formatBurn(row.monthly_burn)}
    </span>
  );
}

function Secondary({ row, tab }: { row: BoardRowData; tab: SortTab }) {
  if (tab === 'burn') return <span>{formatDays(row.runway_days_remaining)}</span>;
  if (tab === 'runway') return <span>{formatBurn(row.monthly_burn)}</span>;
  return (
    <span>
      {formatBurn(row.monthly_burn)} · {row.headcount != null ? `${row.headcount} heads` : 'team: classified'}
    </span>
  );
}

/** The plan's promise: the spotlight winner's link at the top of the board. */
function SpotlightStrip() {
  const [holder, setHolder] = useState<{ name: string; slug: string; amount: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/burn/spotlight')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.current_holder) {
          setHolder({
            name: data.current_holder.name,
            slug: data.current_holder.slug,
            amount: data.current_bid,
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!holder) return null;
  return (
    <div className="mb-8 flex flex-wrap items-center justify-between gap-3 border border-divider px-4 py-3">
      <p className="font-data text-xs uppercase tracking-[0.18em] text-ash">
        <Flame className="mr-2 inline h-3.5 w-3.5 align-middle text-ember" aria-hidden="true" />
        This week&apos;s spotlight:{' '}
        <Link to={`/c/${holder.slug}`} className="text-text hover:text-ember">
          {holder.name}
        </Link>{' '}
        <span className="text-ash">— bought the crown for ${Math.round(holder.amount).toLocaleString('en-US')}</span>
      </p>
      <Link
        to="/spotlight"
        className="font-data text-xs font-bold uppercase tracking-[0.18em] text-ember hover:underline"
      >
        Outbid them →
      </Link>
    </div>
  );
}

function BoardTable({ rows, tab, offset }: { rows: BoardRowData[]; tab: SortTab; offset: number }) {
  const headlineLabel = tab === 'burn' ? 'Burn/mo' : tab === 'runway' ? 'Runway' : 'Burn/emp';
  const secondaryLabel = tab === 'burn' ? 'Runway' : tab === 'runway' ? 'Burn/mo' : 'Burn · team';
  const crowned = tab === 'burn';

  return (
    <div role="table" aria-label={`Burn board — ${tab}`}>
      <div
        className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-baseline gap-4 border-b border-divider pb-3 sm:grid-cols-[3rem_minmax(0,1fr)_10rem_9rem]"
        role="row"
      >
        <span className="font-data text-[11px] font-bold uppercase tracking-[0.18em] text-ash" role="columnheader">Rank</span>
        <span className="font-data text-[11px] font-bold uppercase tracking-[0.18em] text-ash" role="columnheader">Startup</span>
        <span className="text-right font-data text-[11px] font-bold uppercase tracking-[0.18em] text-ash" role="columnheader">{headlineLabel}</span>
        <span className="hidden text-right font-data text-[11px] font-bold uppercase tracking-[0.18em] text-ash sm:block" role="columnheader">{secondaryLabel}</span>
      </div>
      {rows.map((row, i) => {
        const rank = offset + i + 1;
        const isCrown = crowned && rank === 1;
        return (
          <Link
            key={row.slug}
            to={`/c/${row.slug}`}
            className="row-in block transition-colors hover:bg-white/[0.025]"
            style={{ animationDelay: `${Math.min(i, 10) * 50}ms` }}
          >
            <div
              className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-baseline gap-4 border-b border-divider py-5 sm:grid-cols-[3rem_minmax(0,1fr)_10rem_9rem]"
              role="row"
            >
              <span className="tabular font-data text-sm text-ash" role="cell">
                {String(rank).padStart(2, '0')}
              </span>
              <div className="min-w-0" role="cell">
                <p className="truncate font-display text-base font-bold text-text">
                  {row.name}
                  {isCrown && (
                    <span className="ml-2 inline-flex items-center gap-1 align-middle font-data text-[10px] font-bold uppercase tracking-[0.22em] text-ember">
                      <Flame className="h-3.5 w-3.5" aria-hidden="true" />
                      crown
                    </span>
                  )}
                </p>
                <p className="mt-0.5 font-data text-xs text-ash">{row.domain}</p>
              </div>
              <span role="cell" className="flex justify-end">
                <Headline row={row} tab={tab} />
              </span>
              <span role="cell" className="hidden tabular text-right font-data text-sm text-ash sm:block">
                <Secondary row={row} tab={tab} />
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export function BoardPage() {
  const [tab, setTab] = useState<SortTab>('burn');
  const [page, setPage] = useState(1);
  const [state, setState] = useState<FetchState>({ kind: 'loading' });

  useEffect(() => {
    setState({ kind: 'loading' });
    let cancelled = false;
    fetch(`/api/burn/board?sort=${tab}&page=${page}`)
      .then((res) => {
        if (!res.ok) throw new Error(`board ${res.status}`);
        return res.json();
      })
      .then((data: BoardResponse) => {
        if (!cancelled) setState({ kind: 'ready', data, live: true });
      })
      .catch(() => {
        // API down (local dev): fictional demo catalog, same ranking rules,
        // visibly labeled. Never presented as live data.
        if (!cancelled) {
          const sorted = sortFallback(COMPANIES, tab);
          const perPage = 50;
          const start = (page - 1) * perPage;
          setState({
            kind: 'ready',
            live: false,
            data: {
              sort: tab,
              page,
              per_page: perPage,
              total: sorted.length,
              rows: sorted.slice(start, start + perPage),
            },
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tab, page]);

  const tabMeta = useMemo(() => TABS.find((t) => t.key === tab)!, [tab]);
  const totalPages =
    state.kind === 'ready' ? Math.max(1, Math.ceil(state.data.total / state.data.per_page)) : 1;

  return (
    <div className="min-h-screen bg-bg text-text">
      <Ticker />
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 pb-20">
        <p className="mt-12 font-data text-[11px] uppercase tracking-[0.22em] text-ash">
          the full rankings
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight md:text-6xl">
          The Board.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-ash">
          Every listed burn, ranked three ways. Self-reported,{' '}
          <span className="italic text-text">obviously</span>.
        </p>

        <div className="mt-8 flex gap-6 border-b border-divider" role="tablist" aria-label="Board rankings">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => {
                setTab(t.key);
                setPage(1);
              }}
              className={`-mb-px border-b-2 pb-3 font-data text-xs font-bold uppercase tracking-[0.2em] transition-colors ${
                tab === t.key
                  ? 'border-ember text-ember'
                  : 'border-transparent text-ash hover:text-text'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="mt-3 font-data text-[11px] uppercase tracking-[0.18em] text-ash">
          {tabMeta.tagline}
        </p>

        <div className="mt-6">
          <SpotlightStrip />
        </div>

        {tab === 'efficiency' && (
          <p className="mb-6 max-w-2xl border-l-2 border-divider pl-4 font-data text-xs leading-relaxed text-ash">
            Most efficient = lowest monthly burn per employee. Companies that
            won&apos;t disclose headcount sort last — mystery is expensive.
          </p>
        )}

        {state.kind === 'loading' && (
          <p className="mt-10 font-data text-sm uppercase tracking-[0.2em] text-ash">
            Counting the money…
          </p>
        )}

        {state.kind === 'ready' && (
          <>
            {!state.live && (
              <p className="mb-6 border border-divider px-4 py-3 font-data text-xs uppercase tracking-[0.18em] text-ash">
                Demo data — the live board isn&apos;t reachable from here. The
                ranking rules are identical.
              </p>
            )}
            {state.data.rows.length === 0 ? (
              <p className="mt-10 max-w-xl text-ash">
                No live burners yet. List yours and be the first to waste money
                publicly.
              </p>
            ) : (
              <BoardTable rows={state.data.rows} tab={tab} offset={(state.data.page - 1) * state.data.per_page} />
            )}
            <div className="mt-8 flex items-center justify-between">
              <p className="font-data text-xs uppercase tracking-[0.18em] text-ash">
                {state.data.total.toLocaleString('en-US')} listed burners · page {state.data.page} of {totalPages}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="border border-divider px-4 py-2 font-data text-xs uppercase tracking-[0.18em] text-ash transition-colors hover:border-text hover:text-text disabled:opacity-40"
                >
                  ← Prev
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="border border-divider px-4 py-2 font-data text-xs uppercase tracking-[0.18em] text-ash transition-colors hover:border-text hover:text-text disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            </div>
            <p className="mt-8 font-data text-xs uppercase tracking-[0.18em] text-ash">
              self-reported numbers · audited by vibes · not financial advice, obviously
            </p>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
