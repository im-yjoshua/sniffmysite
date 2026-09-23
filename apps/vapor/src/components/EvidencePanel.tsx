import { ExternalLink, FileSearch, Quote, RefreshCw, Share2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  METRIC_META,
  type MetricScores,
  type ScoreEvidence,
} from '../lib/api';
import { CHECK_INFO } from '../lib/score-explainer';

function plural(n: number, one: string, many?: string): string {
  return n === 1 ? one : (many ?? `${one}s`);
}

/**
 * One honest line about the raw counts behind a check — real numbers from
 * the scan evidence, never invented. Roast the page's copy, never people.
 */
function evidenceLine(key: (typeof METRIC_META)[number]['key'], e: ScoreEvidence): string {
  switch (key) {
    case 'buzzword_density':
      return `We found ${e.buzzword_hits} hype ${plural(e.buzzword_hits, 'word')} on the page.`;
    case 'claim_to_proof':
      return `${e.claim_sentences} big ${plural(e.claim_sentences, 'claim')}, ${e.evidence_links} ${plural(e.evidence_links, 'link')} backing them up.`;
    case 'vague_verb':
      return `${e.vague_sentences} ${plural(e.vague_sentences, 'sentence')} that say nothing you can check.`;
    case 'social_proof':
      return e.trust_mentions + e.anonymous_testimonials === 0
        ? 'No testimonials on the page at all — nothing sketchy, nothing proven.'
        : `${e.trust_mentions} “trusted by” name-${plural(e.trust_mentions, 'drop')}, ${e.anonymous_testimonials} ${plural(e.anonymous_testimonials, 'quote')} with no name attached.`;
    case 'pricing_opacity':
      return e.has_pricing
        ? 'Prices are right there on the page.'
        : e.sales_only_cta
          ? 'No prices anywhere — just a “contact sales” button.'
          : 'No prices found on the page.';
    case 'freshness':
      return e.copyright_year != null
        ? `The footer says © ${e.copyright_year}.`
        : 'No copyright year found — we can’t tell how fresh it is.';
  }
}

/**
 * The evidence panel — replaces the old live-page iframe on startup
 * profiles. The iframe got blocked by half the internet (X-Frame-Options,
 * CSP), so this space now shows the lab's actual receipts: which check
 * counted most, the real words we caught, and what to do next.
 */
export function EvidencePanel({
  domain,
  metrics,
  evidence,
  onShare,
}: {
  domain: string;
  metrics: MetricScores;
  evidence?: ScoreEvidence | null;
  onShare: () => void;
}) {
  // The check that moved the needle most: value × weight, ties keep the
  // first check (deterministic).
  const top = METRIC_META.map((m) => ({
    ...m,
    value: metrics[m.key],
  })).reduce((a, b) => (b.value * b.weight > a.value * a.weight ? b : a));
  const topInfo = CHECK_INFO[top.key];

  const siteUrl = `https://${domain}`;
  const scanUrl = `/scan?url=${encodeURIComponent(siteUrl)}`;
  const phrases = evidence?.top_phrases ?? [];

  return (
    <aside
      aria-label="The evidence"
      className="overflow-hidden border border-ink bg-paper"
    >
      <div className="flex items-center gap-3 border-b border-hairline px-5 py-4">
        <FileSearch className="h-5 w-5 text-hazard" strokeWidth={2.25} />
        <p className="font-data text-sm font-bold uppercase tracking-[0.18em]">
          The evidence
        </p>
      </div>

      {/* The biggest clue — the check that moved the score, in plain words. */}
      <section className="border-b border-hairline px-5 py-6" aria-label="The biggest clue">
        <p className="eyebrow text-ink-faint">
          The biggest clue
        </p>
        <p className="mt-3 font-display text-xl font-bold leading-snug tracking-tight md:text-2xl">
          {topInfo.name} moved the needle most.
        </p>
        <p className="mt-3 text-lg leading-relaxed text-ink-soft">
          This check {topInfo.weightNote.charAt(0).toLowerCase() + topInfo.weightNote.slice(1)},
          and it scored {top.value} out of 100.
        </p>
        {evidence ? (
          <p className="mt-3 font-data text-base leading-relaxed text-ink">
            {evidenceLine(top.key, evidence)}
          </p>
        ) : (
          <p className="mt-3 text-lg leading-relaxed text-ink-faint">
            The lab notes for this sniff didn’t survive. Sniff the site again
            for the full breakdown.
          </p>
        )}
      </section>

      {/* The words we caught — real phrases from the page, with counts. */}
      {phrases.length > 0 && (
        <section className="border-b border-hairline px-5 py-6" aria-label="Caught red-handed">
          <p className="eyebrow flex items-center gap-2 text-ink-faint">
            <Quote className="h-4 w-4" strokeWidth={2.25} />
            Caught red-handed
          </p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {phrases.map((p) => (
              <li
                key={p.phrase}
                className="min-w-0 max-w-full break-words border border-hairline bg-paper px-3 py-2 font-data text-base"
              >
                <span className="text-ink">“{p.phrase}”</span>
                <span className="ml-2 font-bold tabular-nums text-hazard">
                  ×{p.count}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-base leading-relaxed text-ink-faint">
            Straight from the page — this is what we counted.
          </p>
        </section>
      )}

      {/* Your move. */}
      <section className="px-5 py-6" aria-label="Your move">
        <p className="eyebrow text-ink-faint">
          Your move
        </p>
        <div className="mt-4 flex flex-col gap-3">
          <Link
            to={scanUrl}
            className="tap-target inline-flex items-center justify-center gap-2 bg-hazard px-6 py-3.5 font-data text-sm font-bold uppercase tracking-wider text-paper transition-colors hover:bg-hazard-deep"
          >
            <RefreshCw className="h-5 w-5" strokeWidth={2.25} />
            Sniff it again
          </Link>
          <button
            type="button"
            onClick={onShare}
            className="tap-target inline-flex items-center justify-center gap-2 border border-ink bg-paper px-6 py-3.5 font-data text-sm font-bold uppercase tracking-wider text-ink transition-colors hover:bg-ink hover:text-paper"
          >
            <Share2 className="h-5 w-5" strokeWidth={2.25} />
            Spread the word
          </button>
          <a
            href={siteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="tap-target inline-flex items-center justify-center gap-2 px-6 py-3 font-data text-sm font-medium uppercase tracking-[0.18em] text-ink-soft transition-colors hover:text-hazard"
          >
            Open the live site
            <ExternalLink className="h-4 w-4" strokeWidth={2.25} />
          </a>
        </div>
        {evidence && (
          <p className="mt-5 font-data text-sm leading-relaxed text-ink-faint">
            Lab notes — we read {evidence.words.toLocaleString()} words
            across {evidence.sentences.toLocaleString()} sentences.
          </p>
        )}
      </section>
    </aside>
  );
}
