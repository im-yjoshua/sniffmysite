/**
 * boardStore — the live scan journal's Supabase-backed implementation.
 *
 * This is the module routes and libs read in production. Every successful
 * POST /api/vapor/scan appends one row to `vapor.board_scans` (migration
 * 009); the leaderboard, biggest-movers roundup, startup dossiers, share
 * cards, badges, and the claim gate all read from the same table, so one
 * re-scan updates every surface at once — and Render restarts no longer
 * wipe the journal.
 *
 * Contract mirrors lib/scanlog.ts (the in-memory journal, now the test
 * seam): same shapes, same seed-adoption rule (a host's first live
 * sighting adopts its seed scan as history chapter 1), same board-row
 * math via the shared `boardEntryForScans` pure function.
 *
 * Degradation policy: the journal is auxiliary to the scan itself. Writes
 * are best-effort (a failed journal write logs loudly but never fails the
 * scan response); reads fall back to the seed fixtures (board, profiles)
 * or empty (movers) so the site stays up if Supabase hiccups.
 */

import { getSupabase } from './supabase';
import { normalizeSlug } from './slug';
import {
  adoptSeed,
  boardEntryForScans,
  type LiveHost,
  type RecordBoardScanInput,
} from './scanlog';
import {
  getSeedEntries,
  sortImproved,
  sortRealFirst,
  sortVaporFirst,
  type LeaderboardEntry,
  type LeaderboardSort,
} from './seed';
import type { ScanResult } from './score';

/** Max scan chapters kept per host — pruned on write (see below). */
export const BOARD_SCAN_CAP = 100;

let warnedNoSupabase = false;
/**
 * Loud on real failures; warn-once when Supabase simply isn't configured
 * (tests and local dev without env vars hit the seed-fallback path by
 * design — no need to shout about it on every call).
 */
function logBoardError(context: string, e: unknown): void {
  if (e instanceof Error && e.message === 'supabase_not_configured') {
    if (warnedNoSupabase) return;
    warnedNoSupabase = true;
  }
  console.error(`[boardStore] ${context}:`, e);
}

/** One row of the `vapor.board_bookends` view (migration 009). */
interface BookendRow {
  domain: string;
  result: ScanResult;
  is_latest: boolean;
  is_first_in_version: boolean;
}

function vapor() {
  return getSupabase().schema('vapor');
}

/**
 * Prune a host's history to the latest BOARD_SCAN_CAP chapters. Scans are
 * user-driven and append-only; without a cap one pathological host could
 * eat the free-tier storage. The redemption arc ("first sniff → latest")
 * survives for any realistic host.
 */
async function pruneHost(domain: string): Promise<void> {
  const { data, error } = await vapor()
    .from('board_scans')
    .select('id')
    .eq('domain', domain)
    .order('scanned_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(BOARD_SCAN_CAP + 1);
  if (error) throw error;
  const stale = (data ?? []).slice(BOARD_SCAN_CAP).map((r) => r.id);
  if (stale.length === 0) return;
  const { error: delError } = await vapor()
    .from('board_scans')
    .delete()
    .in('id', stale);
  if (delError) throw delError;
}

/**
 * Record one successful scan. Returns the host's board row, or null when
 * the final URL can't be reduced to a sane domain — or when the journal
 * write itself fails (best-effort: the scan already succeeded).
 */
export async function recordBoardScan(
  input: RecordBoardScanInput,
): Promise<LeaderboardEntry | null> {
  let hostname: string;
  try {
    hostname = new URL(input.finalUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
  const domain = normalizeSlug(hostname);
  if (!domain) return null;
  try {
    const { error } = await vapor().from('board_scans').insert({
      domain,
      result: input.result,
      scanned_at: input.result.scanned_at,
    });
    if (error) throw error;
    await pruneHost(domain);
    const host = await getLiveHost(domain);
    return host ? boardEntryForScans(host.domain, host.scans) : null;
  } catch (e) {
    logBoardError('recordBoardScan failed (scan itself succeeded)', e);
    return null;
  }
}

/**
 * One host's full history (newest first), or null when the host has never
 * been scanned live — or when the read fails (callers fall back to seeds).
 * Returns copies — callers can't mutate the journal.
 */
export async function getLiveHost(domain: string): Promise<LiveHost | null> {
  try {
    const { data, error } = await vapor()
      .from('board_scans')
      .select('result')
      .eq('domain', domain)
      .order('scanned_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(BOARD_SCAN_CAP);
    if (error) throw error;
    const scans = (data ?? []).map((r) => r.result as ScanResult);
    if (scans.length === 0) return null;
    return { domain, scans: adoptSeed(domain, scans) };
  } catch (e) {
    logBoardError('getLiveHost failed', e);
    return null;
  }
}

/**
 * Build board rows from bookend rows: latest scan + oldest scan sharing
 * the latest's algo_version, per host. Seed adoption appends the seed as
 * the oldest chapter (same rule as the in-memory journal).
 */
function boardRowsFromBookends(rows: BookendRow[]): LeaderboardEntry[] {
  const byDomain = new Map<string, BookendRow[]>();
  for (const row of rows) {
    const list = byDomain.get(row.domain) ?? [];
    list.push(row);
    byDomain.set(row.domain, list);
  }
  const entries: LeaderboardEntry[] = [];
  for (const [domain, list] of byDomain) {
    const latest = list.find((r) => r.is_latest);
    if (!latest) continue;
    const first = list.find(
      (r) =>
        r.is_first_in_version &&
        (r.result as ScanResult).algo_version ===
          (latest.result as ScanResult).algo_version,
    );
    const scans = first && first !== latest ? [latest.result, first.result] : [latest.result];
    entries.push(boardEntryForScans(domain, adoptSeed(domain, scans as ScanResult[])));
  }
  return entries;
}

function sortEntries(
  entries: LeaderboardEntry[],
  sort: LeaderboardSort,
): LeaderboardEntry[] {
  switch (sort) {
    case 'vapor':
      return sortVaporFirst(entries);
    case 'real':
      return sortRealFirst(entries);
    case 'improved':
      return sortImproved(entries);
  }
}

/**
 * The merged board: live rows (latest scan per host) plus the untouched
 * seed rows for hosts never re-scanned. Live always wins on a host clash.
 * Falls back to the seed-only board when the read fails.
 */
export async function getBoard(
  sort: LeaderboardSort,
): Promise<LeaderboardEntry[]> {
  try {
    const { data, error } = await vapor()
      .from('board_bookends')
      .select('domain, result, is_latest, is_first_in_version');
    if (error) throw error;
    const entries = boardRowsFromBookends((data ?? []) as BookendRow[]);
    const liveHosts = new Set(entries.map((e) => e.domain));
    for (const seed of getSeedEntries()) {
      if (!liveHosts.has(seed.domain)) entries.push(seed);
    }
    return sortEntries(entries, sort);
  } catch (e) {
    logBoardError('getBoard failed, serving seed board', e);
    return sortEntries(getSeedEntries(), sort);
  }
}

/**
 * Every host scanned since `sinceIso`, with its in-window history (newest
 * first). Backs the biggest-movers roundup, which needs per-host
 * histories filtered by a trailing window rather than just board rows.
 * Empty on read failure — movers then honestly reports no movers.
 */
export async function getHostsScannedSince(
  sinceIso: string,
): Promise<LiveHost[]> {
  try {
    const { data, error } = await vapor()
      .from('board_scans')
      .select('domain, result')
      .gte('scanned_at', sinceIso)
      .order('scanned_at', { ascending: false })
      .order('id', { ascending: false });
    if (error) throw error;
    const byDomain = new Map<string, ScanResult[]>();
    for (const row of (data ?? []) as { domain: string; result: ScanResult }[]) {
      const list = byDomain.get(row.domain) ?? [];
      list.push(row.result);
      byDomain.set(row.domain, list);
    }
    return [...byDomain].map(([domain, scans]) => ({
      domain,
      scans: adoptSeed(domain, scans),
    }));
  } catch (e) {
    logBoardError('getHostsScannedSince failed', e);
    return [];
  }
}
