import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchFeatured,
  ScanApiError,
  type FeaturedRoast,
} from '../lib/api';
import type { TierLabel } from '../lib/tiers';
import { TierMark } from './seals/TierMark';
import { SPQRBadge } from './seals/SPQRBadge';

const TIERS: TierLabel[] = [
  'LAUREATE',
  'GLADIATOR',
  'RECRUIT',
  'JESTER',
  'LION FOOD',
];

function asTierLabel(tier: string | null): TierLabel | null {
  return tier !== null && (TIERS as string[]).includes(tier)
    ? (tier as TierLabel)
    : null;
}

/**
 * Sponsored Champion — the paid pin above the standings.
 *
 * Renders whatever GET /api/vapor/featured returns: the active roast
 * (labeled PAID, always — money bought the spotlight, never the score),
 * or the empty-throne CTA when nobody holds it. On fetch failure it
 * renders nothing: better silent than wrong in either direction.
 */
export function SponsoredChampionCard() {
  const [featured, setFeatured] = useState<FeaturedRoast | null | undefined>(
    undefined,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetchFeatured()
      .then((f) => {
        if (live) setFeatured(f);
      })
      .catch((err) => {
        if (live) {
          if (!(err instanceof ScanApiError)) throw err;
          setFailed(true);
        }
      });
    return () => {
      live = false;
    };
  }, []);

  if (failed || featured === undefined) return null;

  return (
    <section
      aria-label={featured ? 'Sponsored champion' : 'Sponsor invitation'}
      className="mt-8 border-2 border-ink"
    >
      {featured ? (
        <ChampionBody featured={featured} />
      ) : (
        <EmptyThrone />
      )}
    </section>
  );
}

function ChampionBody({ featured }: { featured: FeaturedRoast }) {
  const tier = asTierLabel(featured.tier);
  const verdict = featured.roast?.verdict;
  const pinnedUntil = new Date(featured.expires_at).toLocaleDateString(
    undefined,
    { dateStyle: 'medium' },
  );

  return (
    <div className="p-6 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="eyebrow text-ink-soft">
          Sponsored champion{' '}
          <span className="ml-2 border border-hazard px-2 py-0.5 font-data text-xs font-bold uppercase tracking-[0.18em] text-hazard">
            Paid
          </span>
        </p>
        <SPQRBadge className="h-7 w-auto text-ink-faint" />
      </div>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <p className="break-all font-data text-lg font-semibold text-ink">
            {featured.url}
          </p>
          {verdict && (
            <p className="mt-2 font-inscription text-3xl font-bold uppercase tracking-tight md:text-4xl">
              {verdict}
            </p>
          )}
        </div>
        <div className="flex items-center gap-4">
          {tier && <TierMark tier={tier} size={44} />}
          {featured.score !== null && (
            <p className="font-data text-5xl font-bold tabular-nums text-hazard">
              {featured.score}
            </p>
          )}
        </div>
      </div>

      <p className="mt-4 text-base leading-relaxed text-ink-soft">
        Pinned above the standings until {pinnedUntil}. The pin is paid;
        the score was earned in the open, like everyone else&rsquo;s.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-3">
        <Link
          to={`/scan?url=${encodeURIComponent(featured.url)}`}
          className="tap-target inline-flex items-center font-data text-sm font-bold uppercase tracking-[0.18em] text-ink hover:text-hazard hover:underline"
        >
          Read the full roast
        </Link>
        <Link
          to="/pricing"
          className="tap-target inline-flex items-center font-data text-sm font-bold uppercase tracking-[0.18em] text-hazard hover:underline"
        >
          Your site here &mdash; $19
        </Link>
      </div>
    </div>
  );
}

function EmptyThrone() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-6 p-6 md:p-8">
      <div className="max-w-xl">
        <p className="eyebrow text-ink-soft">Sponsored champion</p>
        <p className="mt-3 font-inscription text-3xl font-bold uppercase tracking-tight md:text-4xl">
          The throne is empty.
        </p>
        <p className="mt-2 text-lg leading-relaxed text-ink-soft">
          No site holds the spotlight right now. $19 puts yours above the
          standings for 7 days &mdash; roasted in full, labeled as paid.
        </p>
      </div>
      <Link
        to="/pricing"
        className="tap-target inline-flex shrink-0 items-center justify-center bg-hazard px-8 py-4 font-data text-sm font-bold uppercase tracking-wider text-paper transition-colors hover:bg-hazard-deep"
      >
        Claim the spotlight
      </Link>
    </div>
  );
}
