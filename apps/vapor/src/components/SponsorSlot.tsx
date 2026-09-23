import { Link } from 'react-router-dom';
import type { PublicSponsor } from '../lib/api';

/**
 * One rented homepage banner slot.
 *
 * PRODUCT RULES, baked in:
 * - Always labeled "Sponsored" — the eyebrow is non-negotiable.
 * - Sponsorship never touches scores: this component knows nothing about
 *   scoring, rankings, or the leaderboard, and the landing page keeps both
 *   slots a full section away from any score.
 * - Empty state: Slot A renders nothing; Slot B renders one quiet line.
 *
 * Class names stay neutral (.sponsor-slot / .sponsor-frame) — nothing
 * containing "ad".
 */
export function SponsorSlot({
  sponsor,
  emptyInvite = false,
}: {
  sponsor: PublicSponsor | null;
  /** Slot B only: when empty, show the one tasteful invite line. */
  emptyInvite?: boolean;
}) {
  if (sponsor) {
    return (
      <section className="sponsor-slot" aria-label="Sponsored banner">
        <div className="sponsor-slot-inner">
          <p className="eyebrow text-ink-faint">Sponsored</p>
          <a
            className="sponsor-frame"
            href={sponsor.dest_url}
            target="_blank"
            rel="sponsored noopener"
            title={sponsor.brand_name}
          >
            <img
              src={sponsor.image_url}
              alt={sponsor.alt_text}
              loading="lazy"
            />
          </a>
        </div>
      </section>
    );
  }

  if (emptyInvite) {
    return (
      <section className="sponsor-invite" aria-label="Sponsor invitation">
        <Link
          to="/pricing"
          className="tap-target inline-block font-data text-sm uppercase tracking-[0.18em] text-ink-soft underline decoration-hairline underline-offset-4 transition-colors hover:text-hazard"
        >
          Your banner here — reach founders
        </Link>
      </section>
    );
  }

  return null;
}
