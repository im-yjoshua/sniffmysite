import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Flame, BadgeCheck } from 'lucide-react';
import { SiteHeader } from '../components/SiteHeader';
import { SiteFooter } from '../components/SiteFooter';
import { ReportCardButton } from '../components/ReportCardButton';
import {
  COMPANIES,
  companySlug,
  formatBurn,
  formatRaised,
  formatRunway,
  runwayEndsAt,
} from '../lib/mock';

/**
 * Company page — `/c/:slug` (§3.3, Task 5).
 *
 * Data path (be explicit):
 *   1. LIVE PATH: GET /api/burn/company/:slug → real `live` row from
 *      burn.companies, with runway_ends_at computed server-side.
 *   2. DEMO FALLBACK: if the API is unreachable or returns 5xx (local dev
 *      without SUPABASE_SERVICE_ROLE_KEY), resolve the slug against the
 *      fictional mock catalog so the page always renders. An API 404 means
 *      "no such burner" and shows the deadpan 404 — the mock is NOT
 *      consulted, so a deleted/unknown slug never resurrects as demo data.
 */

export interface CompanyDetail {
  slug: string;
  domain: string;
  name: string;
  monthly_burn: number;
  runway_months: number | null;
  headcount: number | null;
  funding_raised: number | null;
  listed_at: string;
  runway_ends_at: string | null;
  /** Task 7/8: founder proved email + domain ownership. */
  claimed?: boolean;
  /** Task 8: badge types on the shelf (e.g. 'verified_burner'). */
  badges?: string[];
  /** Task 8: purchased report card theme. */
  theme?: string;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ok'; detail: CompanyDetail; source: 'live' | 'demo' }
  | { kind: 'not-found' };

function detailFromMock(slug: string): CompanyDetail | null {
  const c = COMPANIES.find((m) => companySlug(m) === slug);
  if (!c) return null;
  return {
    slug,
    domain: c.domain,
    name: c.name,
    monthly_burn: c.monthly_burn,
    runway_months: c.runway_months,
    headcount: c.headcount,
    funding_raised: c.funding_raised,
    listed_at: c.listed_at,
    runway_ends_at: runwayEndsAt(c.listed_at, c.runway_months),
    claimed: false,
    badges: [],
    theme: 'terminal',
  };
}

function useCompanyDetail(slug: string): LoadState {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });

    (async () => {
      try {
        const res = await fetch(`/api/burn/company/${encodeURIComponent(slug)}`);
        if (cancelled) return;
        if (res.status === 404) {
          setState({ kind: 'not-found' });
          return;
        }
        if (!res.ok) throw new Error(`api ${res.status}`);
        const detail = (await res.json()) as CompanyDetail;
        setState({ kind: 'ok', detail, source: 'live' });
      } catch {
        // DEMO FALLBACK: no API (local dev without server env) → mock catalog.
        if (cancelled) return;
        const detail = detailFromMock(slug);
        setState(detail ? { kind: 'ok', detail, source: 'demo' } : { kind: 'not-found' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  return state;
}

/** Ticks every second while the page is mounted. Content, not decoration. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function Countdown({ endsAt }: { endsAt: string }) {
  const now = useNow();
  const remainingMs = useMemo(() => new Date(endsAt).getTime() - now, [endsAt, now]);

  if (remainingMs <= 0) {
    return (
      <div aria-live="polite">
        <p className="font-display text-3xl font-bold tracking-tight text-text md:text-4xl">
          Runway: 0 days. <span className="text-ash">Status: airborne.</span>
        </p>
        <p className="mt-3 font-data text-xs uppercase tracking-[0.2em] text-ash">
          not financial advice, obviously.
        </p>
      </div>
    );
  }

  const totalSec = Math.floor(remainingMs / 1000);
  const units = [
    { value: Math.floor(totalSec / 86_400), label: 'days' },
    { value: Math.floor((totalSec % 86_400) / 3_600), label: 'hrs' },
    { value: Math.floor((totalSec % 3_600) / 60), label: 'min' },
    { value: totalSec % 60, label: 'sec' },
  ];
  const danger = remainingMs < 7 * 86_400_000; // under 7 days: the furnace is close

  return (
    <div aria-live="off">
      <div className="grid max-w-xl grid-cols-4 gap-4">
        {units.map((u) => (
          <div key={u.label} className="border-t border-divider pt-3">
            <p
              className={`tabular font-data text-4xl font-bold md:text-5xl ${
                danger ? 'text-ember' : 'text-text'
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
      <p className="mt-4 font-data text-xs uppercase tracking-[0.2em] text-ash">
        {danger ? 'runway critical — ' : ''}not financial advice, obviously.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-divider py-4">
      <p className="font-data text-[11px] uppercase tracking-[0.22em] text-ash">{label}</p>
      <p className="tabular mt-1.5 font-data text-lg font-bold text-text">{value}</p>
    </div>
  );
}

function CompanyView({ detail }: { detail: CompanyDetail }) {
  const listedDate = new Date(detail.listed_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <main className="mx-auto max-w-5xl px-6 pb-20 pt-10">
      <Link
        to="/"
        className="font-data text-xs uppercase tracking-[0.2em] text-ash underline-offset-4 hover:text-text hover:underline"
      >
        ← Back to the burn board
      </Link>

      <header className="mt-8 border-b border-divider pb-8">
        <p className="font-data text-xs uppercase tracking-[0.22em] text-ash">{detail.domain}</p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-text md:text-6xl">
          {detail.name}
        </h1>
        <p className="tabular mt-4 font-data text-3xl font-bold text-ember md:text-4xl">
          {formatBurn(detail.monthly_burn)}
        </p>
        <p className="mt-1 font-data text-xs uppercase tracking-[0.2em] text-ash">
          self-reported monthly burn · audited by vibes
        </p>
      </header>

      <section aria-label="Runway countdown" className="border-b border-divider py-10">
        <p className="mb-6 font-data text-[11px] uppercase tracking-[0.22em] text-ash">
          runway remaining
        </p>
        {detail.runway_ends_at ? (
          <Countdown endsAt={detail.runway_ends_at} />
        ) : (
          <p className="font-display text-2xl font-bold text-text">
            Runway: unknown. <span className="font-normal text-ash">Bold strategy.</span>
          </p>
        )}
      </section>

      <section aria-label="Burn stats" className="grid grid-cols-2 gap-x-8 md:grid-cols-4">
        <Stat label="runway" value={detail.runway_months != null ? formatRunway(detail.runway_months) : 'unknown'} />
        <Stat label="team" value={detail.headcount != null ? `${detail.headcount} mouths` : 'unknown'} />
        <Stat label="funding" value={formatRaised(detail.funding_raised)} />
        <Stat label="listed" value={listedDate} />
      </section>

      <section aria-label="Badge shelf" className="border-b border-divider py-10">
        <p className="font-data text-[11px] uppercase tracking-[0.22em] text-ash">badge shelf</p>
        {detail.badges?.includes('verified_burner') ? (
          <div className="mt-4">
            {/* The $9 Verified Burner stamp — rubber-stamp marker, not a
                glossy ribbon. Slight rotation sells the ink. */}
            <span className="inline-flex -rotate-2 items-center gap-2 border-2 border-ember px-4 py-2 font-data text-sm font-bold uppercase tracking-[0.18em] text-ember">
              <Flame className="h-4 w-4" aria-hidden="true" />
              Verified Burner
            </span>
            <p className="mt-3 text-sm text-ash">
              Certified as genuinely burning money. Audited by vibes.
            </p>
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-3 text-ash">
            <BadgeCheck className="h-6 w-6" aria-hidden="true" />
            <p className="text-sm">
              No badges yet. The Verified Burner flame drops soon.
            </p>
          </div>
        )}
        {/* Task 7 — the claim flow starts here. */}
        <Link
          to={`/claim?company=${encodeURIComponent(detail.slug)}`}
          className="mt-4 inline-block font-data text-xs uppercase tracking-[0.2em] text-ash underline-offset-4 hover:text-ember hover:underline"
        >
          Is this your burn? Claim it. →
        </Link>
        {detail.claimed && !detail.badges?.includes('verified_burner') && (
          <div className="mt-3">
            <Link
              to={`/pricing?product=badge&company=${encodeURIComponent(detail.slug)}`}
              className="inline-block border border-ember px-4 py-2 font-data text-xs font-bold uppercase tracking-[0.2em] text-ember transition-colors hover:bg-ember hover:text-bg"
            >
              Get verified — $9
            </Link>
            <p className="mt-2 font-data text-xs text-ash">
              The flame stamp. For founders who proved the burn is theirs.
            </p>
          </div>
        )}
      </section>

      <section aria-label="Report card" className="py-10">
        <p className="font-data text-[11px] uppercase tracking-[0.22em] text-ash">share the burn</p>
        {/* The PNG generator is Task 6 — live. Downloads, or opens the native
            share sheet with the card attached where the platform allows. */}
        <ReportCardButton
          slug={detail.slug}
          name={detail.name}
          monthlyBurn={detail.monthly_burn}
          runwayEndsAt={detail.runway_ends_at}
        />
        <p className="mt-3 font-data text-xs text-ash">
          1200×630. Made for group chats and investor updates.
        </p>
        <Link
          to={`/pricing?product=theme&company=${encodeURIComponent(detail.slug)}`}
          className="mt-3 inline-block font-data text-xs uppercase tracking-[0.2em] text-ash underline-offset-4 hover:text-ember hover:underline"
        >
          Custom card skins — $4. Doom, Copium, Diamond hands. →
        </Link>
      </section>
    </main>
  );
}

function NotFoundView() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-5xl flex-col items-center justify-center px-6 text-center">
      <Flame className="h-10 w-10 text-ember" aria-hidden="true" />
      <h1 className="mt-6 font-display text-3xl font-bold tracking-tight text-text md:text-4xl">
        This burner doesn&apos;t exist.
      </h1>
      <p className="mt-3 max-w-md text-ash">Or it burned out completely. Either way, there&apos;s nothing left to count down.</p>
      <Link
        to="/"
        className="mt-8 font-data text-xs uppercase tracking-[0.2em] text-ash underline-offset-4 hover:text-text hover:underline"
      >
        ← Back to the burn board
      </Link>
    </main>
  );
}

export function CompanyPage() {
  const { slug = '' } = useParams();
  const state = useCompanyDetail(slug);

  return (
    <div className="min-h-screen bg-bg text-text">
      <SiteHeader />
      {state.kind === 'loading' && (
        <main className="mx-auto max-w-5xl px-6 py-20">
          <p className="font-data text-sm uppercase tracking-[0.22em] text-ash">stoking the furnace…</p>
        </main>
      )}
      {state.kind === 'not-found' && <NotFoundView />}
      {state.kind === 'ok' && <CompanyView detail={state.detail} />}
      <SiteFooter />
    </div>
  );
}
