import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Share2 } from 'lucide-react';
import { RosetteBadge } from '../components/RosetteBadge';
import { SharePopup } from '../components/SharePopup';
import { BadgeSnippet } from '../components/BadgeSnippet';
import { SiteLogo } from '../components/SiteLogo';
import { EvidencePanel } from '../components/EvidencePanel';
import { MetricBars } from '../components/MetricBars';
import { useCountUp } from '../hooks/useCountUp';
import { SCORE_STORY } from '../lib/score-explainer';
import {
  fetchStartupProfile,
  ogCardUrl,
  ScanApiError,
  type ApiStartupProfile,
} from '../lib/api';
import { setPageMeta, resetPageMeta } from '../lib/meta';

/**
 * The specimen dossier — `/s/:slug` (§2.3, Task 7).
 * A lab file on one startup: the score, the official finding, the signal
 * breakdown, the score-history timeline (chapter one today — the redemption
 * arc writes itself when re-scans land), and the shareable exhibit.
 */
export function StartupProfilePage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [profile, setProfile] = useState<ApiStartupProfile | null>(null);
  const [error, setError] = useState<'not_found' | 'failed' | null>(null);

  const load = useCallback(async () => {
    setProfile(null);
    setError(null);
    try {
      const p = await fetchStartupProfile(slug);
      setProfile(p);
    } catch (e) {
      if (e instanceof ScanApiError && (e.status === 404 || e.status === 400)) {
        setError('not_found');
      } else {
        setError('failed');
      }
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  // Per-profile share tags while the dossier is open; restore defaults after.
  useEffect(() => {
    if (!profile) return;
    const { domain, current } = profile;
    setPageMeta({
      title: `${domain} — sniff score ${current.sniff_score}/100 · SniffMySite`,
      description: current.verdict,
      ogImage: ogCardUrl(profile.slug),
      ogUrl: `${window.location.origin}/s/${profile.slug}`,
    });
    return () => resetPageMeta();
  }, [profile]);

  const shown = useCountUp(
    profile?.current.sniff_score ?? 0,
    profile !== null,
  );

  return (
    <main className="mx-auto max-w-6xl px-6 pb-20 pt-10 md:pt-14">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b-2 border-ink pb-4">
        <p className="eyebrow text-ink-soft">
          Report card
        </p>
        <Link
          to="/leaderboard"
          className="tap-target flex items-center gap-2 font-data text-sm font-medium uppercase tracking-[0.18em] text-ink-soft transition-colors hover:text-hazard"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2.25} />
          Back to the rankings
        </Link>
      </div>

      {error === 'not_found' && (
        <div className="py-20 md:py-28">
          <p className="eyebrow text-hazard">
            No report
          </p>
          <h1 className="mt-4 font-display text-4xl font-bold tracking-tight md:text-5xl">
            No report for this page.
          </h1>
          <p className="mt-3 max-w-xl text-lg leading-relaxed text-ink-soft">
            Only ranked pages have reports. This one hasn&rsquo;t been tested
            yet.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link
              to="/"
              className="tap-target bg-hazard px-6 py-3.5 font-data text-sm font-bold uppercase tracking-wider text-paper transition-colors hover:bg-hazard-deep"
            >
              Sniff the page
            </Link>
            <Link
              to="/leaderboard"
              className="tap-target inline-flex items-center font-data text-sm font-medium uppercase tracking-[0.18em] text-ink-soft transition-colors hover:text-hazard"
            >
              Back to the rankings
            </Link>
          </div>
        </div>
      )}

      {error === 'failed' && (
        <div className="py-20 md:py-28">
          <p className="eyebrow text-hazard">
            Couldn&rsquo;t load
          </p>
          <h1 className="mt-4 font-display text-4xl font-bold tracking-tight md:text-5xl">
            We couldn&rsquo;t open this report.
          </h1>
          <p className="mt-3 max-w-xl text-lg leading-relaxed text-ink-soft">
            Nothing was lost — try again.
          </p>
          <button
            type="button"
            onClick={load}
            className="tap-target mt-8 inline-flex items-center font-data text-sm font-medium uppercase tracking-[0.18em] text-hazard hover:underline"
          >
            Try again
          </button>
        </div>
      )}

      {!error && !profile && (
        <p className="eyebrow py-20 text-center text-ink-faint md:py-28">
          Loading the report…
        </p>
      )}

      {!error && profile && (
        <Dossier profile={profile} shown={shown} />
      )}
    </main>
  );
}

function Dossier({
  profile,
  shown,
}: {
  profile: ApiStartupProfile;
  shown: number;
}) {
  const { domain, name, current, history } = profile;
  const [shareOpen, setShareOpen] = useState(false);

  const profileUrl = `${window.location.origin}/s/${profile.slug}`;
  const shareText = `${domain} scored ${current.sniff_score}/100 on SniffMySite. Verdict: ${current.tier}.`;

  const getCardBlob = useCallback(async (): Promise<Blob> => {
    const res = await fetch(ogCardUrl(profile.slug));
    if (!res.ok) throw new Error('card failed');
    return res.blob();
  }, [profile.slug]);

  return (
    <div>
      {/* Header: the site, the number, the stamp. */}
      <p className="eyebrow mt-8 text-ink-faint">
        {name} · {domain}
      </p>
      <div className="mt-3 flex items-center gap-4 md:gap-5">
        <SiteLogo domain={domain} size="lg" />
        <h1 className="break-all font-display text-4xl font-bold tracking-tight md:text-6xl">
          {domain}
        </h1>
      </div>

      <div className="flex flex-wrap items-end gap-x-12 gap-y-8 py-10 md:py-12">
        <div>
          <p className="eyebrow text-ink-faint">
            The lab has spoken
          </p>
          <p className="mt-3 font-data text-8xl font-bold tabular-nums leading-none text-hazard md:text-9xl">
            {shown}
          </p>
          <p className="mt-3 max-w-xs text-base leading-relaxed text-ink-soft">
            Sniff Score — 0 is pure vapor, 100 is certified real. Higher
            means more real.
          </p>
        </div>
        <div className="pb-3">
          <RosetteBadge tier={current.tier} size={128} />
        </div>
      </div>

      {/* Report left, evidence right (stacked on mobile). */}
      <div className="grid gap-10 lg:grid-cols-[1.12fr_1fr] lg:gap-14">
        <div>
          {/* The findings — the verdict, in plain words. */}
          <section className="border-t border-hairline py-8 md:py-10" aria-label="The findings">
            <p className="eyebrow text-ink-faint">
              The findings
            </p>
            <p className="mt-4 max-w-3xl font-display text-2xl font-bold leading-snug tracking-tight md:text-4xl">
              {current.verdict}
            </p>
          </section>

          {/* Show your work — six smell checks, findings first. */}
          <section className="border-t border-hairline py-8 md:py-10" aria-label="Show your work">
            <p className="eyebrow text-ink-faint">
              Show your work
            </p>
            <p className="mt-4 max-w-3xl text-lg leading-relaxed text-ink-soft">
              {SCORE_STORY}
            </p>
            <MetricBars metrics={current.metrics} />
          </section>
        </div>

        <div className="lg:pt-8">
          <EvidencePanel
            domain={domain}
            metrics={current.metrics}
            evidence={current.evidence ?? null}
            onShare={() => setShareOpen(true)}
          />
        </div>
      </div>

      {/* The redemption file — score history, the comeback story. */}
      <section className="border-t border-hairline py-8 md:py-10" aria-label="The redemption file">
        <p className="eyebrow text-ink-faint">
          The redemption file
        </p>
        <ol className="mt-6 max-w-3xl">
          {history.map((h, i) => (
            <li
              key={`${h.algo_version}-${h.scanned_at}`}
              className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-hairline py-5"
            >
              <span className="font-data text-sm uppercase tracking-[0.18em] text-ink-faint">
                Sniff {history.length - i} · scoring {h.algo_version}
              </span>
              <span className="font-data text-3xl font-bold tabular-nums text-hazard">
                {h.sniff_score}
              </span>
              <span className="flex items-center gap-2">
                <RosetteBadge tier={h.tier} size={40} />
                <span className="font-data text-sm uppercase tracking-[0.14em] text-ink-soft">
                  {h.tier}
                </span>
              </span>
              <span className="ml-auto font-data text-sm text-ink-faint">
                {new Date(h.scanned_at).toLocaleDateString(undefined, {
                  dateStyle: 'medium',
                })}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-faint">
          Every redemption arc starts with one re-test. New scores land
          here, in public.
        </p>
      </section>

      {/* Report details — quiet mono meta line (§2.12). */}
      <section className="border-t border-hairline py-6" aria-label="Report details">
        <p
          className="break-all font-data text-sm leading-relaxed text-ink-faint"
          title={`snapshot ${current.snapshot_hash}`}
        >
          {domain}
          {' · '}
          tested{' '}
          {new Date(current.scanned_at).toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
          {' · '}
          scoring {current.algo_version}
          {' · '}
          snapshot {current.snapshot_hash.slice(0, 12)}…
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link
            to={`/scan?url=${encodeURIComponent(`https://${domain}`)}`}
            className="tap-target inline-flex items-center font-data text-sm font-medium uppercase tracking-[0.18em] text-hazard hover:underline"
          >
            Test again →
          </Link>
          <Link
            to={`/verify?domain=${encodeURIComponent(domain)}`}
            className="tap-target inline-flex items-center font-data text-sm font-medium uppercase tracking-[0.18em] text-ink-soft transition-colors hover:text-hazard"
          >
            Claim this listing →
          </Link>
        </div>
      </section>

      {/* Share this score — the share card. */}
      <section className="border-t border-hairline py-8 md:py-10" aria-label="Share this score">
        <p className="eyebrow text-ink-faint">
          Share this score
        </p>
        <div className="mt-6 max-w-2xl">
          <img
            src={ogCardUrl(profile.slug)}
            alt={`${domain} sniff score ${current.sniff_score}/100 on SniffMySite`}
            width={1200}
            height={630}
            className="block w-full border border-hairline"
            loading="lazy"
          />
        </div>
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="tap-target inline-flex items-center gap-2 bg-hazard px-6 py-3.5 font-data text-sm font-bold uppercase tracking-wider text-paper transition-colors hover:bg-hazard-deep"
          >
            <Share2 className="h-5 w-5" strokeWidth={2.25} />
            Spread the word
          </button>
        </div>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-faint">
          Download the card, copy the image, post it anywhere. Make it
          famous. We joke about the page, never the people behind it.
        </p>
        {shareOpen && (
          <SharePopup
            domain={domain}
            score={current.sniff_score}
            tier={current.tier}
            shareText={shareText}
            pageUrl={profileUrl}
            getImageBlob={getCardBlob}
            onClose={() => setShareOpen(false)}
          />
        )}
      </section>

      {/* The badge — only offered to the top two tiers. */}
      <BadgeSnippet
        slug={profile.slug}
        sniffScore={current.sniff_score}
        tier={current.tier}
      />
    </div>
  );
}
