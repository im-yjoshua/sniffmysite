import crypto from 'crypto';
import dns from 'dns/promises';
import { normalizeSlug, getProfile } from './profile';
import { upsertWatchlist } from './watchlist';

/**
 * VaporRank claim flow — Task 8 (§2.9, §2.11).
 *
 * Founders prove domain ownership with a DNS TXT record before they can
 * claim a listing (which later gates re-scans and the Certified Real audit).
 *
 * Canonical verification location (ONE place, no fallback hunting):
 *   host:  _sniffmysite.<domain>
 *   value: sniffmysite-verification=<token>
 * The underscored host keeps the record out of the way of real DNS entries,
 * and a single location means the instructions never need an "or try this".
 *
 * Claim scope (deliberate, §2.9): only domains already on the board can be
 * claimed. The plan says one listing per domain and claims gate paid
 * actions — with no user accounts in the MVP, the claimable surface is the
 * listed set. `POST /claim` 404s unknown domains. (The `<meta>` tag
 * alternative from §2.9 is a documented future, not this task.)
 *
 * State lives in an in-memory Map keyed by normalized domain. Deploy seam:
 * the Supabase `claims` table (foundation SQL 001) replaces this Map —
 * same record shape, same function signatures.
 *
 * No `user_id` binding in the MVP: claims are keyed by domain. Auth arrives
 * later (Task 10+), at which point `claimed_by` gets a user column.
 */

export const CLAIM_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const VAPOR_TXT_HOST = '_sniffmysite';
export const VAPOR_TXT_PREFIX = 'sniffmysite-verification=';

/** Same email shape the scan route's priority lane enforces (routes/vapor.ts
 * EMAIL_RE). Kept local so the lib never needs the route. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Normalize an alert email: trim + lowercase, or null when absent. Returns
 * 'invalid' for a non-empty value that isn't an email. The caller's email
 * address is never logged or echoed — bad values just get rejected.
 */
export function normalizeAlertEmail(input: unknown): string | 'invalid' | null {
  if (input === undefined || input === null) return null;
  if (typeof input !== 'string') return 'invalid';
  const email = input.trim().toLowerCase();
  if (email.length === 0) return null;
  if (email.length > 254 || !EMAIL_RE.test(email)) return 'invalid';
  return email;
}

export interface ClaimRecord {
  domain: string;
  token: string;
  createdAt: string;
  expiresAt: string;
  verified: boolean;
  verifiedAt: string | null;
  /** Optional alert email captured at claim time (growth plan §3). Never
   * echoed in errors or logs — only ever sent to. */
  email: string | null;
  /** False = the founder unchecked the alerts box; no watchlist entry then. */
  alertsOptIn: boolean;
}

const pendingClaims = new Map<string, ClaimRecord>();

/** DNS TXT host to publish the record at, e.g. `_sniffmysite.example.com`. */
export function txtRecordHost(domain: string): string {
  return `${VAPOR_TXT_HOST}.${domain}`;
}

/** Exact TXT record value the founder must publish. */
export function txtRecordValue(token: string): string {
  return `${VAPOR_TXT_PREFIX}${token}`;
}

/** Timing-safe string equality — the token comparison never leaks length. */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

export type ClaimOutcome =
  | { ok: true; record: ClaimRecord; isNew: boolean }
  | { ok: false; error: 'invalid_domain' | 'startup_not_found' | 'invalid_email' };

export interface ClaimOpts {
  email?: unknown;
  alerts?: unknown;
}

/**
 * Mint (or re-issue, idempotently) a claim token for a listed domain.
 * Re-claiming an unexpired, unverified token returns the SAME token —
 * rotating it would invalidate a TXT record the founder just published.
 * Re-claims with opts update the stored email/alerts when provided.
 */
export function createClaim(rawDomain: unknown, opts?: ClaimOpts): ClaimOutcome {
  const domain = normalizeSlug(rawDomain);
  if (!domain) return { ok: false, error: 'invalid_domain' };
  if (!getProfile(domain)) return { ok: false, error: 'startup_not_found' };

  const email = normalizeAlertEmail(opts?.email);
  if (email === 'invalid') return { ok: false, error: 'invalid_email' };
  const alerts = typeof opts?.alerts === 'boolean' ? opts.alerts : null;
  // Default-on: an email given without an explicit alerts flag opts in.
  const alertsOptIn = alerts ?? email !== null;

  const existing = pendingClaims.get(domain);
  if (existing && Date.parse(existing.expiresAt) > Date.now()) {
    // Idempotent path: keep the token, but let a re-claim update the
    // contact details when the caller provides them.
    if (opts && 'email' in opts) {
      existing.email = email;
      existing.alertsOptIn = alerts ?? email !== null;
    } else if (alerts !== null) {
      existing.alertsOptIn = alerts;
    }
    return { ok: true, record: existing, isNew: false };
  }

  const now = Date.now();
  const record: ClaimRecord = {
    domain,
    token: crypto.randomBytes(24).toString('hex'), // 48 hex chars
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + CLAIM_TTL_MS).toISOString(),
    verified: false,
    verifiedAt: null,
    email,
    alertsOptIn,
  };
  pendingClaims.set(domain, record);
  return { ok: true, record, isNew: true };
}

export type VerifyOutcome =
  | { verified: true; claimedAt: string }
  | {
      verified: false;
      reason: 'no_pending_claim' | 'expired' | 'token_not_found' | 'dns_error';
    };

export type DnsLookup = (hostname: string) => Promise<string[][]>;

/**
 * Check the canonical TXT record against the stored token.
 * The client never sends the token back — the server compares DNS against
 * what it issued. DNS failures are "not yet verifiable", never crashes:
 * ENOTFOUND/ENODATA mean the record simply isn't published yet.
 */
export async function verifyClaim(
  rawDomain: unknown,
  lookup: DnsLookup = dns.resolveTxt,
): Promise<VerifyOutcome> {
  const domain = normalizeSlug(rawDomain);
  if (!domain) return { verified: false, reason: 'no_pending_claim' };
  const record = pendingClaims.get(domain);
  if (!record) return { verified: false, reason: 'no_pending_claim' };
  if (record.verified && record.verifiedAt) {
    // Idempotent: the watchlist follows too, so a founder who added an
    // email between checks still gets watched.
    if (record.email && record.alertsOptIn) upsertWatchlist(domain, record.email);
    return { verified: true, claimedAt: record.verifiedAt }; // idempotent
  }
  if (Date.parse(record.expiresAt) <= Date.now()) {
    return { verified: false, reason: 'expired' };
  }

  const want = txtRecordValue(record.token);
  let records: string[][];
  try {
    records = await lookup(txtRecordHost(domain));
  } catch (err) {
    // Record absent (or zone unreachable) — not verifiable yet, not a crash.
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'ENOTFOUND' || code === 'ENODATA') {
      return { verified: false, reason: 'token_not_found' };
    }
    return { verified: false, reason: 'dns_error' };
  }

  // resolveTxt returns string[][] — each record is an array of chunks that
  // must be joined. Exact match only: a token smuggled inside noise is a
  // forgery attempt, not a verification.
  const found = records.some((chunks) => safeEqual(chunks.join('').trim(), want));
  if (!found) return { verified: false, reason: 'token_not_found' };

  record.verified = true;
  record.verifiedAt = new Date().toISOString();
  // The claim is real now — and only now — so the watchlist entry lands
  // here, never on token request alone.
  if (record.email && record.alertsOptIn) upsertWatchlist(domain, record.email);
  return { verified: true, claimedAt: record.verifiedAt };
}

/** Test-only escape hatch: clear the in-memory claim store. */
export function resetClaims(): void {
  pendingClaims.clear();
}

/** The lab-procedure instructions served alongside the token. */
export function claimInstructions(token: string): string[] {
  return [
    'Sign in to your DNS provider — wherever the domain\u2019s nameservers live.',
    `Add a TXT record: host "${VAPOR_TXT_HOST}", value "${txtRecordValue(token)}".`,
    'Save it. DNS propagates on its own schedule, not ours — usually minutes, sometimes hours.',
    'Hit "Check verification" below. The token stays valid for 7 days; the lab will keep checking.',
  ];
}
