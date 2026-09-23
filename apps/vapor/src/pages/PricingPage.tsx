import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2, Zap } from 'lucide-react';
import {
  BILLING_PRODUCTS,
  createCheckout,
  ScanApiError,
  type BillingProductKey,
} from '../lib/api';

const EMAIL_KEY = 'vaporrank_email';

/**
 * Pricing / "the lab's gift shop".
 *
 * The money rule, learned the hard way: the lab sells exactly ONE thing —
 * the automated Priority Re-scan. No manual audits (a human service can't
 * ride an automated checkout), no self-serve banner sales (those are
 * handshake deals, handled personally after launch). Testing, rankings,
 * and sharing stay free forever.
 */
export function PricingPage() {
  const [email, setEmail] = useState(
    () => window.localStorage.getItem(EMAIL_KEY) ?? '',
  );
  const [buying, setBuying] = useState<BillingProductKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The page sells the automated product only. Anything manual
  // (audits, banners) is deliberately not on this shelf.
  const products = BILLING_PRODUCTS.filter((p) => p.key === 'rescan');

  const buy = async (product: BillingProductKey) => {
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
      setError('We need a real email to send your credits to.');
      return;
    }
    setError(null);
    setBuying(product);
    window.localStorage.setItem(EMAIL_KEY, trimmed);
    try {
      const checkout = await createCheckout(product, trimmed);
      window.location.href = checkout.checkout_url;
    } catch (e) {
      setBuying(null);
      setError(
        e instanceof ScanApiError && e.code === 'billing_not_configured'
          ? 'Payments aren\u2019t switched on yet. The shop opens properly after launch — check back soon.'
          : 'Something went wrong. Try again in a minute.',
      );
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-6 pb-16 pt-10 md:pt-14">
      {/* Header row */}
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b-2 border-ink pb-4">
        <p className="eyebrow text-ink-soft">The shop</p>
        <Link
          to="/"
          className="tap-target flex items-center gap-2 font-data text-sm font-medium uppercase tracking-[0.18em] text-ink-soft transition-colors hover:text-hazard"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2.25} />
          Back to the start
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-6 py-10 md:py-14">
        <div className="max-w-2xl">
          <h1 className="font-display text-5xl font-bold tracking-tight md:text-6xl">
            Skip the line.
          </h1>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-soft">
            Testing is always free — the tests, the rankings, the sharing.
            One paid extra, for founders in a hurry.
          </p>
        </div>
        <TestModeBadge />
      </div>

      {/* Email capture — credits are keyed by email (no accounts in this version). */}
      <div className="border-y border-hairline py-6">
        <label
          htmlFor="billing-email"
          className="block font-data text-sm font-medium uppercase tracking-[0.18em] text-ink-soft"
        >
          Your email — that&rsquo;s where your credits go
        </label>
        <input
          id="billing-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="founder@yourstartup.com"
          autoComplete="email"
          className="tap-target mt-3 w-full max-w-md border border-ink bg-paper px-4 py-3 font-data text-base text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-hazard"
        />
      </div>

      {/* The one product — a hairline row, not a box-in-a-box. */}
      <div>
        {products.map((p) => {
          const isBuying = buying === p.key;
          return (
            <div
              key={p.key}
              className="grid gap-4 border-b border-hairline py-8 md:grid-cols-[auto_1fr_auto] md:items-center md:gap-10"
            >
              <span className="text-ink" aria-hidden="true">
                <Zap className="h-8 w-8" strokeWidth={1.75} />
              </span>
              <div>
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <h2 className="font-display text-3xl font-bold tracking-tight">
                    {p.name}
                  </h2>
                  <p className="font-data text-3xl font-bold tabular-nums text-hazard">
                    {p.priceDisplay}
                  </p>
                </div>
                <p className="mt-2 max-w-xl text-lg leading-relaxed text-ink-soft">
                  {p.tagline}
                </p>
                <p className="mt-2 font-data text-sm uppercase tracking-[0.18em] text-ink-faint">
                  {p.creditLabel} · pay once, no subscription
                </p>
              </div>
              <button
                type="button"
                onClick={() => buy(p.key)}
                disabled={buying !== null}
                className="tap-target inline-flex w-full shrink-0 items-center justify-center gap-2 bg-hazard px-6 py-3.5 font-data text-sm font-bold uppercase tracking-wider text-paper transition-colors hover:bg-hazard-deep disabled:cursor-wait disabled:opacity-60 md:w-auto"
              >
                {isBuying ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2.25} />
                    Opening checkout…
                  </>
                ) : (
                  <>Buy {p.priceDisplay}</>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="mt-6 font-data text-sm text-hazard">
          {error}
        </p>
      )}

      {/* Sponsorships: handshake deals, not a checkout button. */}
      <div className="mt-16 border-t-2 border-ink pt-10">
        <p className="eyebrow text-ink-soft">Sponsor the homepage</p>
        <h2 className="mt-4 font-display text-4xl font-bold tracking-tight md:text-5xl">
          Banners open after launch.
        </h2>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-soft">
          Homepage banners will be rented spots — clearly labeled{' '}
          <strong>Sponsored</strong>, sold by handshake, not by checkout.
          Money never moves a score. Not by a point, not ever.
        </p>
      </div>

      {/* Integrity line (§2.9). */}
      <div className="mt-10 space-y-3">
        <p className="font-display text-2xl font-bold tracking-tight">
          Paid = re-test + badge. Never deleted.
        </p>
        <p className="max-w-2xl text-lg leading-relaxed text-ink-soft">
          No amount of money deletes a score. A re-test buys a{' '}
          <em>new</em> score — the whole journey is public, win or lose.
          If cash could move a score, the whole board would be meaningless.
        </p>
      </div>
    </main>
  );
}

/** Loud rotated badge so nobody mistakes test mode for real billing.
    Reuses the lab's stamp language — same chunk, same ink. */
function TestModeBadge() {
  return (
    <span
      className="stamp"
      role="note"
      aria-label="Test mode: no real charge"
      /* Fluid type: the full 16px slam on desktop, shrinking to 13px on
         phones. The stamp is white-space: nowrap and runs ~370px wide at
         16px — wider than a 360px viewport's content box — so without this
         the whole page scrolls sideways. Padding and letter-spacing are
         em-based, so they scale down with the type. Unchanged at ≥445px. */
      style={{ fontSize: 'clamp(13px, 3.6vw, 1rem)' }}
    >
      Test mode · no real charge
    </span>
  );
}
