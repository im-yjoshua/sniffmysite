/**
 * Live scan journal — the leaderboard's real data source.
 *
 * Every successful POST /api/vapor/scan lands here, keyed by normalized
 * host (lib/slug.ts: `www.x.com`, `X.COM`, and `x.com` are one host — they
 * never double-list). Each host keeps its FULL scan history (newest first),
 * so re-scans update the board row AND append a history chapter: the delta
 * that powers "Most Improved" (latest sniff − first sniff; positive = the
 * page got MORE real) comes straight from this array.
 *
 * The 20 Task-4 fixture entries stay the seeds: a host's first LIVE sighting
 * adopts its seed scan as history chapter 1 (the seed score is never
 * edited — it just becomes the "before" in the redemption arc), and from
 * then on the live scan OVERRIDES the fixture row on the board. Seed rows
 * for hosts never re-scanned pass through untouched.
 *
 * Host-only by construction: the journal keeps full ScanResults in memory
 * (verdict, evidence, snapshot hash — so profiles and share cards stay
 * honest for re-scans), but the leaderboard route only ever emits the
 * LeaderboardEntry field set — no IPs, emails, or full URLs.
 *
 * State lives in an in-memory Map. Deploy seam: a Supabase `board_scans`
 * table (host PK, full result JSONB per scan, latest materialized) replaces
 * this map — same shapes, same function signatures. Server restarts lose
 * the journal and the board falls back to the 20 seeds, exactly like the
 * billing credit ledger (lib/billing.ts), the sponsor store
 * (lib/sponsors.ts), and the recent-scans ring (lib/recent.ts).
 */

import { normalizeSlug } from './slug';
import {
  getSeedEntries,
  getSeedResults,
  sortImproved,
  sortRealFirst,
  sortVaporFirst,
  type LeaderboardEntry,
  type LeaderboardSort,
} from './seed';
import type { ScanResult } from './score';

/** One host's full scan history, newest first. `scans[0]` is the board row. */
export interface LiveHost {
  domain: string;
  scans: ScanResult[];
}

/** Input shape: one successful POST /api/vapor/scan result + its final URL. */
export interface RecordBoardScanInput {
  finalUrl: string;
  result: ScanResult;
}

const live = new Map<string, LiveHost>();

/** Test seam — resets the in-memory journal. Never used by routes. */
export function _resetScanLog(): void {
  live.clear();
}

/** The board row for one live host: latest score, delta vs its FIRST scan. */
function boardEntryFor(host: LiveHost): LeaderboardEntry {
  const latest = host.scans[0];
  // "Most Improved" compares earliest↔latest scans within the SAME algo
  // version — a v1→v2 formula jump is not "improvement". Anchor on the
  // latest scan and take the oldest scan that shares its algo_version.
  const sameVersion = host.scans.filter((s) => s.algo_version === latest.algo_version);
  const first = sameVersion[sameVersion.length - 1];
  return {
    domain: host.domain,
    vapor_score: latest.vapor_score,
    sniff_score: latest.sniff_score,
    tier: latest.tier,
    metrics: latest.metrics,
    scanned_at: latest.scanned_at,
    algo_version: latest.algo_version,
    delta:
      sameVersion.length >= 2 ? latest.sniff_score - first.sniff_score : null,
  };
}

/**
 * Record one successful scan. Returns the host's board row, or null when
 * the final URL can't be reduced to a sane domain (never happens for real
 * scans — fetchPage rejects those first). Re-scans update the entry and
 * append a history chapter; a live scan of a fixture host OVERRIDES its
 * seed row, adopting the seed scan as history chapter 1.
 */
export function recordBoardScan(
  input: RecordBoardScanInput,
): LeaderboardEntry | null {
  let hostname: string;
  try {
    hostname = new URL(input.finalUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
  const domain = normalizeSlug(hostname);
  if (!domain) return null;

  let host = live.get(domain);
  if (!host) {
    // First live sighting. The seed scan (when one exists) becomes chapter
    // 1 — the seed score itself is never touched, it just frames the
    // "before" so the re-scan immediately has a real delta.
    const seed = getSeedResults().find((e) => e.domain === domain);
    host = { domain, scans: seed ? [seed.result] : [] };
    live.set(domain, host);
  }
  // Newest first. The full ScanResult stays (verdict, evidence, snapshot
  // hash) — profiles and share cards read the same history.
  host.scans.unshift(input.result);
  return boardEntryFor(host);
}

/**
 * One host's full history (newest first), or null when the host has never
 * been scanned live. Returns a copy — callers can't mutate the journal.
 */
export function getLiveHost(domain: string): LiveHost | null {
  const host = live.get(domain);
  if (!host) return null;
  return { domain: host.domain, scans: [...host.scans] };
}

/** Board rows for live-scanned hosts only (no seeds). Copy, unsorted. */
export function getLiveEntries(): LeaderboardEntry[] {
  return [...live.values()].map(boardEntryFor);
}

/**
 * Every live-scanned host with its full history (newest first). Copies —
 * callers can't mutate the journal. Backs the biggest-movers roundup
 * (GET /api/vapor/movers), which needs per-host histories filtered by a
 * trailing window rather than just board rows.
 */
export function getAllLiveHosts(): LiveHost[] {
  return [...live.values()].map((h) => ({ domain: h.domain, scans: [...h.scans] }));
}

/**
 * The merged board: live rows (latest scan per host) plus the untouched
 * seed rows for hosts never re-scanned. Live always wins on a host clash.
 */
export function getBoardEntries(): LeaderboardEntry[] {
  const entries = getLiveEntries();
  const liveHosts = new Set(entries.map((e) => e.domain));
  for (const seed of getSeedEntries()) {
    if (!liveHosts.has(seed.domain)) entries.push(seed);
  }
  return entries;
}

/**
 * Sorted board for `GET /api/vapor/leaderboard?sort=`. Same sort helpers as
 * the seed board — 'real' = most real first (default), 'vapor' = the Wall
 * of Shame, 'improved' = biggest sniff-score gain first. Null deltas sort
 * last, so single-scan hosts never fake a comeback.
 */
export function getBoard(sort: LeaderboardSort): LeaderboardEntry[] {
  const entries = getBoardEntries();
  switch (sort) {
    case 'vapor':
      return sortVaporFirst(entries);
    case 'real':
      return sortRealFirst(entries);
    case 'improved':
      return sortImproved(entries);
  }
}
