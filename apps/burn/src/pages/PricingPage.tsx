import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Flame, Palette, Gavel } from 'lucide-react';
import { SiteHeader } from '../components/SiteHeader';
import { SiteFooter } from '../components/SiteFooter';

/**
 * Pricing page — `/pricing` (§3.6, Task 8).
 *
 * The three paid products, deadpan and honest:
 *   - Verified Burner badge — $9 (claimed companies only)
 *   - Custom report card theme — $4 (Doom / Copium / Diamond hands)
 *   - Weekly spotlight bid — $5 minimum (bids are final)
 *
 * Flow: each form POSTs to /api/burn/billing/checkout, which returns a
 * Lemon Squeezy hosted checkout URL; we redirect there. We never touch
 * card data. Entitlements land via webhook, so the success page is honest
 * about the delay.
 *
 * TEST MODE: no real money moves until the LS seller application is
 * approved. The banner says so, out loud.
 */

type Product = 'badge' | 'theme' | 'spotlight_bid';

const API = '/api/burn/billing/checkout';

async function resolveCompanyId(slug: string): Promise<string> {
  const res = await fetch(`/api/burn/company/${encodeURIComponent(slug)}`);
  if (!res.ok) throw new Error('company');
  const data = await res.json();
  return data.id as string;
}

function useCheckout() {
  const [state, setState] = useState<
    | { kind: 'idle' }
    | { kind: 'busy' }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });

  const start = async (body: Record<string, unknown>) => {
    setState({ kind: 'busy' });
    try {      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          data.detail ?? data.message ?? 'The furnace hiccuped. Try again.',
        );
      }
      if (!data.checkout_url) throw new Error('No checkout came back. Try again.');
      window.location.href = data.checkout_url as string;
    } catch (e) {
      setState({
        kind: 'error',
        message: e instanceof Error ? e.message : 'The furnace hiccuped. Try again.',
      });
    }
  };

  const fail = (message: string) => setState({ kind: 'error', message });

  return { state, start, fail };
}

function CheckoutError({ state }: { state: { kind: string; message?: string } }) {
  if (state.kind !== 'error' || !state.message) return null;
  return <p className="mt-3 text-sm text-ember">{state.message}</p>;
}

function BadgeSection({ presetSlug }: { presetSlug: string }) {
  const [slug, setSlug] = useState(presetSlug);
  const { state, start, fail } = useCheckout();
  const busy = state.kind === 'busy';

  return (
    <section aria-label="Verified Burner badge" className="border-b border-divider py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="flex items-center gap-3 font-display text-2xl font-bold text-text">
          <Flame className="h-6 w-6 text-ember" aria-hidden="true" />
          Verified Burner
        </h2>
        <span className="font-data text-2xl font-bold text-ember">$9</span>
      </div>
      <p className="mt-3 max-w-2xl text-ash">
        A flame stamp on your company page and report card. Proof you actually
        set the money on fire — and lived to verify it. One-time. Non-refundable.
        Obviously.
      </p>
      <form
        className="mt-5 flex max-w-xl flex-col gap-3 sm:flex-row"
        onSubmit={async (e) => {
          e.preventDefault();
          const clean = slug.trim().toLowerCase();
          if (!clean) return;
          try {
            const id = await resolveCompanyId(clean);
            await start({ product: 'badge', company_id: id });
          } catch {
            fail('No live company with that slug. Check your company page URL: burn-rate.lol/c/your-slug');
          }
        }}
      >
        <label className="sr-only" htmlFor="badge-slug">Company slug</label>
        <input
          id="badge-slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="your-company-slug"
          className="flex-1 border border-divider bg-surface px-4 py-3 font-data text-sm text-text placeholder:text-ash/60 focus:border-ember focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy}
          className="border border-ember px-6 py-3 font-data text-xs font-bold uppercase tracking-[0.2em] text-ember transition-colors hover:bg-ember hover:text-bg disabled:opacity-50"
        >
          {busy ? 'Lighting…' : 'Get the flame'}
        </button>
      </form>
      <CheckoutError state={state} />
      <p className="mt-3 font-data text-xs text-ash">
        Claimed companies only — the receipt goes to the email you claimed with.
        Find your slug on your company page URL: burn-rate.lol/c/<span className="text-text">your-slug</span>
      </p>
    </section>
  );
}

const THEMES = [
  { key: 'doom', name: 'Doom', blurb: 'Total blackout. Blood-red numbers.' },
  { key: 'copium', name: 'Copium', blurb: 'Paper mode. A report that lies to itself.' },
  { key: 'diamond_hands', name: 'Diamond hands', blurb: 'After-hours, but green. No liquidity.' },
] as const;

function ThemeSection({ presetSlug }: { presetSlug: string }) {
  const [slug, setSlug] = useState(presetSlug);
  const [email, setEmail] = useState('');
  const [theme, setTheme] = useState<string>('doom');
  const { state, start, fail } = useCheckout();
  const busy = state.kind === 'busy';

  return (
    <section aria-label="Custom report card theme" className="border-b border-divider py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="flex items-center gap-3 font-display text-2xl font-bold text-text">
          <Palette className="h-6 w-6 text-ember" aria-hidden="true" />
          Custom report card theme
        </h2>
        <span className="font-data text-2xl font-bold text-ember">$4</span>
      </div>
      <p className="mt-3 max-w-2xl text-ash">
        Dress your burn report card in something with more personality than
        solvency. The numbers stay bleak; the aesthetics improve.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Theme">
        {THEMES.map((t) => (
          <button
            key={t.key}
            type="button"
            role="radio"
            aria-checked={theme === t.key}
            onClick={() => setTheme(t.key)}
            className={`border px-4 py-4 text-left transition-colors ${
              theme === t.key ? 'border-ember' : 'border-divider hover:border-ash'
            }`}
          >
            <p className="font-data text-sm font-bold uppercase tracking-[0.15em] text-text">{t.name}</p>
            <p className="mt-1 text-xs text-ash">{t.blurb}</p>
          </button>
        ))}
      </div>
      <form
        className="mt-5 grid max-w-2xl gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const id = await resolveCompanyId(slug.trim().toLowerCase());
            await start({ product: 'theme', company_id: id, email: email.trim(), theme });
          } catch {
            fail('No live company with that slug. Check your company page URL: burn-rate.lol/c/your-slug');
          }
        }}
      >
        <label className="sr-only" htmlFor="theme-slug">Company slug</label>
        <input
          id="theme-slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="company slug"
          className="border border-divider bg-surface px-4 py-3 font-data text-sm text-text placeholder:text-ash/60 focus:border-ember focus:outline-none"
        />
        <label className="sr-only" htmlFor="theme-email">Email</label>
        <input
          id="theme-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@yourburn.lol"
          className="border border-divider bg-surface px-4 py-3 font-data text-sm text-text placeholder:text-ash/60 focus:border-ember focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy}
          className="border border-ember px-6 py-3 font-data text-xs font-bold uppercase tracking-[0.2em] text-ember transition-colors hover:bg-ember hover:text-bg disabled:opacity-50 sm:col-span-2"
        >
          {busy ? 'Painting…' : `Buy ${THEMES.find((t) => t.key === theme)?.name} — $4`}
        </button>
      </form>
      <CheckoutError state={state} />
    </section>
  );
}

function SpotlightSection() {
  const [slug, setSlug] = useState('');
  const [email, setEmail] = useState('');
  const [amount, setAmount] = useState('5');
  const { state, start, fail } = useCheckout();
  const busy = state.kind === 'busy';

  return (
    <section aria-label="Weekly spotlight bid" className="py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="flex items-center gap-3 font-display text-2xl font-bold text-text">
          <Gavel className="h-6 w-6 text-ember" aria-hidden="true" />
          Weekly spotlight
        </h2>
        <span className="font-data text-2xl font-bold text-ember">$5 min</span>
      </div>
      <p className="mt-3 max-w-2xl text-ash">
        The #1 slot at the top of the board for a full week — your logo, your
        link, everyone&apos;s judgment. New auction every Monday, 00:00 UTC.
        Beat the top bid by at least $1 to take it.
      </p>
      <p className="mt-2 max-w-2xl font-data text-xs uppercase tracking-[0.15em] text-ember">
        Bids are final. No refunds for being outbid — that&apos;s the game.
      </p>
      <form
        className="mt-5 grid max-w-2xl gap-3 sm:grid-cols-3"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const id = await resolveCompanyId(slug.trim().toLowerCase());
            const cents = Math.round(Number(amount) * 100);
            await start({
              product: 'spotlight_bid',
              company_id: id,
              email: email.trim(),
              bid_amount_cents: cents,
            });
          } catch {
            fail('No live company with that slug. Check the company page URL: burn-rate.lol/c/your-slug');
          }
        }}
      >
        <label className="sr-only" htmlFor="spot-slug">Company slug</label>
        <input
          id="spot-slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="company slug"
          className="border border-divider bg-surface px-4 py-3 font-data text-sm text-text placeholder:text-ash/60 focus:border-ember focus:outline-none"
        />
        <label className="sr-only" htmlFor="spot-email">Email</label>
        <input
          id="spot-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@yourburn.lol"
          className="border border-divider bg-surface px-4 py-3 font-data text-sm text-text placeholder:text-ash/60 focus:border-ember focus:outline-none"
        />
        <label className="sr-only" htmlFor="spot-amount">Bid amount in dollars</label>
        <div className="flex items-center border border-divider bg-surface px-4 focus-within:border-ember">
          <span className="font-data text-sm text-ash">$</span>
          <input
            id="spot-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="5"
            className="w-full bg-transparent px-2 py-3 font-data text-sm text-text placeholder:text-ash/60 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="border border-ember px-6 py-3 font-data text-xs font-bold uppercase tracking-[0.2em] text-ember transition-colors hover:bg-ember hover:text-bg disabled:opacity-50 sm:col-span-3"
        >
          {busy ? 'Raising paddle…' : 'Place bid'}
        </button>
      </form>
      <CheckoutError state={state} />
    </section>
  );
}

export function PricingPage() {
  const [params] = useSearchParams();
  const product = params.get('product');
  const presetSlug = useMemo(() => params.get('company') ?? '', [params]);
  const initial: Product | null =
    product === 'badge' || product === 'theme' || product === 'spotlight_bid'
      ? product
      : null;

  return (
    <div className="min-h-screen bg-bg text-text">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 pb-20">
        <p className="mt-12 font-data text-[11px] uppercase tracking-[0.22em] text-ash">
          the gift shop
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight md:text-5xl">
          Monetize the <span className="italic">downfall</span>.
        </h1>
        <p className="mt-4 max-w-2xl text-ash">
          Listing is free forever. These are for founders who want their burn
          to look expensive. Self-reported numbers, certified aesthetics.
        </p>

        <div className="mt-8 border border-ember/60 px-4 py-3">
          <p className="font-data text-xs uppercase tracking-[0.18em] text-ember">
            Test mode — no real money moves. The furnace is a simulation until
            the payment provider approves us.
          </p>
        </div>

        <div className="mt-6">
          {(!initial || initial === 'badge') && <BadgeSection presetSlug={presetSlug} />}
          {(!initial || initial === 'theme') && <ThemeSection presetSlug={presetSlug} />}
          {(!initial || initial === 'spotlight_bid') && <SpotlightSection />}
          {initial && (
            <p className="mt-8">
              <Link
                to="/pricing"
                className="font-data text-xs uppercase tracking-[0.2em] text-ash underline-offset-4 hover:text-ember hover:underline"
              >
                ← all three ways to burn money on burning money
              </Link>
            </p>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
