import { useEffect, useState } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { ScanBox } from './components/ScanBox';
import { Leaderboard } from './components/Leaderboard';
import { TrendingBoard } from './components/TrendingBoard';
import { MeanderDivider } from './components/seals/MeanderDivider';
import { Reveal } from './components/Reveal';
import { ScanPage } from './pages/ScanPage';
import { ComparePage } from './pages/ComparePage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { PricingPage } from './pages/PricingPage';
import { RoastedPage } from './pages/RoastedPage';
import { AdminSponsorsPage } from './pages/AdminSponsorsPage';
import { SponsorSlot } from './components/SponsorSlot';
import { fetchSponsors, type PublicSponsor } from './lib/api';

/**
 * SniffMySite app shell.
 * Routes: `/` the arena (§2.3), `/scan?url=…` the judgment (Task 5),
 * `/leaderboard` the standings (Task 6), `/battle` head-to-head (§2.12),
 * `/pricing` the gift shop (Task 9). `/admin/sponsors` stays hidden.
 */
export function App() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <ScrollManager />
      <Navbar />

      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/scan" element={<ScanPage />} />
        <Route path="/battle" element={<ComparePage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        {/* Polar success URL (?checkout_id=… is display-only). */}
        <Route path="/roasted" element={<RoastedPage />} />
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
 * same-route hash links (/#sniff, /leaderboard#how-it-works) and scroll-to-top on page change.
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

/** The three steps of the ritual — the only explanation the home page needs. */
const RITUAL_STEPS = [
  {
    numeral: 'I',
    title: 'Enter the arena',
    body: 'Paste any landing page\u2019s web address. The gates take about thirty seconds — no account, no fee.',
  },
  {
    numeral: 'II',
    title: 'The six ordeals',
    body: 'Hype words. Grand claims. Empty promises. Hidden prices. Stale pages. Six checks, weighed — the two biggest count the most.',
  },
  {
    numeral: 'III',
    title: 'The thumb falls',
    body: 'A Sniff Score from 0 to 100, a verdict from LAUREATE to LION FOOD, and every finding shown with its evidence.',
  },
] as const;

function LandingPage() {
  // When a leaderboard row's "sniff again" is clicked, the domain is seeded
  // into the hero scan box via location state:
  // navigate('/#sniff', { state: { seedUrl } }).
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

  // A standings row's "sniff again" seeds the hero scan box; the ScanBox
  // effect scrolls it into view.
  const sniffAgain = (domain: string) => setScanSeed(domain);

  return (
    <main>
      {/* 1 — Hero: the judgment, in one breath. */}
      <section className="mx-auto max-w-3xl px-6 pb-14 pt-12 text-center md:pb-20 md:pt-20">
        <Reveal>
          <p className="eyebrow text-ink-soft">
            The Colosseum of Landing Pages
          </p>
          <h1 className="mt-4 font-inscription text-5xl font-bold uppercase leading-[1.05] tracking-tight md:text-7xl">
            Every landing page enters.
            <br />
            <span className="text-hazard">Few leave standing.</span>
          </h1>
        </Reveal>

        {/* The arena gate — the CTA's target. scroll-mt clears the sticky navbar. */}
        <div id="sniff" className="mt-10 scroll-mt-40 text-left">
          <ScanBox seedUrl={scanSeed} onSeedConsumed={() => setScanSeed('')} />
        </div>
        <p className="mt-4 font-data text-xs uppercase tracking-[0.22em] text-ink-faint">
          Morituri te salutant — those about to be judged salute you.
        </p>
        <p className="mt-3 text-sm uppercase tracking-[0.14em] text-ink-faint">
          Got two pages?{' '}
          <Link
            to="/battle"
            className="tap-target inline-flex items-center font-medium text-hazard-ink underline decoration-hazard-ink/40 underline-offset-4 hover:decoration-hazard-ink"
          >
            Pit them against each other
          </Link>
        </p>
      </section>

      {/* The meander — a border between the promise and the proof. */}
      <div className="mx-auto max-w-6xl px-6" aria-hidden="true">
        <MeanderDivider className="text-ink-faint" />
      </div>

      {/* 2 — How the judgment works: three steps, no more. */}
      <section className="mx-auto max-w-6xl px-6 py-14 md:py-20" aria-label="How the judgment works">
        <Reveal>
          <p className="eyebrow text-ink-soft">The ritual</p>
          <h2 className="mt-4 font-inscription text-4xl font-bold uppercase tracking-tight md:text-5xl">
            How the judgment works
          </h2>
        </Reveal>
        <ol className="mt-10 grid gap-10 border-t border-hairline pt-10 sm:grid-cols-3">
          {RITUAL_STEPS.map((s, i) => (
            <li key={s.numeral}>
              <Reveal delay={i * 90}>
                <p className="font-inscription text-4xl font-bold text-hazard" aria-hidden="true">
                  {s.numeral}
                </p>
                <h3 className="mt-3 text-xl font-bold tracking-tight">
                  {s.title}
                </h3>
                <p className="mt-2 text-base leading-relaxed text-ink-soft">
                  {s.body}
                </p>
              </Reveal>
            </li>
          ))}
        </ol>
      </section>

      {/* 3 — The Standings, top 10. The live feed (ticker) already runs in
          the navbar on every page: "Judgments, as they fall." */}
      <section className="mx-auto max-w-6xl px-6 pb-14 md:pb-20">
        <Reveal>
          <Leaderboard onSniffAgain={sniffAgain} />
        </Reveal>
        <p className="mt-6 text-center">
          <Link
            to="/leaderboard"
            className="tap-target inline-flex min-h-[44px] items-center font-data text-sm font-medium uppercase tracking-[0.18em] text-ink-soft transition-colors hover:text-hazard"
          >
            See the full standings
          </Link>
        </p>
      </section>

      {/* 4 — The Lions' Den: the five most vapor pages. */}
      <section className="mx-auto max-w-6xl px-6 pb-14 md:pb-20">
        <Reveal>
          <Leaderboard variant="vapor" onSniffAgain={sniffAgain} />
        </Reveal>
      </section>

      {/* Slot A: rented banner. A full section away from the scores —
          sponsorship never sits next to a ranking. */}
      <SponsorSlot sponsor={sponsors[0] ?? null} />

      {/* 5 — Most sniffed: the pages people keep testing. */}
      <TrendingBoard />

      {/* 6 — The CTA band: one last gate before the footer. */}
      <section className="border-y border-hairline bg-paper" aria-label="Sniff another page">
        <div className="mx-auto max-w-3xl px-6 py-14 text-center md:py-20">
          <Reveal>
            <h2 className="font-inscription text-4xl font-bold uppercase tracking-tight md:text-5xl">
              Veni, vidi, vici.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-ink-soft">
              I came, I saw, I judged. One more page — the arena is waiting.
            </p>
            <div className="mt-8 text-left">
              <ScanBox
                seedUrl=""
                onSeedConsumed={() => {}}
                inputId="scan-input-cta"
              />
            </div>
          </Reveal>
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
      <h1 className="mt-4 font-inscription text-4xl font-bold uppercase tracking-tight md:text-5xl">
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
