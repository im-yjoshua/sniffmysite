import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { MeanderDivider } from '../components/seals/MeanderDivider';
import { fetchThrone, createThroneCheckout, type ThroneState } from '../lib/api';

/**
 * Pricing — the throne auction.
 *
 * The forum sells exactly ONE thing: the spotlight atop the Grand Hall.
 * Bidding opens at $19; stealing the throne costs $3 more than the
 * current holder paid. A paid bid takes the throne immediately and holds
 * it up to 3 days. The bid form collects the site URL first (validated
 * before any money moves), then POSTs to /api/vapor/throne/checkout,
 * which creates one Polar ad-hoc-price session per bid — the buyer pays
 * on Polar's hosted page, and fulfillment is webhook-driven.
 *
 * The law, stated twice so nobody misses it: paid money NEVER moves a
 * score. The throne is labeled paid; the score is earned in the open by
 * the same engine that judges everyone.
 */

const STEPS = [
  {
    n: 'I',
    title: 'Name your site, pay the bid.',
    body: 'Enter your site\u2019s address and pay the current bid \u2014 $19 to open, $3 more than the holder to steal it.',
  },
  {
    n: 'II',
    title: 'Take the throne immediately.',
    body: 'Your site jumps the line: scanned first, roasted in full, pinned at the top of the Grand Hall the moment payment lands.',
  },
  {
    n: 'III',
    title: 'Hold it up to 3 days.',
    body: 'The throne is yours until your 3 days run out \u2014 or until someone outbids you by $3 and takes it sooner.',
  },
];

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

export function PricingPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 pb-16 pt-10 md:pt-14">
      {/* Header row */}
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b-2 border-ink pb-4">
        <p className="eyebrow text-ink-soft">The forum</p>
        <Link
          to="/"
          className="tap-target flex items-center gap-2 font-data text-sm font-medium uppercase tracking-[0.18em] text-ink-soft transition-colors hover:text-hazard"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2.25} />
          Back to the start
        </Link>
      </div>

      {/* The pitch */}
      <div className="max-w-3xl py-10 md:py-14">
        <h1 className="font-inscription text-5xl font-bold uppercase tracking-tight md:text-6xl">
          The throne is for sale.
        </h1>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-soft">
          One spotlight atop the Grand Hall. Bidding opens at $19 &mdash;
          outbid the holder by $3 and the throne is yours, roasted in full.
          What money can&rsquo;t buy: a single point of score.
        </p>
      </div>

      <MeanderDivider className="mb-10 md:mb-14" />

      {/* The auction */}
      <section
        aria-labelledby="the-throne"
        id="throne"
        className="border-y border-hairline py-10 md:py-12"
      >
        <p className="eyebrow text-ink-soft">The only product</p>
        <h2
          id="the-throne"
          className="mt-4 font-inscription text-4xl font-bold uppercase tracking-tight md:text-5xl"
        >
          The Throne
        </h2>
        <p className="mt-2 font-data text-sm font-medium uppercase tracking-[0.18em] text-ink-faint">
          One time &middot; no subscription &middot; labeled as paid
        </p>

        <ol className="mt-8 grid gap-6 md:grid-cols-3 md:gap-8">
          {STEPS.map((s) => (
            <li key={s.n} className="border-t-2 border-ink pt-4">
              <p
                className="font-inscription text-2xl font-bold text-hazard"
                aria-hidden="true"
              >
                {s.n}
              </p>
              <p className="mt-2 text-lg font-semibold leading-snug">
                {s.title}
              </p>
              <p className="mt-1 text-lg leading-relaxed text-ink-soft">
                {s.body}
              </p>
            </li>
          ))}
        </ol>

        <div className="mt-10">
          <BidBox />
        </div>
      </section>

      {/* The law */}
      <section aria-labelledby="the-law" className="mt-14 md:mt-20">
        <p className="eyebrow text-ink-soft">The law</p>
        <h2
          id="the-law"
          className="mt-4 font-inscription text-4xl font-bold uppercase tracking-tight md:text-5xl"
        >
          Money can&rsquo;t buy a score.
        </h2>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-soft">
          No amount of money moves a score &mdash; not by a point, not ever.
          The throne is labeled paid. The score is earned in the open, by the
          same engine that judges everyone. If cash could buy rank, the whole
          arena would be a joke. Not the funny kind.
        </p>
      </section>
    </main>
  );
}

type BidState =
  | { kind: 'loading' }
  | { kind: 'ready'; throne: ThroneState }
  | { kind: 'error' };

function BidBox() {
  const [state, setState] = useState<BidState>({ kind: 'loading' });
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchThrone()
      .then((throne) => {
        if (live) setState({ kind: 'ready', throne });
      })
      .catch(() => {
        if (live) setState({ kind: 'error' });
      });
    return () => {
      live = false;
    };
  }, []);

  async function placeBid(e: React.FormEvent) {
    e.preventDefault();
    if (state.kind !== 'ready' || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const session = await createThroneCheckout(url);
      window.location.href = session.checkout_url;
    } catch (err) {
      setBusy(false);
      setProblem(
        err instanceof Error && err.message === 'throne_not_configured'
          ? 'Bidding opens very soon \u2014 the arena is still setting the table.'
          : 'The bid didn\u2019t go through. Check the address and try again.',
      );
    }
  }

  if (state.kind === 'loading') {
    return (
      <p className="text-lg text-ink-soft" role="status">
        Reading the current bid&hellip;
      </p>
    );
  }
  if (state.kind === 'error') {
    return (
      <p className="text-lg text-ink-soft">
        The auction board is unreachable right now &mdash; try again in a
        moment.
      </p>
    );
  }

  const { throne } = state;
  return (
    <div className="border-2 border-ink p-6 md:p-8">
      <p className="font-data text-sm font-bold uppercase tracking-[0.18em] text-ink-soft">
        {throne.occupied && throne.holder
          ? `${throne.holder.domain} holds the throne \u2014 paid ${dollars(throne.holder.price_cents)}`
          : 'The throne is empty'}
      </p>
      <p className="mt-2 font-inscription text-3xl font-bold uppercase tracking-tight md:text-4xl">
        Current bid to take it: {dollars(throne.min_bid_cents)}
      </p>
      <form onSubmit={placeBid} className="mt-6 flex flex-col gap-4 md:flex-row">
        <label className="sr-only" htmlFor="throne-url">
          Your site&rsquo;s address
        </label>
        <input
          id="throne-url"
          type="text"
          inputMode="url"
          autoComplete="url"
          placeholder="yoursite.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="tap-target min-w-0 flex-1 border-2 border-ink bg-paper px-4 py-3 font-data text-lg text-ink placeholder:text-ink-faint"
        />
        <button
          type="submit"
          disabled={busy}
          className="tap-target inline-flex shrink-0 items-center justify-center bg-hazard px-8 py-3 font-data text-base font-bold uppercase tracking-wider text-paper transition-colors hover:bg-hazard-deep disabled:opacity-60"
        >
          {busy ? 'Opening checkout\u2026' : `Bid ${dollars(throne.min_bid_cents)}`}
        </button>
      </form>
      {problem && (
        <p className="mt-3 text-base font-semibold text-hazard" role="alert">
          {problem}
        </p>
      )}
      <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-soft">
        Secure checkout by Polar. Your bid takes the throne the moment
        payment lands &mdash; held up to 3 days, or until someone outbids
        you by $3.
      </p>
    </div>
  );
}
