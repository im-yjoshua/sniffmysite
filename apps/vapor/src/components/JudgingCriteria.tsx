import { RosetteBadge } from './RosetteBadge';
import { tierFor } from '../lib/tiers';
import { CHECK_INFO, SCORE_STORY, type MetricKey } from '../lib/score-explainer';

/**
 * "How we judge" — the v1 judging rubric, in plain words. Every score below
 * is lifted verbatim from the scoring engine (packages/api/src/lib/score.ts):
 * six checks, real §2.4 weights. The weights are spoken in words
 * ("counts the most"), not percentages-as-math — the numbers themselves
 * are untouched.
 */
const CHECKS: Array<{
  key: MetricKey;
  what: string;
}> = [
  {
    key: 'buzzword_density',
    what: 'How many hype words ("reimagine", "unleash", "agentic") show up for every 100 words on the page.',
  },
  {
    key: 'claim_to_proof',
    what: 'Big claims ("world\u2019s first", "10x", "guaranteed") minus real proof — links to docs, prices, a demo, or code. Proof lowers the score but doesn\u2019t erase it.',
  },
  {
    key: 'vague_verb',
    what: 'How many long sentences say nothing you can check — no numbers, no prices, no real names. Just vibes.',
  },
  {
    key: 'social_proof',
    what: '"Trusted by\u2026" with no names, quotes credited to a job title instead of a person, and logo walls where the logos don\u2019t link anywhere.',
  },
  {
    key: 'pricing_opacity',
    what: 'No mark if there\u2019s a real prices page. "Contact sales" instead? Most of the mark. No prices and no sign of a real product? All of it.',
  },
  {
    key: 'freshness',
    what: 'How old the copyright year is. A current footer scores clean; an ancient one scores high. No year found gets a mild mark — unknown, not guilty.',
  },
];

/**
 * The Sniff Score levels, highest first. Ranges are keyed off the public
 * sniff score: 100 = certified real, 0 = pure vapor.
 */
const TIERS = [
  { max: 100, verdict: 'Fine. We checked twice.' },
  { max: 80, verdict: 'So close. Yet so far.' },
  { max: 60, verdict: 'Eyebrows raised.' },
  { max: 40, verdict: 'Just vibes.' },
  { max: 20, verdict: 'All hype, no substance.' },
] as const;

export function JudgingCriteria() {
  return (
    <section
      id="how-it-works"
      aria-label="How we judge"
      className="scroll-mt-40 border-t-2 border-ink py-12 md:py-16"
    >
      <p className="eyebrow text-ink-soft">
        The judging rubric
      </p>
      <h2 className="mt-4 font-display text-4xl font-bold tracking-tight md:text-5xl">
        How we judge
      </h2>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-soft">
        {SCORE_STORY} No appeals, no bribes — the only way to change a
        score is to sniff the page again.
      </p>

      <div className="mt-10 grid gap-px border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-3">
        {CHECKS.map((c, i) => (
          <div key={c.key} className="bg-paper p-6">
            <p className="eyebrow text-ink-faint">
              Check {i + 1} of 6
            </p>
            <h3 className="mt-2 font-display text-xl font-bold tracking-tight">
              {CHECK_INFO[c.key].name}
            </h3>
            <p className="mt-1 text-base font-bold text-ink">
              {CHECK_INFO[c.key].weightNote}
            </p>
            <p className="mt-3 text-base leading-relaxed text-ink-soft">{c.what}</p>
          </div>
        ))}
      </div>

      <div className="mt-12">
        <p className="eyebrow text-ink-faint">
          The medals
        </p>
        <ul className="mt-6 space-y-4">
          {TIERS.map((t, i) => {
            // TIERS is ordered highest first: the range starts one above
            // the next band's max (or at 0 for the last band).
            const lo = i === TIERS.length - 1 ? 0 : TIERS[i + 1].max + 1;
            const tier = tierFor(t.max);
            return (
              <li
                key={t.max}
                className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-hairline pb-4"
              >
                <span className="w-20 shrink-0 font-data text-base font-bold tabular-nums text-ink-soft">
                  {lo}–{t.max}
                </span>
                <span className="flex w-full shrink-0 items-center gap-2.5 sm:w-64">
                  <RosetteBadge tier={tier} size={48} />
                  <span className="font-data text-sm uppercase tracking-[0.14em] text-ink-soft">
                    {tier}
                  </span>
                </span>
                <span className="text-base text-ink-soft">{t.verdict}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
