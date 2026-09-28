import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchThrone,
  ScanApiError,
  type ThroneState,
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

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

/**
 * The Throne — the paid spotlight atop the Grand Hall (Phase B7).
 *
 * Renders whatever GET /api/vapor/throne returns: the current holder
 * (labeled PAID, always — money bought the spotlight, never the score)
 * with the price to steal it, or the empty-throne CTA at the opening
 * bid. On fetch failure it renders nothing: better silent than wrong
 * in either direction.
 */
export function ThroneCard() {
  const [throne, setThrone] = useState<ThroneState | undefined>(undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetchThrone()
      .then((t) => {
        if (live) setThrone(t);
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

  if (failed || throne === undefined) return null;

  return (
    <section
      aria-label={throne.occupied ? 'The throne' : 'Throne invitation'}
      className="mt-8 border-2 border-ink"
    >
      {throne.occupied && throne.holder ? (
        <HolderBody throne={throne} />
      ) : (
        <EmptyThrone minBid={throne.min_bid_cents} />
      )}
    </section>
  );
}

function HolderBody({ throne }: { throne: ThroneState }) {
  const holder = throne.holder!;
  const tier = asTierLabel(holder.tier);
  const heldUntil = new Date(holder.expires_at).toLocaleDateString(undefined, {
    dateStyle: 'medium',
  });

  return (
    <div className="p-6 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="eyebrow text-ink-soft">
          The Throne{' '}
          <span className="ml-2 border border-hazard px-2 py-0.5 font-data text-xs font-bold uppercase tracking-[0.18em] text-hazard">
            Paid
          </span>
        </p>
        <SPQRBadge className="h-7 w-auto text-ink-faint" />
      </div>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <p className="break-all font-data text-lg font-semibold text-ink">
            {holder.domain}
          </p>
          {holder.verdict && (
            <p className="mt-2 font-inscription text-3xl font-bold uppercase tracking-tight md:text-4xl">
              {holder.verdict}
            </p>
          )}
        </div>
        <div className="flex items-center gap-4">
          {tier && <TierMark tier={tier} size={44} />}
          {holder.score !== null && (
            <p className="font-data text-5xl font-bold tabular-nums text-hazard">
              {holder.score}
            </p>
          )}
        </div>
      </div>

      <p className="mt-4 text-base leading-relaxed text-ink-soft">
        Took the throne for {dollars(holder.price_cents)}. Holds it until{' '}
        {heldUntil} &mdash; unless someone outbids them by $3 first. The bid
        is paid; the score was earned in the open, like everyone
        else&rsquo;s.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-3">
        <Link
          to={`/scan?url=${encodeURIComponent(holder.url)}`}
          className="tap-target inline-flex items-center font-data text-sm font-bold uppercase tracking-[0.18em] text-ink hover:text-hazard hover:underline"
        >
          Read the full roast
        </Link>
        <Link
          to="/pricing#throne"
          className="tap-target inline-flex items-center font-data text-sm font-bold uppercase tracking-[0.18em] text-hazard hover:underline"
        >
          Steal the throne &mdash; {dollars(throne.min_bid_cents)}
        </Link>
      </div>
    </div>
  );
}

function EmptyThrone({ minBid }: { minBid: number }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-6 p-6 md:p-8">
      <div className="max-w-xl">
        <p className="eyebrow text-ink-soft">The Throne</p>
        <p className="mt-3 font-inscription text-3xl font-bold uppercase tracking-tight md:text-4xl">
          The throne is empty.
        </p>
        <p className="mt-2 text-lg leading-relaxed text-ink-soft">
          No site holds the spotlight right now. {dollars(minBid)} takes it
          for up to 3 days &mdash; roasted in full, labeled as paid, until
          someone outbids you by $3.
        </p>
      </div>
      <Link
        to="/pricing#throne"
        className="tap-target inline-flex shrink-0 items-center justify-center bg-hazard px-8 py-4 font-data text-sm font-bold uppercase tracking-wider text-paper transition-colors hover:bg-hazard-deep"
      >
        Bid {dollars(minBid)} &mdash; take the throne
      </Link>
    </div>
  );
}
