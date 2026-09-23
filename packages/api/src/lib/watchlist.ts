import crypto from 'crypto';
import { normalizeSlug } from './slug';
import { getLiveHost } from './scanlog';
import { sendScoreDropAlert } from './resend';
import { type ScanResult, type Tier } from './score';

/**
 * Score-drop watchlist — Growth Plan §3.
 *
 * A claimed domain with an alert email on file gets one email per real
 * score drop: ≥10 sniff points, or a full tier drop. Small wiggles are
 * noise — never email noise.
 *
 * State lives in an in-memory Map keyed by normalized domain. Deploy seam:
 * a Supabase `watchlist` table (domain PK, email, unsub_token, last_alerted_score,
 * created_at) replaces this Map — same record shape, same function signatures.
 * Server restarts lose the list, exactly like the billing credit ledger
 * (lib/billing.ts) and the recent-scans ring (lib/recent.ts).
 *
 * PRIVACY: the email address is NEVER logged, never echoed in errors, and
 * never leaves this module except inside the Resend `to` field. The dev-mode
 * console path logs the domain + scores only.
 */

export interface WatchlistEntry {
  domain: string;
  email: string;
  unsubToken: string;
  /** The score we last alerted about; null = no alert owed (fresh start or
   * recovered since). One alert per drop event, then silence until a deeper
   * low or a recovery. */
  lastAlertedScore: number | null;
  createdAt: string;
}

const watchlist = new Map<string, WatchlistEntry>();

/** Tier order, best → worst. CERTIFIED REAL > ALMOST REAL > SUS > JUST VIBES > CERTIFIED FAKE. */
const TIER_RANK: Tier[] = [
  'CERTIFIED REAL',
  'ALMOST REAL',
  'SUS',
  'JUST VIBES',
  'CERTIFIED FAKE',
];

/** 10 points — a drop this size is a real product move, not a wiggle. */
export const SCORE_DROP_THRESHOLD = 10;

function tierRank(tier: Tier): number {
  return TIER_RANK.indexOf(tier);
}

/**
 * Add (or update) a watchlist entry. Email changes update the address;
 * `lastAlertedScore` survives updates — a changed email doesn't reset the
 * one-alert-per-drop bookkeeping. Synchronous: it's just a Map write.
 */
export function upsertWatchlist(rawDomain: unknown, rawEmail: unknown): WatchlistEntry | null {
  const domain = normalizeSlug(rawDomain);
  if (!domain) return null;
  if (typeof rawEmail !== 'string' || rawEmail.trim().length === 0) return null;
  const email = rawEmail.trim().toLowerCase();

  const existing = watchlist.get(domain);
  if (existing) {
    existing.email = email;
    return existing;
  }
  const entry: WatchlistEntry = {
    domain,
    email,
    unsubToken: crypto.randomBytes(24).toString('hex'), // 48 hex chars
    lastAlertedScore: null,
    createdAt: new Date().toISOString(),
  };
  watchlist.set(domain, entry);
  return entry;
}

/** The entry for a domain, or null. Internal-ish; tests use it too. */
export function getWatchlistEntry(rawDomain: unknown): WatchlistEntry | null {
  const domain = normalizeSlug(rawDomain);
  if (!domain) return null;
  return watchlist.get(domain) ?? null;
}

/**
 * Remove the entry whose unsub token matches. Returns the domain that was
 * removed, or null when the token is unknown/spent. Timing-safe compare —
 * the token is a bearer credential.
 */
export function unsubscribeByToken(rawToken: unknown): string | null {
  if (typeof rawToken !== 'string' || rawToken.length === 0) return null;
  const wanted = Buffer.from(rawToken, 'utf8');
  for (const [domain, entry] of watchlist) {
    const have = Buffer.from(entry.unsubToken, 'utf8');
    if (have.length === wanted.length && crypto.timingSafeEqual(have, wanted)) {
      watchlist.delete(domain);
      return domain;
    }
  }
  return null;
}

/** Test-only escape hatch: clear the in-memory watchlist. */
export function resetWatchlist(): void {
  watchlist.clear();
}

export type AlertSender = typeof sendScoreDropAlert;

/**
 * Called after every successful scan (the scan route hooks this in after
 * `recordBoardScan`, before `res.json`). Fire-and-forget — never slows or
 * breaks the scan response, and never throws.
 *
 * Baseline rule: scans[0] is the scan we just recorded, so the baseline is
 * scans[1], filtered to the SAME algo_version as the new result. A v1→v2
 * formula change is never presented as a product move — no baseline, no
 * alert (standing constraint).
 *
 * Alert when the drop is ≥10 points OR the tier rank dropped. One alert per
 * drop event: sent only if no alert is owed (lastAlertedScore === null) or
 * the new score is a NEW low; on a non-qualifying scan the owed state
 * resets to null (recovered — future drops alert fresh).
 */
export async function processScanForWatchlist(
  finalUrl: string,
  result: ScanResult,
  sendAlert: AlertSender = sendScoreDropAlert,
): Promise<void> {
  let domain: string | null;
  try {
    domain = normalizeSlug(new URL(finalUrl).hostname);
  } catch {
    return;
  }
  if (!domain) return;

  const entry = watchlist.get(domain);
  if (!entry) return;

  // scans[0] is the just-recorded scan — skip it. Take the most recent
  // scan sharing the new result's algo_version (seed adoption makes this
  // work for fixture hosts on their first live sighting).
  const history = getLiveHost(domain)?.scans ?? [];
  const baseline = history.slice(1).find((s) => s.algo_version === result.algo_version);
  if (!baseline) return;

  const pointsDrop = baseline.sniff_score - result.sniff_score;
  const qualifies =
    pointsDrop >= SCORE_DROP_THRESHOLD ||
    tierRank(result.tier) > tierRank(baseline.tier);

  if (!qualifies) {
    // Stable, up, or a small wiggle — no alert, and any pending owed-alert
    // state clears: the next drop starts from a clean slate.
    entry.lastAlertedScore = null;
    return;
  }

  if (entry.lastAlertedScore !== null && result.sniff_score >= entry.lastAlertedScore) {
    // Same drop event we already mailed about — silence, not a duplicate.
    return;
  }

  const apiBase = (
    process.env.PUBLIC_API_URL ??
    process.env.PUBLIC_SITE_URL ??
    'https://sniffmysite.lol'
  ).replace(/\/+$/, '');
  const siteUrl = (process.env.PUBLIC_SITE_URL ?? 'https://sniffmysite.lol').replace(
    /\/+$/,
    '',
  );
  const unsubUrl = `${apiBase}/api/vapor/watchlist/unsubscribe?token=${entry.unsubToken}`;

  try {
    await sendAlert({
      to: entry.email,
      domain,
      slug: domain,
      prevScore: baseline.sniff_score,
      newScore: result.sniff_score,
      tier: result.tier,
      unsubUrl,
      siteUrl,
    });
    entry.lastAlertedScore = result.sniff_score;
  } catch (err) {
    // The scan already landed; a failed alert must never crash anything.
    // Log the DOMAIN, never the email address.
    console.error('[watchlist] alert send failed for', domain, (err as Error).message);
  }
}

