import crypto from 'node:crypto';

/**
 * Polar webhook plumbing (Phase A1 — Featured Roast fulfillment).
 *
 * Signature verification follows the Standard Webhooks spec, which Polar
 * implements (verified against Polar's docs, Sep 2026 — see also the
 * `standardwebhooks` library and Polar's own @polar-sh/sdk verifier):
 *
 *   - Headers: `webhook-id`, `webhook-timestamp`, `webhook-signature`.
 *   - The signature is HMAC-SHA256, base64-encoded, over
 *     `{webhook-id}.{webhook-timestamp}.{rawBody}` — the RAW bytes, never
 *     the parsed object.
 *   - Secret handling: the dashboard secret is base64-encoded; the HMAC key
 *     is the base64-DECODED bytes (this is what the `standardwebhooks`
 *     library and Polar's own @polar-sh/sdk verifier do — they decode,
 *     never encode). Strip an optional `whsec_` prefix first.
 *   - `webhook-signature` may carry several space-separated `v1,<base64>`
 *     tokens (key rotation); any match verifies.
 *   - The timestamp is seconds-since-epoch; we reject anything older than
 *     5 minutes to kill replays.
 *
 * Event envelope: `{ "type": "order.paid", "data": { ...order... } }`.
 * Checkout custom fields land on the order under `custom_field_data`,
 * keyed by field slug — ours is `website-url` (required at checkout).
 */

const TIMESTAMP_TOLERANCE_S = 300; // 5-minute replay window

export type HeaderGetter = (name: string) => string | undefined;

/**
 * Verify a Polar webhook delivery. Pure function — unit-tested in
 * src/test/polar.test.ts. Returns false (never throws) on any problem.
 */
export function verifyPolarSignature(
  rawBody: Buffer,
  getHeader: HeaderGetter,
  secret: string | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!secret || secret.trim().length === 0) return false;
  if (!rawBody || rawBody.length === 0) return false;

  const id = getHeader('webhook-id');
  const timestamp = getHeader('webhook-timestamp');
  const signature = getHeader('webhook-signature');
  if (!id || !timestamp || !signature) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const skew = Math.abs(nowMs / 1000 - ts);
  if (skew > TIMESTAMP_TOLERANCE_S) return false;

  // Standard Webhooks: the dashboard secret is base64-encoded; the HMAC key
  // is the DECODED bytes (mirrors the `standardwebhooks` library and Polar's
  // own SDK verifier). Strip an optional `whsec_` prefix first.
  let keyMaterial = secret.trim();
  if (keyMaterial.startsWith('whsec_')) keyMaterial = keyMaterial.slice('whsec_'.length);
  const key = Buffer.from(keyMaterial, 'base64');
  const signedContent = `${id}.${timestamp}.${rawBody.toString('utf8')}`;
  const digest = crypto
    .createHmac('sha256', key)
    .update(signedContent, 'utf8')
    .digest('base64');
  const expected = `v1,${digest}`;

  // Several signatures may be present (key rotation) — any match verifies.
  const tokens = signature.split(' ').map((t) => t.trim()).filter(Boolean);
  return tokens.some((token) => {
    const a = Buffer.from(token, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

/* ------------------------------------------------------------------ */
/* Event parsing                                                       */
/* ------------------------------------------------------------------ */

export type PolarOrderEvent = 'order.paid' | 'order.refunded';

export type ParsedPolarEvent =
  | { ok: true; type: PolarOrderEvent; orderId: string; order: Record<string, unknown> }
  | { ok: false; reason: 'invalid_payload' | 'ignored_event' };

/** We only fulfill order.paid / order.refunded; everything else is ignored
 *  with 200 so Polar doesn't retry what we'll never handle. */
export function parsePolarEvent(payload: unknown): ParsedPolarEvent {
  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, reason: 'invalid_payload' };
  }
  const p = payload as Record<string, unknown>;
  if (typeof p.type !== 'string' || typeof p.data !== 'object' || p.data === null) {
    return { ok: false, reason: 'invalid_payload' };
  }
  if (p.type !== 'order.paid' && p.type !== 'order.refunded') {
    return { ok: false, reason: 'ignored_event' };
  }
  const order = p.data as Record<string, unknown>;
  if (typeof order.id !== 'string' || order.id.length === 0) {
    return { ok: false, reason: 'invalid_payload' };
  }
  return { ok: true, type: p.type, orderId: order.id, order };
}

/* ------------------------------------------------------------------ */
/* website-url extraction + validation                                 */
/* ------------------------------------------------------------------ */

export type WebsiteUrlResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'missing_url' | 'invalid_url' };

const MAX_URL_LENGTH = 2048;

/**
 * Read the required `website-url` checkout custom field and sanity-check
 * it. This is syntactic only — SSRF safety lives in fetchPage's
 * validatedEndpoint (re-validated on every redirect hop). Returns the URL
 * with an https:// scheme default when the buyer typed a bare domain.
 */
export function extractWebsiteUrl(order: Record<string, unknown>): WebsiteUrlResult {
  const cfd = order.custom_field_data;
  const raw =
    typeof cfd === 'object' && cfd !== null
      ? (cfd as Record<string, unknown>)['website-url']
      : undefined;
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { ok: false, reason: 'missing_url' };
  }
  let candidate = raw.trim();
  if (candidate.length > MAX_URL_LENGTH) return { ok: false, reason: 'invalid_url' };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'invalid_url' };
  }
  const host = parsed.hostname.toLowerCase();
  if (host === '' || host === 'localhost') return { ok: false, reason: 'invalid_url' };
  return { ok: true, url: parsed.toString() };
}

/** Buyer email, best-effort — informational only, never a fulfillment key. */
export function extractBuyerEmail(order: Record<string, unknown>): string | null {
  const customer = order.customer;
  const raw =
    (typeof customer === 'object' && customer !== null
      ? (customer as Record<string, unknown>).email
      : undefined) ?? order.customer_email;
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : null;
}
