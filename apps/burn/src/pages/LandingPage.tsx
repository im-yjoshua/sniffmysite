import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Ticker } from '../components/Ticker';
import { SiteHeader } from '../components/SiteHeader';
import { SiteFooter } from '../components/SiteFooter';
import { Board } from '../components/Board';
import { useCountUp } from '../hooks/useCountUp';
import { COMPANIES, TOTAL_MONTHLY_BURN } from '../lib/mock';

/**
 * BurnRate.lol landing page (§3.3, §0.2).
 *
 * The "obvious on landing" rule: one meme-grade one-liner, the live board
 * visible without scrolling, exactly one CTA. Hero is compact and
 * left-aligned — no pill badge, no gradient, no centered AI-starter look.
 */

function Hero() {
  return (
    <section className="mx-auto max-w-5xl px-6 pb-10 pt-12">
      <h1 className="max-w-3xl font-display text-5xl font-bold leading-[1.02] tracking-tight text-text md:text-7xl">
        Revenue is vanity.
        <br />
        Burn is sanity. <span className="font-editorial font-normal italic">Probably.</span>
      </h1>
      <p className="mt-5 max-w-xl text-base leading-relaxed text-ash">
        The leaderboard that ranks startups by monthly burn. Self-reported. Audited by vibes.
      </p>
      {/* Exactly one CTA (§0.2). */}
      <Link
        to="/list"
        className="mt-7 inline-flex items-center gap-2 bg-ember px-6 py-3 font-display text-sm font-bold uppercase tracking-[0.12em] text-bg transition-colors hover:bg-ember-deep"
      >
        List your burn
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </section>
  );
}

function IncineratedStrip({ start }: { start: boolean }) {
  const incinerated = useCountUp(Math.round(TOTAL_MONTHLY_BURN / 30), start, 1400);
  return (
    <section className="border-y border-divider bg-surface" aria-label="Money incinerated today">
      <div className="mx-auto flex max-w-5xl flex-wrap items-baseline gap-x-4 px-6 py-6">
        <span className="tabular font-data text-4xl font-bold text-ember md:text-5xl">
          ${incinerated.toLocaleString('en-US')}
        </span>
        <span className="font-data text-xs uppercase tracking-[0.2em] text-ash">
          incinerated today (allegedly)
        </span>
      </div>
    </section>
  );
}

function ManifestoTeaser() {
  return (
    <section className="border-t border-divider">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <p className="max-w-2xl font-editorial text-2xl italic leading-snug text-text md:text-3xl">
          &ldquo;We celebrate the burn, because the burn is honest. Revenue can be faked. Nobody
          fakes losing money this fast.&rdquo;
        </p>
        <p className="mt-5 font-data text-[11px] uppercase tracking-[0.22em] text-ash">
          the manifesto, probably
        </p>
      </div>
    </section>
  );
}

export function LandingPage() {
  const [started, setStarted] = useState(false);
  useEffect(() => {
    setStarted(true);
  }, []);

  return (
    <div className="min-h-screen bg-bg text-text">
      <Ticker />
      <SiteHeader />
      <main>
        <Hero />
        <IncineratedStrip start={started} />
        <section className="mx-auto max-w-5xl px-6 py-12" aria-label="Burn board">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-xl font-bold text-text">The burn board</h2>
            <span className="font-data text-[11px] uppercase tracking-[0.18em] text-ash">
              top 10 · sorted by burn
            </span>
          </div>
          <Board companies={COMPANIES} />
          <p className="mt-6 font-data text-xs text-ash">
            10 of the listed burners.{' '}
            <Link to="/board" className="text-ember hover:underline">
              See the full board →
            </Link>
          </p>
        </section>
        <ManifestoTeaser />
        <FuelStrip />
      </main>
      <SiteFooter />
    </div>
  );
}

/** Slim gift-shop strip — the only monetization mention on the landing page. */
function FuelStrip() {
  return (
    <section aria-label="Paid extras" className="border-t border-divider">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-8">
        <p className="font-data text-xs uppercase tracking-[0.2em] text-ash">
          Verified Burner $9 · Card skins $4 · Weekly spotlight $5 min
        </p>
        <Link
          to="/pricing"
          className="inline-flex items-center gap-2 font-data text-xs font-bold uppercase tracking-[0.2em] text-ember hover:underline underline-offset-4"
        >
          Fuel the furnace <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
