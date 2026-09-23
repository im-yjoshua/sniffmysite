import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Copy, Rocket } from 'lucide-react';

/**
 * The roast-my-launch kit (§growth-5): launch days are sniff events.
 * "Launching? Get publicly sniffed." — three steps in plain language,
 * a URL box that seeds the hero scan box on `/`, copy-paste launch-post
 * templates for Product Hunt / Hacker News / X, and an honest FAQ.
 *
 * No API surface: the CTA just navigates to `/#sniff` carrying the URL
 * in location state, which LandingPage feeds into the existing ScanBox
 * seeding mechanism (the same one the navbar CTA and the leaderboard's
 * "sniff again" use).
 */

const STEPS = [
  {
    n: '1',
    title: 'Paste your launch URL below',
    body: 'The page you are launching with — your homepage or landing page. If it smells, better to find out here than on launch day.',
  },
  {
    n: '2',
    title: 'We sniff it live, in front of everyone',
    body: 'The full six-check test, same as always. Your score goes public the second it lands. No do-overs in secret.',
  },
  {
    n: '3',
    title: 'Post your score — dare the internet to beat it',
    body: 'Grab a template below, fill in the blanks, and tag a rival if you are brave. A public score is a launch post that writes itself.',
  },
] as const;

interface Template {
  key: string;
  channel: string;
  hint: string;
  text: string;
}

/**
 * Copy-paste launch posts. Blanks the founder fills: {PRODUCT},
 * {ONE-LINER}, {SCORE}, {LINK}. Confident, self-roasting, lab voice —
 * roast the page, never the people.
 */
const TEMPLATES: Template[] = [
  {
    key: 'ph',
    channel: 'Product Hunt',
    hint: 'Paste as the first comment on your launch.',
    text: [
      'We let the nose judge {PRODUCT} before launch day. It scored {SCORE}/100 on SniffMySite.',
      '',
      '{ONE-LINER}',
      '',
      'Get your own page sniffed: {LINK}',
    ].join('\n'),
  },
  {
    key: 'hn',
    channel: 'Hacker News',
    hint: 'Use as the body of your Show HN post.',
    text: [
      'Show HN: {PRODUCT} — {ONE-LINER}',
      '',
      'We ran our landing page through SniffMySite before launch. It scored {SCORE}/100 (100 is certified real, 0 is pure vapor).',
      '',
      'Sniff yours: {LINK}',
    ].join('\n'),
  },
  {
    key: 'x',
    channel: 'X',
    hint: 'Post it as-is. Short enough to quote-tweet your rivals.',
    text: [
      'We got sniffed before launch — {SCORE}/100 on SniffMySite.',
      '',
      '{ONE-LINER}',
      '',
      'Roast us: {LINK}',
    ].join('\n'),
  },
];

const FAQS = [
  {
    q: 'Will a bad score hurt my launch?',
    a: 'Honest answer: a low score is content. Face-plants get shared more than clean scores — a 20/100 with a funny verdict travels further than a quiet 90. Fix the smelliest bits, re-sniff, and post the comeback. That is two launch posts for the price of one.',
  },
  {
    q: 'Does paying change my score?',
    a: 'Never. Money buys re-scans and audits, not points — a paid re-sniff runs the exact same test as a free one. If cash could move a score, the whole board would be meaningless.',
    link: { to: '/pricing', label: 'See what money actually buys' },
  },
  {
    q: 'Can I hide my score?',
    a: 'No. Every sniff is public — that is the game. You chose the public sniffing; the public gets the score.',
  },
] as const;

/** The API needs a scheme; default bare domains to https (ScanBox rule). */
function withScheme(raw: string): string {
  const cleaned = raw.trim();
  return /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
}

function TemplateCard({
  template,
  copied,
  onCopy,
}: {
  template: Template;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <section
      aria-label={`${template.channel} template`}
      className="border-t border-hairline py-8"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="font-display text-2xl font-bold tracking-tight">
          {template.channel}
        </h3>
        <button
          type="button"
          onClick={onCopy}
          className="tap-target inline-flex items-center gap-2 border border-ink bg-paper px-5 py-3 font-data text-sm font-bold uppercase tracking-wider text-ink transition-colors hover:bg-ink hover:text-paper"
        >
          {copied ? (
            <Check className="h-5 w-5" strokeWidth={2.25} />
          ) : (
            <Copy className="h-5 w-5" strokeWidth={2.25} />
          )}
          {copied ? 'Copied' : 'Copy template'}
        </button>
      </div>
      <p className="mt-2 text-[13px] uppercase tracking-[0.14em] text-ink-faint">
        {template.hint}
      </p>
      <pre className="mt-4 overflow-x-auto whitespace-pre-wrap border border-hairline bg-paper p-5 font-data text-base leading-relaxed text-ink-soft">
        {template.text}
      </pre>
    </section>
  );
}

export function LaunchPage() {
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [formError, setFormError] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = url.trim();
    if (!raw.includes('.')) {
      setFormError(
        'That does not look like a web address — something like yoursite.com.',
      );
      return;
    }
    setFormError('');
    // Seed the hero scan box: LandingPage reads location.state.seedUrl
    // into the same scanSeed mechanism the navbar CTA uses, and the
    // ScrollManager scrolls to #sniff on arrival.
    navigate('/#sniff', { state: { seedUrl: withScheme(raw) } });
  };

  const copyTemplate = async (t: Template) => {
    try {
      await navigator.clipboard.writeText(t.text);
      setCopiedKey(t.key);
      window.setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // Clipboard blocked — the button stays, the user can retry.
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-6 pb-16 pt-10 md:pt-14">
      <div className="border-b-2 border-ink pb-4">
        <p className="eyebrow text-ink-soft">The roast-my-launch kit</p>
        <h1 className="mt-3 font-display text-5xl font-bold tracking-tight md:text-6xl">
          Launching? Get publicly sniffed
          <span className="text-hazard">.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-soft">
          Launch day is the one day everyone is already looking at your
          page. Hand the nose the microphone first — a public sniff is a
          launch post that writes itself.
        </p>
      </div>

      {/* The ritual: three steps, plain words. */}
      <section aria-label="How it works" className="mt-10">
        <ol className="grid gap-8 md:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="border-t-2 border-ink pt-5">
              <p
                className="font-display text-4xl font-bold text-hazard"
                aria-hidden="true"
              >
                {s.n}
              </p>
              <h2 className="mt-3 font-display text-xl font-bold tracking-tight">
                {s.title}
              </h2>
              <p className="mt-2 text-lg leading-relaxed text-ink-soft">
                {s.body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* The CTA: paste a URL, land in the hero scan box with it filled. */}
      <section
        aria-label="Sniff your launch page"
        className="mt-12 border-y-2 border-ink py-10"
      >
        <h2 className="flex items-center gap-3 font-display text-3xl font-bold tracking-tight md:text-4xl">
          <Rocket className="h-8 w-8 text-hazard" strokeWidth={2.25} />
          Step one starts here
        </h2>
        <p className="mt-3 max-w-2xl text-lg leading-relaxed text-ink-soft">
          Paste your launch URL. We will drop it into the sniff box on the
          front page — you press the button, the nose does the rest.
        </p>
        <form onSubmit={onSubmit} className="mt-6 max-w-xl">
          <label
            htmlFor="launch-url"
            className="font-data text-sm font-bold uppercase tracking-[0.18em] text-ink-soft"
          >
            Your launch page
          </label>
          <input
            id="launch-url"
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="yoursite.com"
            aria-label="Your launch page's web address"
            className="tap-target mt-2 w-full border border-ink bg-paper px-4 py-3.5 font-data text-base text-ink placeholder:text-ink-faint"
          />
          {formError && (
            <p className="mt-3 font-data text-sm text-hazard" role="alert">
              {formError}
            </p>
          )}
          <button
            type="submit"
            className="tap-target mt-5 inline-flex items-center gap-2 bg-hazard px-6 py-3.5 font-data text-sm font-bold uppercase tracking-wider text-paper transition-colors hover:bg-hazard-deep"
          >
            <Rocket className="h-5 w-5" strokeWidth={2.25} />
            Sniff my launch
          </button>
        </form>
      </section>

      {/* Copy-paste launch posts, one per channel. */}
      <section aria-label="Launch post templates" className="mt-12">
        <p className="eyebrow text-ink-faint">Step three, done for you</p>
        <h2 className="mt-3 font-display text-3xl font-bold tracking-tight md:text-4xl">
          Post your score<span className="text-hazard">.</span>
        </h2>
        <p className="mt-3 max-w-2xl text-lg leading-relaxed text-ink-soft">
          Fill in the blanks after your sniff lands — your product name,
          your one-liner, your score — then post. Tag a rival if you are
          brave.
        </p>
        <div className="mt-4">
          {TEMPLATES.map((t) => (
            <TemplateCard
              key={t.key}
              template={t}
              copied={copiedKey === t.key}
              onCopy={() => void copyTemplate(t)}
            />
          ))}
        </div>
      </section>

      {/* Honest answers, before anyone has to ask. */}
      <section aria-label="Questions" className="mt-12 border-t-2 border-ink pt-10">
        <p className="eyebrow text-ink-faint">Fair questions</p>
        <h2 className="mt-3 font-display text-3xl font-bold tracking-tight md:text-4xl">
          Asked before you ask<span className="text-hazard">.</span>
        </h2>
        <div className="mt-6 max-w-3xl space-y-8">
          {FAQS.map((f) => (
            <div key={f.q}>
              <h3 className="font-display text-xl font-bold tracking-tight">
                {f.q}
              </h3>
              <p className="mt-2 text-lg leading-relaxed text-ink-soft">
                {f.a}{' '}
                {'link' in f && f.link && (
                  <Link
                    to={f.link.to}
                    className="font-medium text-hazard underline decoration-hazard/40 underline-offset-4 hover:decoration-hazard"
                  >
                    {f.link.label}
                  </Link>
                )}
              </p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
