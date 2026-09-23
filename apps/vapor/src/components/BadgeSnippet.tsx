import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { badgeUrl } from '../lib/api';
import type { TierLabel } from '../lib/tiers';

/**
 * The embeddable "Sniffed" badge snippet (Growth Plan §1): a live preview
 * of the badge, the paste-ready HTML, and a copy button. A badge nobody
 * wants to display is dead inventory, so this renders ONLY for the top
 * two tiers — everyone else simply doesn't get offered one.
 *
 * The snippet links the badge back to the dossier (`/s/:slug`): every
 * pasted badge is a billboard and a backlink. The <img> src is the
 * absolute API URL, so it works on any site it's pasted into.
 */

const BADGE_TIERS: ReadonlySet<TierLabel> = new Set([
  'CERTIFIED REAL',
  'ALMOST REAL',
]);

const SITE_URL = 'https://sniffmysite.lol';

export function BadgeSnippet({
  slug,
  sniffScore,
  tier,
}: {
  slug: string;
  sniffScore: number;
  tier: TierLabel;
}) {
  const [copied, setCopied] = useState(false);
  const [copyNote, setCopyNote] = useState('');

  if (!BADGE_TIERS.has(tier)) return null;

  const snippet =
    `<a href="${SITE_URL}/s/${slug}">` +
    `<img src="${badgeUrl(slug)}" alt="SniffMySite score: ${sniffScore}/100 — ${tier}">` +
    `</a>`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setCopyNote('');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyNote('Copy didn’t work — select the code and copy it by hand.');
    }
  };

  return (
    <section
      className="border-t border-hairline py-8 md:py-10"
      aria-label="Put the badge on your site"
    >
      <p className="eyebrow text-ink-faint">Put it on your site</p>
      <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-soft">
        {sniffScore}/100 — that&rsquo;s badge-worthy. Paste this on your
        homepage and it shows your live score, updated every hour.
      </p>
      <div className="mt-6">
        <img
          src={badgeUrl(slug)}
          alt={`SniffMySite badge preview: ${sniffScore}/100 — ${tier}`}
          width={320}
          height={112}
          loading="lazy"
          className="block w-40 border border-hairline bg-paper"
        />
      </div>
      <pre className="mt-4 max-w-2xl overflow-x-auto border border-hairline bg-paper px-4 py-3 font-data text-sm leading-relaxed text-ink-soft">
        <code className="break-all whitespace-pre-wrap">{snippet}</code>
      </pre>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={copy}
          className="tap-target inline-flex min-h-[44px] items-center gap-2 bg-ink px-6 py-3 font-data text-sm font-bold uppercase tracking-wider text-paper transition-colors hover:bg-hazard"
        >
          {copied ? (
            <Check className="h-5 w-5" strokeWidth={2.25} />
          ) : (
            <Copy className="h-5 w-5" strokeWidth={2.25} />
          )}
          {copied ? 'Copied' : 'Copy the code'}
        </button>
        {copyNote && (
          <p className="font-data text-sm text-hazard" role="alert">
            {copyNote}
          </p>
        )}
      </div>
    </section>
  );
}
