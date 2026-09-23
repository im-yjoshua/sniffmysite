import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ALGO_VERSION,
  scorePage,
  sniffScoreFor,
  type MetricScores,
  type ScanResult,
  type Tier,
} from './score';

/**
 * Leaderboard seed data (Task 6).
 *
 * Loads the 20 Task-4 fixture pages (real public landing pages, captured
 * 2026-09-20), scores each once with the v1 engine at boot, and serves the
 * results as the Hall of Vapor board. This is REAL engine data, not mock.
 *
 * DEPLOY-TIME SEAM: this module is the single place the leaderboard reads
 * from. When Supabase persistence lands, replace `loadSeed()`'s fixture read
 * with a Supabase query returning the same LeaderboardEntry shape — the
 * router and frontend stay untouched. No DB writes happen in this
 * environment (no service_role key here).
 */

export interface LeaderboardEntry {
  domain: string;
  /** Internal vapor measurement (higher = more hype). Kept for transparency;
   * display layers must show sniff_score instead. */
  vapor_score: number;
  /** THE public number: 100 − vapor_score. Higher = more real. */
  sniff_score: number;
  /** Tier for the SNIFF score (see tierFor in lib/score.ts). */
  tier: Tier;
  metrics: MetricScores;
  scanned_at: string;
  algo_version: typeof ALGO_VERSION;
  /**
   * SNIFF-score delta vs the previous scan of this domain:
   * delta = new_sniff − old_sniff. POSITIVE means the page got MORE real —
   * that is what "Most Improved" ranks by, descending. (Flipped with the
   * public score: a vapor drop is a sniff gain.)
   * Always null for seed entries — they are single snapshots, not a
   * history. Re-scans will populate this, which is what powers
   * "Most Improved" and the comeback story (§2.4).
   */
  delta: number | null;
}

export type LeaderboardSort = 'vapor' | 'real' | 'improved';

interface Fixture {
  domain: string;
  url: string;
  html: string;
}

// Fixtures ship next to the compiled tests via the `copy:fixtures` build
// step, so `../test/fixtures` resolves identically under
// `tsx watch src/index.ts` (src/lib/seed.ts) and `node dist/index.js`
// (dist/lib/seed.js). CommonJS build, so plain __dirname — no import.meta.
function fixtureDir(): string | null {
  const dir = join(__dirname, '..', 'test', 'fixtures');
  return existsSync(dir) ? dir : null;
}

function loadScoredPages(): Array<{ domain: string; result: ScanResult }> {
  const dir = fixtureDir();
  if (!dir) {
    // Fixtures didn't ship with this build — the board is empty rather than
    // wrong. Deploy must run `copy:fixtures` (or wire up Supabase).
    console.warn('[leaderboard] fixture dir missing — seed board is empty');
    return [];
  }
  const boot = new Date();
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort();
  return files.map((f) => {
    const fixture = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Fixture;
    return { domain: fixture.domain, result: scorePage(fixture.html, fixture.url, boot) };
  });
}

// Scored once at boot: deterministic per deploy, zero per-request cost.
const SCORED: Array<{ domain: string; result: ScanResult }> = loadScoredPages();

const SEED: LeaderboardEntry[] = SCORED.map(({ domain, result: r }) => ({
  domain,
  vapor_score: r.vapor_score,
  sniff_score: r.sniff_score,
  tier: r.tier,
  metrics: r.metrics,
  scanned_at: r.scanned_at,
  algo_version: r.algo_version,
  delta: null,
}));

/**
 * Full v1 scan results (verdict, snapshot_hash, evidence…) — backs the
 * Task-7 profile + OG card endpoints. Same boot-scored data as the board,
 * just without the leaderboard's field trimming.
 */
export function getSeedResults(): Array<{ domain: string; result: ScanResult }> {
  return [...SCORED];
}

/** Full seed board, unsorted. Supabase replaces this function at deploy time.
 * NOTE: the leaderboard endpoint does NOT read this directly anymore —
 * lib/scanlog.ts merges these seed rows with the live scan journal
 * (getBoard). Seed rows for hosts never re-scanned pass through untouched;
 * a live re-scan overrides its seed row and adopts the seed scan as
 * history chapter 1. */
export function getSeedEntries(): LeaderboardEntry[] {
  return [...SEED];
}

/**
 * Sorted SEED board (seed rows only — no live scans). Kept for the
 * seed-specific tests; the live endpoint reads lib/scanlog.ts `getBoard`,
 * which merges these rows with the scan journal.
 *
 * Sort keys keep their plain-English meaning after the score flip:
 *   'vapor'    = most vapor first   (sniff ascending — the Wall of Shame)
 *   'real'     = most real first    (sniff descending — the prize) [DEFAULT]
 *   'improved' = biggest sniff-score gain first (delta descending;
 *                positive = more real). Null deltas sort last, so the
 *                all-null seed board stays alphabetical. Tiebreaks on
 *                domain so every sort is fully deterministic.
 */
export function sortVaporFirst(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries].sort(
    (a, b) => a.sniff_score - b.sniff_score || a.domain.localeCompare(b.domain),
  );
}

export function sortRealFirst(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries].sort(
    (a, b) => b.sniff_score - a.sniff_score || a.domain.localeCompare(b.domain),
  );
}

export function sortImproved(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries].sort((a, b) => {
    const ad = a.delta ?? Number.NEGATIVE_INFINITY;
    const bd = b.delta ?? Number.NEGATIVE_INFINITY;
    return bd - ad || a.domain.localeCompare(b.domain);
  });
}

export function getLeaderboard(sort: LeaderboardSort): LeaderboardEntry[] {
  const entries = getSeedEntries();
  switch (sort) {
    case 'vapor':
      return sortVaporFirst(entries);
    case 'real':
      return sortRealFirst(entries);
    case 'improved':
      return sortImproved(entries);
  }
}
