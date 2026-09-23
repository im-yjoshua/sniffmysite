import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, BadgeCheck, Loader2, Megaphone, Zap } from 'lucide-react';
import {
  BILLING_PRODUCTS,
  SPONSOR_PRODUCTS,
  createCheckout,
  createSponsorCheckout,
  ScanApiError,
  type AdvertiserInput,
  type BillingProductKey,
  type SponsorProductKey,
} from '../lib/api';

const EMAIL_KEY = 'vaporrank_email';

/** Client-side mirror of the server's https-only URL rule. */
function isHttpsUrlClient(v: string): boolean {
  const s = v.trim();
  if (!s || s.length > 2048) return false;
  try {
    return new URL(s).protocol === 'https:';
  } catch {
    return false;
  }
}

const PRODUCT_ICONS: Record<BillingProductKey, typeof Zap> = {
  rescan: Zap,
  audit: BadgeCheck,
};

/**
 * Pricing / "the lab's gift shop" (Task 9, §2.6).
 * Two one-time products in TEST MODE — the stamp says so loudly.
 * Copy keeps the integrity line from §2.9: paid = re-scan + badge,
 * never erasure.
 */
export function PricingPage() {
  const [email, setEmail] = useState(
    () => window.localStorage.getItem(EMAIL_KEY) ?? '',
  );
  const [buying, setBuying] = useState<BillingProductKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Banner section state.
  const [brand, setBrand] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [destUrl, setDestUrl] = useState('');
  const [altText, setAltText] = useState('');
  const [buyingBanner, setBuyingBanner] = useState<SponsorProductKey | null>(
    null,
  );
  const [bannerError, setBannerError] = useState<string | null>(null);

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
          ? 'Payments aren\u2019t set up yet. Try again later.'
          : e instanceof ScanApiError && e.code === 'billing_live_blocked'
            ? 'Real payments are locked until our Lemon Squeezy application is approved. Test mode only for now.'
            : 'Something went wrong. Try again in a minute.',
      );
    }
  };

  /** Client-side validation mirrors the server rules in lib/sponsors.ts:
   *  https:// only for both URLs, brand ≤60, alt ≤120. */
  const validateAdvertiserClient = (
    a: AdvertiserInput,
  ): string | null => {
    if (!a.brand_name.trim()) return 'Give your banner a brand name.';
    if (a.brand_name.trim().length > 60)
      return 'Brand name must be 60 characters or fewer.';
    if (!isHttpsUrlClient(a.image_url))
      return 'The image link must start with https:// and look like a real address.';
    if (!isHttpsUrlClient(a.dest_url))
      return 'The link your banner goes to must start with https:// and look like a real address.';
    if (!a.alt_text.trim()) return 'Describe the banner for screen readers (the alt text).';
    if (a.alt_text.trim().length > 120)
      return 'Alt text must be 120 characters or fewer.';
    return null;
  };

  const buyBanner = async (product: SponsorProductKey) => {
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
      setBannerError('We need a real email — that is where your receipt goes.');
      return;
    }
    const advertiser: AdvertiserInput = {
      brand_name: brand.trim(),
      image_url: imageUrl.trim(),
      dest_url: destUrl.trim(),
      alt_text: altText.trim(),
    };
    const fieldError = validateAdvertiserClient(advertiser);
    if (fieldError) {
      setBannerError(fieldError);
      return;
    }
    setBannerError(null);
    setBuyingBanner(product);
    window.localStorage.setItem(EMAIL_KEY, trimmed);
    try {
      const checkout = await createSponsorCheckout(product, trimmed, advertiser);
      window.location.href = checkout.checkout_url;
    } catch (e) {
      setBuyingBanner(null);
      setBannerError(
        e instanceof ScanApiError && e.code === 'billing_not_configured'
          ? 'Payments aren\u2019t set up yet. Try again later.'
          : e instanceof ScanApiError && e.code === 'billing_live_blocked'
            ? 'Real payments are locked until our Lemon Squeezy application is approved. Test mode only for now.'
            : e instanceof ScanApiError && e.code === 'invalid_advertiser_input'
              ? 'One of the banner fields did not pass the server check. Fix it and try again.'
              : 'Something went wrong. Try again in a minute.',
      );
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-6 pb-16 pt-10 md:pt-14">
      {/* Header row */}
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b-2 border-ink pb-4">
        <p className="eyebrow text-ink-soft">
          The shop
        </p>
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
            Two paid extras for founders in a hurry.
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

      {/* The two products — hairline rows, not boxes-in-boxes. */}
      <div>
        {BILLING_PRODUCTS.map((p) => {
          const Icon = PRODUCT_ICONS[p.key];
          const isBuying = buying === p.key;
          return (
            <div
              key={p.key}
              className="grid gap-4 border-b border-hairline py-8 md:grid-cols-[auto_1fr_auto] md:items-center md:gap-10"
            >
              <span className="text-ink" aria-hidden="true">
                <Icon className="h-8 w-8" strokeWidth={1.75} />
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

      {/* Sponsored banners — rented homepage slots. */}
      <div className="mt-16 border-t-2 border-ink pt-10">
        <p className="eyebrow text-ink-soft">Sponsor the homepage</p>
        <h2 className="mt-4 font-display text-4xl font-bold tracking-tight md:text-5xl">
          Your banner on the homepage.
        </h2>
        <div className="mt-4 max-w-2xl space-y-3 text-lg leading-relaxed text-ink-soft">
          <p>
            Two rented spots: one under the headline, one near the footer.
            Every banner is labeled <strong>Sponsored</strong> — and money
            never moves a score. Not by a point, not ever.
          </p>
          <p>
            You pay now, a human approves later. Every banner is checked by
            hand before it goes live. Anything shady is rejected and refunded
            — payment alone never publishes a banner.
          </p>
        </div>

        {/* Advertiser form — validated client-side (mirrors the server). */}
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <div>
            <label
              htmlFor="banner-brand"
              className="block font-data text-sm font-medium uppercase tracking-[0.18em] text-ink-soft"
            >
              Brand name
            </label>
            <input
              id="banner-brand"
              type="text"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="Acme Tools"
              maxLength={60}
              className="tap-target mt-3 w-full border border-ink bg-paper px-4 py-3 font-data text-base text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-hazard"
            />
          </div>
          <div>
            <label
              htmlFor="banner-alt"
              className="block font-data text-sm font-medium uppercase tracking-[0.18em] text-ink-soft"
            >
              Alt text — describe the banner
            </label>
            <input
              id="banner-alt"
              type="text"
              value={altText}
              onChange={(e) => setAltText(e.target.value)}
              placeholder="Acme Tools — the wrench that ships"
              maxLength={120}
              className="tap-target mt-3 w-full border border-ink bg-paper px-4 py-3 font-data text-base text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-hazard"
            />
          </div>
          <div>
            <label
              htmlFor="banner-image"
              className="block font-data text-sm font-medium uppercase tracking-[0.18em] text-ink-soft"
            >
              Image URL — must start with https://
            </label>
            <input
              id="banner-image"
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://cdn.yoursite.com/banner.png"
              inputMode="url"
              className="tap-target mt-3 w-full border border-ink bg-paper px-4 py-3 font-data text-base text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-hazard"
            />
          </div>
          <div>
            <label
              htmlFor="banner-dest"
              className="block font-data text-sm font-medium uppercase tracking-[0.18em] text-ink-soft"
            >
              Link URL — must start with https://
            </label>
            <input
              id="banner-dest"
              type="url"
              value={destUrl}
              onChange={(e) => setDestUrl(e.target.value)}
              placeholder="https://yoursite.com/"
              inputMode="url"
              className="tap-target mt-3 w-full border border-ink bg-paper px-4 py-3 font-data text-base text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-hazard"
            />
          </div>
        </div>
        <p className="mt-3 text-base text-ink-faint">
          We use the email at the top of this page as the buyer email. Keep
          the banner honest — a wide image (about 1200 × 300) looks best.
        </p>

        {/* The two banner products — same hairline-row style as above. */}
        <div className="mt-4">
          {SPONSOR_PRODUCTS.map((p) => {
            const isBuying = buyingBanner === p.key;
            return (
              <div
                key={p.key}
                className="grid gap-4 border-b border-hairline py-8 md:grid-cols-[auto_1fr_auto] md:items-center md:gap-10"
              >
                <span className="text-ink" aria-hidden="true">
                  <Megaphone className="h-8 w-8" strokeWidth={1.75} />
                </span>
                <div>
                  <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    <h3 className="font-display text-3xl font-bold tracking-tight">
                      {p.name}
                    </h3>
                    <p className="font-data text-3xl font-bold tabular-nums text-hazard">
                      {p.priceDisplay}
                    </p>
                  </div>
                  <p className="mt-2 max-w-xl text-lg leading-relaxed text-ink-soft">
                    {p.tagline}
                  </p>
                  <p className="mt-2 font-data text-sm uppercase tracking-[0.18em] text-ink-faint">
                    {p.termLabel}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => buyBanner(p.key)}
                  disabled={buyingBanner !== null}
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

        {bannerError && (
          <p role="alert" className="mt-6 font-data text-sm text-hazard">
            {bannerError}
          </p>
        )}
        <p className="mt-6 max-w-2xl text-base leading-relaxed text-ink-faint">
          Test mode: checkout is a test — no real charge, no real banner.
          The banner goes live only after a human approves it.
        </p>
      </div>

      {/* Integrity line (§2.9) + honest fulfillment notes. */}
      <div className="mt-10 space-y-3">
        <p className="font-display text-2xl font-bold tracking-tight">
          Paid = re-test + badge. Never deleted.
        </p>
        <p className="max-w-2xl text-lg leading-relaxed text-ink-soft">
          No amount of money deletes a score. A re-test buys a{' '}
          <em>new</em> score — the whole journey is public, win or lose.
          Audits are reviewed by an actual human, so allow 48 hours.
          Refunds take the credit back automatically.
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
