import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FlaskConical } from 'lucide-react';

/**
 * The real footer (Chat A, Sep 21 — Antigravity-inspired rebuild).
 *
 * Layout, top to bottom:
 *   1. CTA block — Joshua's beloved sign-off kept big ("No startups were
 *      harmed. Several were exposed.") + the "Go sniff something." button.
 *   2. Link columns — only real destinations, every one resolves.
 *   3. The giant SniffMySite wordmark — the centerpiece.
 *   4. Bottom legal/status bar — parody disclaimer, copyright, honest status.
 *
 * The CTA behaves exactly like the navbar's "Sniff a site": on `/` it
 * smooth-scrolls to the scan box (#sniff) and focuses the input; from any
 * other route it navigates to /#sniff first, then focuses. (Navbar is
 * untouched by design, so the small scroll/focus helpers are re-implemented
 * here rather than imported.)
 */
function scrollToScanBox() {
  const el = document.getElementById('sniff');
  if (!el) return;
  const reduceMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches;
  el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
}

function focusScanInput() {
  document.getElementById('scan-input')?.focus({ preventScroll: true });
}

function SniffSomethingButton() {
  const location = useLocation();
  const navigate = useNavigate();
  const pendingFocus = useRef(false);

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
    if (location.pathname === '/') {
      scrollToScanBox();
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
      className="tap-target inline-flex min-h-[44px] items-center justify-center gap-2.5 bg-hazard px-8 font-data text-sm font-bold uppercase tracking-[0.18em] text-paper transition-colors hover:bg-hazard-deep"
    >
      <FlaskConical className="h-5 w-5" strokeWidth={2.25} aria-hidden="true" />
      Go sniff something.
    </button>
  );
}

const SITE_LINKS = [
  { to: '/#sniff', label: 'Sniff a site' },
  { to: '/leaderboard', label: 'Leaderboard' },
  { to: '/leaderboard#how-it-works', label: 'How it works' },
  { to: '/pricing', label: 'Pricing' },
];

const FOUNDER_LINKS = [
  { to: '/verify', label: 'Claim your page' },
  { to: '/launch', label: 'Roast my launch' },
  { to: '/pricing', label: 'Audits & re-scans' },
];

function LinkColumn({
  title,
  links,
  ariaLabel,
}: {
  title: string;
  links: Array<{ to: string; label: string }>;
  ariaLabel: string;
}) {
  return (
    <nav aria-label={ariaLabel}>
      <p className="eyebrow text-ink-faint">{title}</p>
      <ul className="mt-3">
        {links.map((l) => (
          <li key={l.label}>
            <Link
              to={l.to}
              className="tap-target inline-flex min-h-[44px] items-center text-lg text-ink-soft transition-colors hover:text-hazard"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Fires once when the element first scrolls into view: the wordmark gently
 * floats up and in. Reduced-motion users get the final state immediately —
 * no animation at all. The observer disconnects after the first reveal so
 * it never re-triggers.
 */
function useRevealOnce() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            io.disconnect();
          }
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return { ref, visible };
}

export function Footer() {
  const wordmark = useRevealOnce();

  return (
    <footer className="overflow-x-clip border-t border-hairline bg-paper">
      {/* 1 — the sign-off + CTA, side by side with the link columns. */}
      <div className="mx-auto max-w-6xl px-6 pb-4 pt-14 md:pt-20">
        <div className="grid gap-12 lg:grid-cols-[1.25fr_1fr] lg:gap-16">
          <div>
            <p className="eyebrow text-ink-soft">The nose never sleeps</p>
            <p className="mt-4 font-display text-3xl font-bold leading-tight tracking-tight md:text-5xl">
              No startups were harmed.
              <br />
              Several were exposed.
            </p>
            <p className="mt-4 max-w-md text-lg leading-relaxed text-ink-soft">
              Got a page that smells? Paste the URL. We read it so you
              don&rsquo;t have to.
            </p>
            <div className="mt-6">
              <SniffSomethingButton />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:gap-12">
            <LinkColumn
              title="The site"
              links={SITE_LINKS}
              ariaLabel="Site"
            />
            <LinkColumn
              title="Founders"
              links={FOUNDER_LINKS}
              ariaLabel="For founders"
            />
          </div>
        </div>
      </div>

      {/* 2 — the giant wordmark. The centerpiece: a home link, huge,
          properly centered (tracking-tight is near-zero trailing space,
          so plain text-center is optically true), and floating in the
          first time it scrolls into view. */}
      <div
        ref={wordmark.ref}
        className={`mx-auto max-w-6xl px-6 pb-10 pt-10 transition-all duration-[800ms] ease-[cubic-bezier(0.22,1,0.36,1)] md:pb-14 md:pt-14 ${
          wordmark.visible
            ? 'translate-y-0 opacity-100'
            : 'translate-y-10 opacity-0 will-change-transform'
        }`}
      >
        <Link
          to="/"
          aria-label="SniffMySite home"
          className="block select-none"
        >
          <span
            aria-hidden="true"
            className="block whitespace-nowrap text-center font-display text-[clamp(2rem,10vw,9.5rem)] font-bold uppercase leading-none tracking-tight text-ink"
          >
            SniffMySite
          </span>
        </Link>
      </div>

      {/* 3 — the bottom bar: parody disclaimer, copyright, honest status. */}
      <div className="border-t border-hairline">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-5 md:flex-row md:items-center md:justify-between">
          <p className="max-w-2xl text-sm leading-relaxed text-ink-faint">
            Scores come from an automated nose reading public landing
            pages. We joke about the words on the page — never the
            people behind them. A bad score isn&rsquo;t forever: fix the
            page, sniff it again.
          </p>
          <p className="shrink-0 font-data text-[13px] uppercase tracking-[0.18em] text-ink-faint">
            © 2026 · Sniff Score v1 · nose operational
          </p>
        </div>
      </div>
    </footer>
  );
}
