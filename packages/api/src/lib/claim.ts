import { createHash, createHmac, randomBytes } from 'node:crypto';

/**
 * Claim-flow primitives (§3.9, Task 7). Pure functions — unit-tested in
 * src/test/claim.test.ts. The route layer (routes/burn.ts) handles IO.
 *
 * Two-step flow:
 *   1. Email: founder enters email → we mint a magic-link token, store only
 *      its sha256 hash (+ 24h expiry), and email the public token. Clicking
 *      the link marks the claim email-verified (single-use: lookup only
 *      matches rows with verified_at IS NULL).
 *   2. DNS: the email-verified founder adds a TXT record
 *      `burnrate-verify=<challenge>` on their domain. The challenge is an
 *      HMAC of the claim id under a server secret — deterministic, so the
 *      API can recompute it without ever storing a plaintext token.
 */

export const CLAIM_TOKEN_BYTES = 32;
export const CLAIM_TTL_MS = 24 * 60 * 60 * 1000; // magic links live 24h
export const DNS_RECORD_PREFIX = 'burnrate-verify=';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Mint a fresh claim token. The public half goes in the magic link email;
 *  only the sha256 hash is ever stored (burn.claims.verification_token). */
export function newClaimToken(): { publicToken: string; tokenHash: string } {
  const publicToken = randomBytes(CLAIM_TOKEN_BYTES).toString('hex');
  return { publicToken, tokenHash: hashToken(publicToken) };
}

/** sha256 hex of a token — the only form that touches the database. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** True when the claim's expiry is missing or in the past. */
export function claimExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return true;
  const t = Date.parse(expiresAt);
  return Number.isNaN(t) || t <= Date.now();
}

/** Normalize + validate a claim email. Returns the canonical form or null. */
export function normalizeClaimEmail(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const email = input.trim().toLowerCase();
  if (email.length === 0 || email.length > 254 || !EMAIL_RE.test(email)) return null;
  return email;
}

/** Validate a claim id / company id from user input (UUID-shaped). */
export function sanitizeClaimId(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const id = input.trim().toLowerCase();
  return UUID_RE.test(id) ? id : null;
}

/**
 * Server secret for the DNS challenge HMAC. Deploy-time env (CLAIM_DNS_SECRET).
 * Unset → loud warning + an ephemeral random secret: claim flows still work
 * locally, but DNS challenges won't survive a process restart (acceptable in
 * dev; never in production).
 */
let warnedAboutEphemeralSecret = false;
export function getClaimDnsSecret(): string {
  const fromEnv = process.env.CLAIM_DNS_SECRET;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  if (!warnedAboutEphemeralSecret) {
    warnedAboutEphemeralSecret = true;
    console.warn(
      '[api] CLAIM_DNS_SECRET is unset — using an ephemeral DNS challenge secret. ' +
        'DNS claims will NOT survive a restart. Set CLAIM_DNS_SECRET before launch.',
    );
  }
  // Cached per-process so a single dev session stays consistent.
  return ephemeralSecret;
}
const ephemeralSecret = randomBytes(32).toString('hex');

/**
 * The DNS challenge for a claim: HMAC-SHA256(claim_id) under the server
 * secret, hex-encoded. The founder publishes
 * `burnrate-verify=<challenge>` as a TXT record on their domain.
 */
export function dnsChallengeToken(claimId: string, secret: string): string {
  return createHmac('sha256', secret).update(claimId, 'utf8').digest('hex');
}

/** The exact TXT record value the founder must publish. */
export function dnsRecordValue(claimId: string, secret: string): string {
  return `${DNS_RECORD_PREFIX}${dnsChallengeToken(claimId, secret)}`;
}

/**
 * Match DNS TXT records against the challenge.
 * `dns.promises.resolveTxt` returns string[][] (each record is an array of
 * chunks that must be joined). Exact match on the full record value only —
 * no substring games, or an attacker could smuggle the token inside noise.
 */
export function findMatchingTxt(records: string[][], challenge: string): boolean {
  const want = `${DNS_RECORD_PREFIX}${challenge}`;
  return records.some((chunks) => chunks.join('').trim() === want);
}
