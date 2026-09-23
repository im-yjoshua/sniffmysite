import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FlaskConical, Menu, X } from 'lucide-react';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';
import { Ticker } from './Ticker';

/**
 * The navbar that finally does things (Chat A, Sep 21).
 *
 * Row 1 (the bar): logo + wordmark → `/`, five real links (Sniff,
 * Leaderboard, Movers, How it works, Pricing — every one resolves to a real
 * page or anchor, no dead ends), and the prominent "Sniff a site" CTA.
 *
 * The CTA works from every page: on `/` it smooth-scrolls to the scan box
 * (#sniff) and focuses the input; from any other route it navigates to
 * /#sniff first, then focuses once the landing page is there.
 *
 * Row 2 (the playful part): the latest-sniffs ticker. Sticky top-0 with a
 * paper background so the CTA is always one tap away; the ticker is
 * slimmed down on small screens. Narrow screens get a hamburger (44px,
 * aria-expanded) opening a stacked panel instead of the old
 * sideways-scroll nav.
 */
const LINKS = [
  { to: '/#sniff', label: 'Sniff' },
  { to: '/leaderboard', label: 'Leaderboard' },
  { to: '/movers', label: 'Movers' },
  { to: '/launch', label: 'Launch' },
  { to: '/leaderboard#how-it-works', label: 'How it works' },
  { to: '/pricing', label: 'Pricing' },
];

function focusScanInput() {
  document.getElementById('scan-input')?.focus({ preventScroll: true });
}

function scrollToScanBox() {
  const el = document.getElementById('sniff');
  if (!el) return;
  const reduceMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches;
  el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
}

/**
 * The prominent "Sniff a site" CTA (hazard bg, high contrast). Works from
 * every page: scroll + focus when already on `/`, navigate-then-focus
 * from anywhere else.
 */
function SniffCta({
  className = '',
  onNavigate,
}: {
  className?: string;
  onNavigate?: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const pendingFocus = useRef(false);

  // After navigating to /#sniff from another route, focus the input once
  // the landing page (and the scroll manager) has settled.
  useEffect(() => {
    if (
      pendingFocus.current &&
      location.pathname === '/' &&
      location.hash === '#sniff'
    ) {
      pendingFocus.current = false;
      const t = window.setTimeout(focusScanInput, 400);
      return () => window.clearTimeout(t);
    }
  }, [location]);

  const go = () => {
    onNavigate?.();
    if (location.pathname === '/') {
      scrollToScanBox();
      // Let the scroll settle, then put the cursor in the box.
      window.setTimeout(focusScanInput, 450);
    } else {
      pendingFocus.current = true;
      navigate('/#sniff');
    }
  };

  return (
    <button
      type="button"
      onClick={go}
      className={`tap-target inline-flex min-h-[44px] items-center justify-center gap-2 bg-hazard px-6 font-data text-sm font-bold uppercase tracking-[0.18em] text-paper transition-colors hover:bg-hazard-deep ${className}`}
    >
      <FlaskConical className="h-5 w-5" strokeWidth={2.25} aria-hidden="true" />
      Sniff a site
    </button>
  );
}

export function Navbar() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  // Any navigation closes the mobile panel.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.hash]);

  const isActive = (to: string) => {
    const hashIdx = to.indexOf('#');
    const path = hashIdx === -1 ? to : to.slice(0, hashIdx);
    const hash = hashIdx === -1 ? '' : to.slice(hashIdx);
    return location.pathname === path && (hash === '' || location.hash === hash);
  };

  return (
    <header className="sticky top-0 z-40 bg-paper">
      {/* Row 1: the bar */}
      <div className="border-b border-hairline">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <Link
            to="/"
            className="tap-target flex min-h-[44px] shrink-0 items-center gap-2.5"
            aria-label="SniffMySite home"
          >
            <span className="text-ink">
              <Logo className="h-8 w-8" />
            </span>
            <span className="font-display text-xl font-bold uppercase tracking-tight">
              SniffMySite
            </span>
          </Link>

          <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
            {LINKS.map((l) => (
              <Link
                key={l.label}
                to={l.to}
                aria-current={isActive(l.to) ? 'page' : undefined}
                className={`tap-target flex min-h-[44px] items-center px-3 font-data text-sm font-medium uppercase tracking-[0.14em] transition-colors hover:text-hazard ${
                  isActive(l.to) ? 'text-ink' : 'text-ink-soft'
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <SniffCta className="hidden md:inline-flex" />
            <button
              type="button"
              className="tap-target flex h-11 w-11 items-center justify-center text-ink md:hidden"
              aria-expanded={open}
              aria-controls="mobile-nav"
              aria-label={open ? 'Close menu' : 'Open menu'}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? (
                <X className="h-6 w-6" aria-hidden="true" />
              ) : (
                <Menu className="h-6 w-6" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile panel: the four links + CTA, stacked. No sideways scroll. */}
        {open && (
          <nav
            id="mobile-nav"
            aria-label="Primary"
            className="border-t border-hairline px-4 pb-4 pt-2 md:hidden"
          >
            <ul className="flex flex-col">
              {LINKS.map((l) => (
                <li key={l.label}>
                  <Link
                    to={l.to}
                    aria-current={isActive(l.to) ? 'page' : undefined}
                    className={`tap-target flex min-h-[44px] items-center border-b border-hairline font-data text-sm font-medium uppercase tracking-[0.14em] transition-colors hover:text-hazard ${
                      isActive(l.to) ? 'text-ink' : 'text-ink-soft'
                    }`}
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
              <li className="pt-3">
                <SniffCta
                  className="w-full"
                  onNavigate={() => setOpen(false)}
                />
              </li>
            </ul>
          </nav>
        )}
      </div>

      {/* Row 2: the latest-sniffs ticker (slimmer on small screens). */}
      <Ticker />
    </header>
  );
}
