import { useEffect, useState } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { ScanBox } from './components/ScanBox';
import { Leaderboard } from './components/Leaderboard';
import { TrendingBoard } from './components/TrendingBoard';
import { ScanPage } from './pages/ScanPage';
import { ComparePage } from './pages/ComparePage';
import { LaunchPage } from './pages/LaunchPage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { MoversPage } from './pages/MoversPage';
import { StartupProfilePage } from './pages/StartupProfilePage';
import { VerifyPage } from './pages/VerifyPage';
import { PricingPage } from './pages/PricingPage';
import { AdminSponsorsPage } from './pages/AdminSponsorsPage';
import { SponsorSlot } from './components/SponsorSlot';
import { fetchSponsors, type PublicSponsor } from './lib/api';

/**
 * VaporRank app shell (Task 8: claim flow added).
 * Routes: `/` landing (§2.3), `/scan?url=…` lab report (Task 5),
 * `/leaderboard` Hall of Vapor (Task 6), `/s/:slug` specimen dossier (Task 7),
 * `/verify` claim the listing (Task 8),
 * `/pricing` the lab's gift shop (Task 9),
 * `/compare` head-to-head sniff-off (§2.12).
 */
export function App() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <ScrollManager />
      <Navbar />

      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/scan" element={<ScanPage />} />
        <Route path="/compare" element={<ComparePage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/movers" element={<MoversPage />} />
        <Route path="/launch" element={<LaunchPage />} />
        <Route path="/s/:slug" element={<StartupProfilePage />} />
        <Route path="/verify" element={<VerifyPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        {/* Internal: banner approvals. Not linked from the site. */}
        <Route path="/admin/sponsors" element={<AdminSponsorsPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>

      <Footer />
    </div>
  );
}

/**
 * react-router doesn't scroll on navigation by default. This handles both:
 * same-route hash links (/#hall-of-vapor) and scroll-to-top on page change.
 */
function ScrollManager() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      // The target section may render late (data fetching), so retry until
      // it exists — a single setTimeout(0) gave up too early and the
      // navbar "How it works" link appeared dead.
      const reduceMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches;
      let tries = 0;
      const t = window.setInterval(() => {
        const el = document.querySelector(hash);
        if (el) {
          el.scrollIntoView({
            behavior: reduceMotion ? 'auto' : 'smooth',
            block: 'start',
          });
          window.clearInterval(t);
        } else if (++tries > 20) {
          window.clearInterval(t);
        }
      }, 100);
      return () => window.clearInterval(t);
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);

  return null;
}

function LandingPage() {
  // When a leaderboard row's "sniff again" is clicked, the domain is seeded
  // into the hero scan box. The /launch page uses the same mechanism via
  // location state: navigate('/#sniff', { state: { seedUrl } }).
  const [scanSeed, setScanSeed] = useState('');
  const location = useLocation();
  useEffect(() => {
    const seed = (location.state as { seedUrl?: string } | null)?.seedUrl;
    if (seed) {
      setScanSeed(seed);
      // Consume it so back/forward and reloads don't re-seed the box.
      window.history.replaceState({}, '');
    }
  }, [location]);

  // Sponsored banners: fetched once, shared by the two slots (index 0 →
  // Slot A, index 1 → Slot B). The API only returns approved, in-window
  // sponsors. On failure the slots fall back to their honest empty state.
  const [sponsors, setSponsors] = useState<PublicSponsor[]>([]);
  useEffect(() => {
    let alive = true;
    fetchSponsors().then((s) => {
      if (alive) setSponsors(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main>
      {/* Hero: one-liner + scan box | leaderboard — all above the fold */}
      <section className="mx-auto grid max-w-6xl gap-12 px-6 pb-16 pt-12 md:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
        <div>
          <p className="eyebrow text-ink-soft">
            The startup smell test
          </p>
          <h1 className="mt-4 font-display text-6xl font-bold leading-[1.04] tracking-tight md:text-7xl">
            We <span className="text-hazard">sniff</span> startups so you don&rsquo;t have to.
          </h1>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-ink-soft">
            Paste a startup&rsquo;s web address. We read the page, count
            the hype, and hand it a score from 0 to 100 — 100 is certified
            real, 0 is pure vapor. Founders, be brave.
          </p>

          {/* The scan box — the CTA's target. scroll-mt clears the sticky navbar. */}
          <div id="sniff" className="mt-8 scroll-mt-40">
            <ScanBox seedUrl={scanSeed} onSeedConsumed={() => setScanSeed('')} />
            <p className="mt-3 text-sm uppercase tracking-[0.14em] text-ink-faint">
              Got two pages?{' '}
              <Link
                to="/compare"
                className="tap-target inline-flex items-center font-medium text-hazard-ink underline decoration-hazard-ink/40 underline-offset-4 hover:decoration-hazard-ink"
              >
                Pit them against each other
              </Link>
            </p>
          </div>
        </div>

        <div className="lg:pt-2">
          <Leaderboard onSniffAgain={(domain) => setScanSeed(domain)} />
        </div>
      </section>

      {/* Slot A: rented banner, right below the hero. A full section away
          from the scores — sponsorship never sits next to a ranking. */}
      <SponsorSlot sponsor={sponsors[0] ?? null} />

      {/* Most sniffed: the trending board, fed by live scan counts. Hides
          itself if the API is unreachable; never fabricates rows. */}
      <TrendingBoard />

      {/* What exactly is this — the satire, stated plainly. */}
      <section className="border-y border-hairline bg-paper">
        <div className="mx-auto grid max-w-6xl gap-6 px-6 py-10 md:grid-cols-[auto_1fr] md:items-center md:gap-12">
          <p className="eyebrow text-ink-soft">
            What is this
          </p>
          <p className="max-w-3xl font-display text-xl font-bold leading-snug tracking-tight md:text-2xl">
            A joke site that takes startup hype seriously. We read a
            company&rsquo;s public web page and score the page
            <span className="text-hazard"> from 0 (pure vapor) to 100 (certified real)</span>.
            We make fun of the words — never the people behind them. Six
            checks, one score.
          </p>
        </div>
      </section>

      {/* The joke, written straight (§2.8) */}
      <section className="mx-auto max-w-6xl px-6 py-16 md:py-20">
        <p className="max-w-2xl font-display text-2xl font-bold leading-snug tracking-tight md:text-3xl">
          Every AI startup is &lsquo;revolutionizing&rsquo; something.
          <br />
          <span className="text-ink-soft">We measure exactly how much.</span>
        </p>
        <div className="mt-8 grid gap-8 border-t border-hairline pt-8 sm:grid-cols-3">
          <div>
            <p className="font-data text-2xl font-bold tabular-nums">6</p>
            <p className="mt-1 text-base text-ink-soft">
              checks per test — hype words, big claims, empty promises,
              missing prices, and old pages.
            </p>
          </div>
          <div>
            <p className="font-data text-2xl font-bold tabular-nums">0–100</p>
            <p className="mt-1 text-base text-ink-soft">
              the Sniff Score. 0 is pure vapor, 100 is certified real. The two
              biggest checks count the most, and you can re-test any page.
            </p>
          </div>
          <div>
            <p className="font-data text-2xl font-bold tabular-nums">$0</p>
            <p className="mt-1 text-base text-ink-soft">
              to test, to view, to share. Founders only pay to re-test
              faster — or to prove they&rsquo;re real.
            </p>
          </div>
        </div>
      </section>

      {/* Slot B: rented banner above the footer. When empty, one quiet
          line — never an empty box. */}
      <SponsorSlot sponsor={sponsors[1] ?? null} emptyInvite />
    </main>
  );
}

function NotFound() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-20 md:py-28">
      <p className="eyebrow text-hazard-ink">
        404
      </p>
      <h1 className="mt-4 font-display text-4xl font-bold tracking-tight md:text-5xl">
        This page doesn&rsquo;t exist.
      </h1>
      <p className="mt-3 max-w-xl text-lg leading-relaxed text-ink-soft">
        Unlike most startups, we&rsquo;ll admit it.
      </p>
      <Link
        to="/"
        className="tap-target mt-8 inline-flex items-center gap-2 font-data text-sm font-medium uppercase tracking-[0.18em] text-ink-soft transition-colors hover:text-hazard"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={2.25} />
        Back to the start
      </Link>
    </main>
  );
}
