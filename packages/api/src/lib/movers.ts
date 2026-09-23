/**
 * Weekly biggest-movers roundup — GET /api/vapor/movers (Growth Plan §4).
 *
 * "Who gained, who face-planted this week": among hosts with ≥2 scans in
 * the trailing window, the biggest sniff-score gainers ("Climbing") and
 * losers ("Face-plants"), ranked by |delta|.
 *
 * The same-algo-version rule from Most Improved applies: a host's old and
 * new scores must come from scans with the same `algo_version` (anchored
 * on the latest in-window scan). A v1→v2 formula jump is a lab change, not
 * a product move — it never appears as a mover.
 *
 * Data source: the in-memory scan journal (lib/scanlog.ts), which keeps
 * each host's FULL history newest-first. Seed scans adopted as history
 * chapter 1 count like any other scan — exactly as Most Improved treats
 * them — as long as they're inside the window and same-version.
 *
 * Honesty rules: when fewer than MOVERS_THIN_THRESHOLD hosts qualify, the
 * response carries an `note` saying so in plain words ("early days — only
 * N sites have two sniffs this week"). The list is never padded.
 *
 * State lives in the journal (in-memory, lost on restart, same seam story
 * as the other stores). No new persistent state here.
 */

import { getAllLiveHosts } from './scanlog';
import { getProfile } from './profile';
import { normalizeSlug } from './slug';
import type { Tier } from './score';

/** Accepted `?window=` values. */
export type MoversWindow = '7d' | '30d';

/** Trailing-window lengths in milliseconds. */
export const MOVER_WINDOWS: Record<MoversWindow, number> = {
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

/** Max rows per side (gainers / losers). */
export const MOVERS_PER_SIDE = 10;

/**
 * Fewer qualifying hosts than this → the response carries the honest
 * "early days" note instead of pretending the board is full.
 */
export const MOVERS_THIN_THRESHOLD = 5;

export interface MoverRow {
  /** Normalized domain, doubles as the dossier slug. */
  slug: string;
  /** Host only — never a full URL. */
  domain: string;
  /** Sniff score of the oldest same-version scan in the window. */
  old_score: number;
  /** Sniff score of the latest same-version scan in the window. */
  new_score: number;
  /** new_score − old_score. Positive = the page got MORE real. */
  delta: number;
  /** Tier of the latest scan. */
  tier: Tier;
  /** True when this slug has a dossier (GET /startup/:slug works). */
  has_profile: boolean;
}

export interface MoversResult {
  window: MoversWindow;
  generated_at: string;
  gainers: MoverRow[];
  losers: MoverRow[];
  /** Hosts with ≥2 same-version scans inside the window. */
  hosts_tracked: number;
  /** Present when the window is thin — plain words, never padded rows. */
  note?: string;
}

export function isMoversWindow(raw: unknown): raw is MoversWindow {
  return raw === '7d' || raw === '30d';
}

/** Biggest movers in the trailing window. Pure over the journal + clock. */
export function getMovers(
  window: MoversWindow,
  now: number = Date.now(),
): MoversResult {
  const cutoff = now - MOVER_WINDOWS[window];
  const qualified: MoverRow[] = [];

  for (const host of getAllLiveHosts()) {
    const inWindow = host.scans.filter((s) => {
      const t = Date.parse(s.scanned_at);
      return Number.isFinite(t) && t >= cutoff;
    });
    if (inWindow.length < 2) continue;
    // Same-version anchor (Most Improved pattern): a v1→v2 formula change
    // is a lab change, never a "move".
    const latest = inWindow[0];
    const same = inWindow.filter((s) => s.algo_version === latest.algo_version);
    if (same.length < 2) continue;
    const oldest = same[same.length - 1];
    const delta = latest.sniff_score - oldest.sniff_score;
    // host.domain is already normalized (recordBoardScan); the fallback is
    // belt-and-suspenders for the nullable normalizeSlug signature.
    const slug = normalizeSlug(host.domain) ?? host.domain;
    qualified.push({
      slug,
      domain: host.domain,
      old_score: oldest.sniff_score,
      new_score: latest.sniff_score,
      delta,
      tier: latest.tier,
      has_profile: slug !== '' && getProfile(slug) !== null,
    });
  }

  // Zero-delta hosts count as tracked (they have two sniffs) but appear
  // on neither list — no move, no story.
  const tracked = qualified.filter((r) => r.delta !== 0);
  const byAbsDelta = (a: MoverRow, b: MoverRow) =>
    Math.abs(b.delta) - Math.abs(a.delta);
  const gainers = tracked
    .filter((r) => r.delta > 0)
    .sort(byAbsDelta)
    .slice(0, MOVERS_PER_SIDE);
  const losers = tracked
    .filter((r) => r.delta < 0)
    .sort(byAbsDelta)
    .slice(0, MOVERS_PER_SIDE);

  const result: MoversResult = {
    window,
    generated_at: new Date(now).toISOString(),
    gainers,
    losers,
    hosts_tracked: qualified.length,
  };
  if (qualified.length < MOVERS_THIN_THRESHOLD) {
    const n = qualified.length;
    const span = window === '7d' ? 'this week' : 'the last 30 days';
    result.note =
      `Early days — only ${n === 1 ? '1 site has' : `${n} sites have`} ` +
      `two sniffs ${span}. Sniff a page twice and it could top this board.`;
  }
  return result;
}
