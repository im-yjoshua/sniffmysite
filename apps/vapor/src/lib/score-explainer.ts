import type { MetricScores } from './api';

export type MetricKey = keyof MetricScores;

/**
 * The one mental model for the Sniff Score — the same short story everywhere
 * (landing page, scan page, profile page, leaderboard). 0 is pure vapor,
 * 100 is certified real. Weights are real (§2.4: 25/25/15/15/10/10) but we
 * say them in words ("counts the most"), not percentages-as-math.
 */
export const SCORE_STORY =
  "0 is pure vapor, 100 is certified real. We read the startup's public page and run six smell checks.";

/** Plain-language names + weight notes for the six checks. */
export const CHECK_INFO: Record<MetricKey, { name: string; weightNote: string }> = {
  buzzword_density: { name: 'Hype words', weightNote: 'Counts the most' },
  claim_to_proof: { name: 'Big claims vs. proof', weightNote: 'Counts the most' },
  vague_verb: { name: 'Empty sentences', weightNote: 'Counts a fair bit' },
  social_proof: { name: 'Sketchy testimonials', weightNote: 'Counts a fair bit' },
  pricing_opacity: { name: 'Hidden prices', weightNote: 'Counts a little' },
  freshness: { name: 'Stale page', weightNote: 'Counts a little' },
};

/**
 * One plain sentence per check, driven by the actual metric value
 * (presentation only — the numbers never change). Thresholds mirror the
 * engine's real score shapes (packages/api/src/lib/score.ts): buzzword /
 * claim / vague / social are 0–100 continuous; pricing lands on
 * 0 / 40 / 75 / 100; freshness on 0 / 25 / 30 (no year = unknown) / 50 / 80.
 */
const FINDINGS: Record<MetricKey, (value: number) => string> = {
  buzzword_density: (v) =>
    v >= 67
      ? 'Packed with hype words \u2014 \u201crevolutionary\u201d, \u201cunleash\u201d, \u201cgame-changing\u201d all over the place.'
      : v >= 34
        ? 'More hype words than one page should have.'
        : 'Almost no hype words. Breathe easy.',
  claim_to_proof: (v) =>
    v >= 67
      ? 'Huge promises, thin proof \u2014 no demo, docs, or prices backing them up.'
      : v >= 34
        ? 'Some big claims, not enough proof to go with them.'
        : 'Claims mostly come with proof \u2014 docs, a demo, or real prices.',
  vague_verb: (v) =>
    v >= 67
      ? 'Long sentences that say nothing you can check \u2014 no numbers, no names, no prices.'
      : v >= 34
        ? 'Some sentences sound big but prove nothing.'
        : 'The writing is concrete \u2014 real details you can check.',
  social_proof: (v) =>
    v >= 67
      ? '\u201cTrusted by\u2026\u201d with no names, quotes from job titles instead of people, logos that link nowhere.'
      : v >= 34
        ? 'The testimonials look a little sketchy.'
        : 'Testimonials look legit \u2014 real people and real links.',
  pricing_opacity: (v) =>
    v >= 90
      ? 'No prices anywhere, and no sign of a real product either.'
      : v >= 60
        ? '\u201cContact sales\u201d instead of prices \u2014 classic.'
        : v >= 25
          ? 'No prices page, but there are docs or code \u2014 so it gets a lighter mark.'
          : 'Prices are right there on the page. Honest.',
  freshness: (v) =>
    v >= 80
      ? 'The copyright year is ancient \u2014 nobody has touched this page in a while.'
      : v >= 50
        ? 'The copyright year is a couple of years old \u2014 a little dusty.'
        : v === 30
          ? 'No copyright year found \u2014 unknown, not guilty. We went easy on it.'
          : v >= 20
            ? 'The copyright year is last year \u2014 almost fresh.'
            : 'Fresh page \u2014 the footer is current.',
};

/** The mini verdict for one check: one human sentence, straight from the number. */
export function findingFor(key: MetricKey, value: number): string {
  return FINDINGS[key](value);
}
