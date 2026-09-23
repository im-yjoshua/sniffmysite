import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Flame, Gavel } from 'lucide-react';
import { Ticker } from '../components/Ticker';
import { SiteHeader } from '../components/SiteHeader';
import { SiteFooter } from '../components/SiteFooter';

/**
 * /spotlight — the weekly #1 auction page (§3.3, §3.4).
 *
 * Reads the current auction from GET /api/burn/spotlight (Task 8): top paid
 * bid, holder, minimum next bid, bid ledger. The "Outbid them" CTA routes
 * into the existing spotlight_bid checkout flow on /pricing — checkout is
 * NOT rebuilt here. New auction every Monday 00:00 UTC; no cron in v1, the
 * API computes the week lazily.
 */

interface Holder {
  name: string;
  domain: string;
  slug: string;
}

interface Bid {
  amount: number;
  created_at: string;
  company: Holder;
}

interface Spotlight {
  week_start: string;
  ends_at: string;
  status: 'open' | 'closed';
  current_bid: number;
  minimum_bid_cents: number;
  current_holder: Holder | null;
  bids: Bid[];
}

type FetchState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; data: Spotlight };

function useSpotlight(): FetchState {
  const [state, setState] = useState<FetchState>({ kind: 'loading' });
  useEffect(() => {
    let cancelled = false;
    fetch('/api/burn/spotlight')
      .then((res) => {
        if (!res.ok) throw new Error(`spotlight ${res.status}`);
        return res.json();
      })
      .then((data: Spotlight) => {
        if (!cancelled) setState({ kind: 'ready', data });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

/** Ticks every second while mounted — same pattern as the company page. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** Countdown to the week boundary. Pulses softly under 1h (§3.7). */
function AuctionCountdown({ endsAt }: { endsAt: string }) {
  const now = useNow();
  const remainingMs = useMemo(() => new Date(endsAt).getTime() - now, [endsAt, now]);

  if (remainingMs <= 0) {
    return (
      <p className="font-display text-2xl font-bold text-text">
        Closed. <span className="text-ash">Counting the money.</span>
      </p>
    );
  }

  const totalSec = Math.floor(remainingMs / 1000);
  const units = [
    { value: Math.floor(totalSec / 86_400), label: 'days' },
    { value: Math.floor((totalSec % 86_400) / 3_600), label: 'hrs' },
    { value: Math.floor((totalSec % 3_600) / 60), label: 'min' },
    { value: totalSec % 60, label: 'sec' },
  ];
  const hot = remainingMs < 3_600_000; // under 1h: the paddle sweats

  return (
    <div aria-live="off">
      <p className="mb-3 font-data text-[11px] uppercase tracking-[0.22em] text-ash">
        bidding closes in
      </p>
      <div className="grid max-w-xl grid-cols-4 gap-4">
        {units.map((u) => (
          <div key={u.label} className="border-t border-divider pt-3">
            <p
              className={`tabular font-data text-4xl font-bold md:text-5xl ${
                hot ? 'pulse-soft text-ember' : 'text-text'
              }`}
            >
              {String(u.value).padStart(2, '0')}
            </p>
            <p className="mt-1 font-data text-[11px] uppercase tracking-[0.22em] text-ash">
              {u.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function OutbidCta({ label }: { label: string }) {
  return (
    <Link
      to="/pricing?product=spotlight_bid"
      className="inline-block border border-ember px-8 py-4 font-data text-xs font-bold uppercase tracking-[0.2em] text-ember transition-colors hover:bg-ember hover:text-bg"
    >
      {label}
    </Link>
  );
}

function CurrentHolder({ spot }: { spot: Spotlight }) {
  const holder = spot.current_holder;
  if (!holder) {
    return (
      <section aria-label="Current spotlight holder" className="border-y border-divider py-10">
        <p className="font-data text-[11px] uppercase tracking-[0.22em] text-ash">
          current holder
        </p>
        <p className="mt-4 font-display text-3xl font-bold tracking-tight text-text md:text-4xl">
          Nobody. <span className="text-ash">The crown is gathering dust.</span>
        </p>
        <p className="mt-3 max-w-xl text-ash">
          No one&apos;s bought the spotlight. Bold. Or broke.
        </p>
        <div className="mt-6">
          <OutbidCta label={`Take it — ${money(spot.minimum_bid_cents / 100)}`} />
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Current spotlight holder" className="border-y border-divider py-10">
      <p className="font-data text-[11px] uppercase tracking-[0.22em] text-ash">
        currently burning brightest
      </p>
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-4">
        <Link to={`/c/${holder.slug}`} className="group">
          <p className="font-display text-3xl font-bold tracking-tight text-text group-hover:text-ember md:text-4xl">
            <Flame className="mr-2 inline h-7 w-7 align-baseline text-ember" aria-hidden="true" />
            {holder.name}
          </p>
          <p className="mt-1 font-data text-sm text-ash">{holder.domain}</p>
        </Link>
        <div className="text-right">
          <p className="font-data text-[11px] uppercase tracking-[0.22em] text-ash">top bid</p>
          <p className="money-glow tabular font-data text-4xl font-bold md:text-5xl">{money(spot.current_bid)}</p>
          <p className="mt-1 font-data text-xs uppercase tracking-[0.15em] text-ash">
            next bid: {money(spot.minimum_bid_cents / 100)}+
          </p>
        </div>
      </div>
      <div className="mt-6">
        <OutbidCta label="Outbid them" />
      </div>
    </section>
  );
}

function BidLedger({ bids }: { bids: Bid[] }) {
  if (bids.length === 0) {
    return (
      <section aria-label="Bid history" className="py-10">
        <p className="font-data text-[11px] uppercase tracking-[0.22em] text-ash">bid ledger</p>
        <p className="mt-4 max-w-xl text-ash">
          Empty. The paddle-holders are still deciding how much dignity costs.
        </p>
      </section>
    );
  }
  return (
    <section aria-label="Bid history" className="py-10">
      <p className="font-data text-[11px] uppercase tracking-[0.22em] text-ash">
        bid ledger · {bids.length}
      </p>
      <div className="mt-2" role="table" aria-label="Bid history">
        {bids.map((b, i) => (
          <div
            key={`${b.created_at}-${i}`}
            role="row"
            className="grid grid-cols-[minmax(0,1fr)_7rem] items-baseline gap-4 border-b border-divider py-4"
          >
            <Link to={`/c/${b.company.slug}`} role="cell" className="min-w-0">
              <p className="truncate font-display text-base font-bold text-text hover:text-ember">
                {b.company.name}
              </p>
              <p className="mt-0.5 font-data text-xs text-ash">
                {b.company.domain} ·{' '}
                {new Date(b.created_at).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </p>
            </Link>
            <span role="cell" className="tabular text-right font-data text-base font-bold text-text">
              {money(b.amount)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function SpotlightPage() {
  const state = useSpotlight();

  return (
    <div className="min-h-screen bg-bg text-text">
      <Ticker />
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 pb-20">
        <p className="mt-12 font-data text-[11px] uppercase tracking-[0.22em] text-ash">
          the weekly auction
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight md:text-6xl">
          The Spotlight.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-ash">
          The #1 slot at the top of the board — <span className="italic text-text">bought</span>,
          not earned. New auction every Monday, 00:00 UTC. Beat the top bid by at
          least $1 to take the crown.
        </p>

        {state.kind === 'loading' && (
          <p className="mt-10 font-data text-sm uppercase tracking-[0.2em] text-ash">
            Raising the paddle…
          </p>
        )}

        {state.kind === 'error' && (
          <p className="mt-10 max-w-xl text-ash">
            The auction house is dark. The furnace hiccuped — try again in a
            minute.
          </p>
        )}

        {state.kind === 'ready' && (
          <>
            <div className="mt-10 border-t border-divider pt-8">
              {state.data.status === 'closed' ? (
                <p className="font-display text-2xl font-bold text-text">
                  This week&apos;s auction closed.{' '}
                  <span className="text-ash">
                    {state.data.current_holder
                      ? `${state.data.current_holder.name} owns the #1 slot.`
                      : 'Nobody wanted it. Awkward.'}
                  </span>
                </p>
              ) : (
                <AuctionCountdown endsAt={state.data.ends_at} />
              )}
            </div>
            <CurrentHolder spot={state.data} />
            <BidLedger bids={state.data.bids} />
          </>
        )}

        <section aria-label="Auction rules" className="border-t border-divider pt-8">
          <div className="flex items-start gap-3">
            <Gavel className="mt-0.5 h-4 w-4 shrink-0 text-ash" aria-hidden="true" />
            <div className="max-w-2xl">
              <p className="font-data text-sm text-ash">
                Winner gets their logo + link at the top of the board for 7 days.
                Bids are final — no refunds for being outbid. That&apos;s the game.
              </p>
              <p className="mt-2 font-data text-xs uppercase tracking-[0.18em] text-ash">
                self-reported numbers · audited by vibes · not financial advice, obviously
              </p>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
