/**
 * Sniff Score tiers. The engine measures VAPOR internally (higher = more
 * hype); the public number is the FLIP — sniff = 100 − vapor — and these
 * tiers are keyed off the sniff score: higher = more real.
 *
 * 81–100 CERTIFIED REAL · 61–80 ALMOST REAL · 41–60 SUS
 * 21–40 JUST VIBES · 0–20 CERTIFIED FAKE
 *
 * The one conversion lives server-side (packages/api/src/lib/score.ts →
 * sniffScoreFor). The frontend never converts vapor itself — it reads
 * sniff_score from the API and tiers it here for display fallbacks.
 */

export type TierLabel =
  | 'CERTIFIED REAL'
  | 'ALMOST REAL'
  | 'SUS'
  | 'JUST VIBES'
  | 'CERTIFIED FAKE';

/** Tier for a SNIFF score (0–100, higher = more real). */
export function tierFor(sniff: number): TierLabel {
  if (sniff >= 81) return 'CERTIFIED REAL';
  if (sniff >= 61) return 'ALMOST REAL';
  if (sniff >= 41) return 'SUS';
  if (sniff >= 21) return 'JUST VIBES';
  return 'CERTIFIED FAKE';
}

/**
 * Verdict lines in the inspection-lab voice — reverse psychology: grudging
 * about good scores, delighted by bad ones. Roast the page, never people.
 * (Fallback only; the API's own verdict is what real scans show.)
 */
export function verdictFor(score: number): string {
  if (score >= 81)
    return `${score}/100. Fine. Prices are public, the claims stay in their lane. We checked twice.`;
  if (score >= 61)
    return `${score}/100. So close. Yet so far.`;
  if (score >= 41)
    return `${score}/100 — solidly sus. Proceed with eyebrows raised.`;
  if (score >= 21)
    return `${score}/100. This page is just vibes.`;
  return `A new record! ${score}/100 — the Wall of Shame awaits.`;
}
