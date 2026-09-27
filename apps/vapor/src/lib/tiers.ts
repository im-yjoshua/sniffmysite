/**
 * Sniff Score tiers — the arena's verdict names, keyed off the SNIFF score
 * (higher = more real):
 *
 * 90–100 LAUREATE · 75–89 GLADIATOR · 50–74 RECRUIT · 25–49 JESTER ·
 * 0–24 LION FOOD
 *
 * The one conversion lives server-side (packages/api/src/lib/score.ts →
 * tierFor). The frontend never converts vapor itself — it reads
 * sniff_score from the API and tiers it here for display fallbacks.
 */

export type TierLabel =
  | 'LAUREATE'
  | 'GLADIATOR'
  | 'RECRUIT'
  | 'JESTER'
  | 'LION FOOD';

/** Tier for a SNIFF score (0–100, higher = more real). */
export function tierFor(sniff: number): TierLabel {
  if (sniff >= 90) return 'LAUREATE';
  if (sniff >= 75) return 'GLADIATOR';
  if (sniff >= 50) return 'RECRUIT';
  if (sniff >= 25) return 'JESTER';
  return 'LION FOOD';
}

/** The tagline each tier carries — the crowd's verdict, one line. */
export const TIER_TAGLINES: Record<TierLabel, string> = {
  LAUREATE: 'The crowd roars.',
  GLADIATOR: 'A proven fighter.',
  RECRUIT: 'Shows promise. Shows fear.',
  JESTER: 'The crowd laughs. Not with you.',
  'LION FOOD': 'Thrown to the lions.',
};

/**
 * Verdict lines in the arena voice — deadpan imperial formality.
 * (Fallback only; the API's own verdict is what real scans show.)
 */
export function verdictFor(score: number): string {
  if (score >= 90) return `${score}/100. The crowd roars. We checked twice.`;
  if (score >= 75) return `${score}/100. A proven fighter.`;
  if (score >= 50) return `${score}/100. Shows promise. Shows fear.`;
  if (score >= 25) return `${score}/100. The crowd laughs. Not with you.`;
  return `${score}/100. Thrown to the lions.`;
}
