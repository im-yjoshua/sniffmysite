/**
 * Recent-scans ring log — feeds the navbar's "latest sniffs" ticker
 * (GET /api/vapor/recent).
 *
 * Records the last RECENT_MAX successful scans (anonymous AND priority
 * lane), newest first. Each record carries ONLY what's safe to show the
 * public: normalized domain/slug, the sniff score, the tier, and the scan
 * time. Never emails, IPs, or full URLs — domain/host only, by
 * construction.
 *
 * State lives in an in-memory array. Deploy seam: a Supabase
 * `recent_scans` table replaces this array — same record shape, same
 * function signatures. Server restarts lose the log, exactly like the
 * billing credit ledger (lib/billing.ts) and sponsor store (lib/sponsors.ts).
 *
 * Privacy note: this is public scan data the visitor could have looked up
 * themselves (scan results are public pages scored by a public endpoint),
 * so no consent problem — but we still keep it to host-only.
 */

import type { Tier } from './score';
import { normalizeSlug, getProfile } from './profile';

/** Cap on how many scans the ring log keeps. */
export const RECENT_MAX = 15;

export interface RecentScan {
  /** Normalized domain — doubles as the dossier slug (links to /s/:slug when has_profile). */
  slug: string;
  /** Host only, no scheme/path — never a full URL. */
  domain: string;
  /** Internal vapor measurement (higher = more hype) — carried for contract symmetry, never rendered. */
  vapor_score: number;
  /** THE public number: 0 = pure vapor, 100 = certified real. */
  sniff_score: number;
  /** Tier for the sniff score. */
  tier: Tier;
  /** When the scan ran, ISO string. */
  scanned_at: string;
  /** True when this slug has a dossier (GET /startup/:slug works). */
  has_profile: boolean;
}

/** Input shape: one successful POST /api/vapor/scan result + its final URL. */
export interface RecentScanInput {
  finalUrl: string;
  vapor_score: number;
  sniff_score: number;
  tier: Tier;
  scanned_at: string;
}

let log: RecentScan[] = [];

/**
 * Per-host sniff counters for the "Most sniffed" trending board
 * (GET /api/vapor/trending). Same in-memory + Supabase-deploy-seam story as
 * the ring log above: at deploy time a `trending_scans` table (host PK,
 * sniff_count, latest_sniff_score, tier, has_profile, last_scanned_at)
 * replaces this map, updated by the same function on the same code path.
 * Only successful scans ever reach here — failures never touch the tally.
 */
export interface TrendingHost {
  /** Normalized domain, doubles as the dossier slug. Host only, always. */
  host: string;
  slug: string;
  /** How many successful scans this host has had (this process's lifetime). */
  sniff_count: number;
  /** The sniff score of the most recent successful scan. */
  latest_sniff_score: number;
  /** The tier of the most recent successful scan. */
  tier: Tier;
  /** True when this slug has a dossier (GET /startup/:slug works). */
  has_profile: boolean;
  /** When the most recent successful scan ran, ISO string (sort tiebreak). */
  last_scanned_at: string;
}

/**
 * Public shape of one trending-board row — exactly what
 * GET /api/vapor/trending returns. No emails, IPs, or full URLs, ever.
 */
export type TrendingHostPublic = Omit<TrendingHost, 'last_scanned_at'>;

const tallies = new Map<string, TrendingHost>();

/** Cap on how many hosts the trending board returns. */
export const TRENDING_MAX = 10;

/**
 * Record one successful scan. Returns the stored record, or null when the
 * final URL can't be reduced to a sane domain (never happens for real
 * scans — fetchPage rejects those first). Updates the ring log AND the
 * per-host sniff tally.
 */
export function recordRecentScan(input: RecentScanInput): RecentScan | null {
  let host: string;
  try {
    host = new URL(input.finalUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
  const slug = normalizeSlug(host);
  if (!slug) return null;
  const record: RecentScan = {
    slug,
    domain: slug,
    vapor_score: input.vapor_score,
    sniff_score: input.sniff_score,
    tier: input.tier,
    scanned_at: input.scanned_at,
    has_profile: getProfile(slug) !== null,
  };
  // Per-host dedupe: the log is "latest scan per host, newest first". A
  // re-scan bumps its host to the front with the fresh score instead of
  // appearing twice — the navbar ticker was showing every re-scanned site
  // double. The per-host sniff TALLY below still counts every scan.
  const prevIdx = log.findIndex((r) => r.slug === slug);
  if (prevIdx !== -1) log.splice(prevIdx, 1);
  log.unshift(record);
  if (log.length > RECENT_MAX) log.length = RECENT_MAX;

  // The tally: same slug, one more sniff. Never exposed: no IPs, no emails,
  // no full URLs — host only, by construction.
  const prev = tallies.get(slug);
  tallies.set(slug, {
    host: slug,
    slug,
    sniff_count: (prev?.sniff_count ?? 0) + 1,
    latest_sniff_score: record.sniff_score,
    tier: record.tier,
    has_profile: record.has_profile,
    last_scanned_at: record.scanned_at,
  });

  return record;
}

/** The log, newest first. Returns a copy — callers can't mutate the ring. */
export function getRecentScans(): RecentScan[] {
  return [...log];
}

/** Test seam — resets the in-memory log. Never used by routes. */
export function _resetRecentScans(): void {
  log = [];
}

/**
 * The trending board: top hosts by sniff count, most-sniffed first.
 * Returns at most `limit` entries (default 10); ties break toward the
 * most recently scanned host. Returns a copy — callers can't mutate the
 * tally map.
 */
export function getTrendingHosts(limit: number = TRENDING_MAX): TrendingHostPublic[] {
  return [...tallies.values()]
    .sort(
      (a, b) =>
        b.sniff_count - a.sniff_count ||
        b.last_scanned_at.localeCompare(a.last_scanned_at),
    )
    .slice(0, Math.max(0, limit))
    // Public shape only: last_scanned_at stays server-side (tiebreak input,
    // never a response field) so the response carries exactly what the
    // board documents: host, slug, count, latest score, tier, has_profile.
    .map(({ last_scanned_at: _ignored, ...publicFields }) => publicFields);
}

/** Test seam — resets the in-memory tally. Never used by routes. */
export function _resetTrendingScans(): void {
  tallies.clear();
}
