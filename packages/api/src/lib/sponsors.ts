import crypto from 'crypto';

/**
 * Rentable sponsored banner slots — SniffMySite homepage.
 *
 * NON-NEGOTIABLE PRODUCT RULES (enforced by design, not just copy):
 * - Sponsors NEVER affect scores, verdicts, rankings, or leaderboard
 *   placement. This module has zero imports from the scoring engine and
 *   no route serves sponsors next to score data.
 * - Payment alone NEVER publishes a banner. Every record is born
 *   `pending_approval`; the public `GET /sponsors` only serves records a
 *   human approved, inside their paid window.
 * - TEST MODE ONLY (same gate as lib/billing.ts): checkout creation
 *   hard-refuses unless `LEMONSQUEEZY_TEST_MODE=true`.
 *
 * Products (PRICES ARE PLACEHOLDER — Joshua sets final pricing before live):
 *   - banner7  $19 "Homepage banner, 7 days"
 *   - banner30 $59 "Homepage banner, 30 days"
 *
 * State lives in an in-memory Map keyed by sponsor id. Deploy seam:
 * Supabase (a `sponsors` table) replaces this Map — same record shape,
 * same function signatures. Server restarts lose in-memory sponsor state,
 * exactly like billing entitlements and Task 8 claims.
 */

export type SponsorProductKey = 'banner7' | 'banner30';

export interface SponsorProductDef {
  key: SponsorProductKey;
  name: string;
  blurb: string;
  /** PLACEHOLDER price — Joshua sets final pricing before launch. */
  priceCents: number;
  priceDisplay: string;
  /** Env var holding this product's Lemon Squeezy variant ID. */
  variantEnv:
    | 'LEMONSQUEEZY_BANNER7_VARIANT_ID'
    | 'LEMONSQUEEZY_BANNER30_VARIANT_ID';
  /** Paid run length in days. */
  termDays: number;
}

/** Separate catalog — banner products are NEVER part of the rescan/audit
 *  credit ledger. */
export const SPONSOR_PRODUCTS: Record<SponsorProductKey, SponsorProductDef> = {
  banner7: {
    key: 'banner7',
    name: 'Homepage banner — 7 days',
    blurb: 'Your banner on the homepage for a week, clearly labeled Sponsored.',
    priceCents: 1900,
    priceDisplay: '$19',
    variantEnv: 'LEMONSQUEEZY_BANNER7_VARIANT_ID',
    termDays: 7,
  },
  banner30: {
    key: 'banner30',
    name: 'Homepage banner — 30 days',
    blurb: 'Your banner on the homepage for a month, clearly labeled Sponsored.',
    priceCents: 5900,
    priceDisplay: '$59',
    variantEnv: 'LEMONSQUEEZY_BANNER30_VARIANT_ID',
    termDays: 30,
  },
};

export function isSponsorProductKey(v: unknown): v is SponsorProductKey {
  return v === 'banner7' || v === 'banner30';
}

export type SponsorStatus = 'pending_approval' | 'approved' | 'rejected';

export function isSponsorStatus(v: unknown): v is SponsorStatus {
  return (
    v === 'pending_approval' || v === 'approved' || v === 'rejected'
  );
}

export interface SponsorRecord {
  id: string;
  brand_name: string;
  image_url: string;
  dest_url: string;
  alt_text: string;
  buyer_email: string;
  term_days: number;
  status: SponsorStatus;
  order_id: string;
  created_at: string;
  /** Null until a human approves. ISO strings once approved. */
  starts_at: string | null;
  ends_at: string | null;
}

/** Public-safe shape: no buyer email, no order id. */
export interface PublicSponsor {
  id: string;
  brand_name: string;
  image_url: string;
  dest_url: string;
  alt_text: string;
}

const DAY_MS = 86_400_000;

const sponsors = new Map<string, SponsorRecord>();
const byOrderId = new Map<string, string>();

/* ------------------------------------------------------------------ */
/* Advertiser input validation (server-side, mirrored client-side)     */
/* ------------------------------------------------------------------ */

export interface AdvertiserInput {
  brand_name: string;
  image_url: string;
  dest_url: string;
  alt_text: string;
}

/** Control characters are stripped, never echoed back into errors. */
const CONTROL_CHARS = /[\x00-\x1F\x7F]/g;

function cleanText(v: unknown): string {
  return typeof v === 'string' ? v.replace(CONTROL_CHARS, '').trim() : '';
}

function isHttpsUrl(v: string): boolean {
  if (!v || v.length > 2048) return false;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return false;
  }
  return u.protocol === 'https:';
}

/**
 * Validate the advertiser inputs carried on the checkout request body.
 * - brand_name / alt_text: required, length-capped, control chars stripped
 * - image_url / dest_url: must be https:// (rejects http:, javascript:,
 *   data:, ftp:, and relative URLs)
 */
export function validateAdvertiser(
  body: unknown,
): { ok: true; value: AdvertiserInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const brand_name = cleanText(b.brand_name);
  const image_url = cleanText(b.image_url);
  const dest_url = cleanText(b.dest_url);
  const alt_text = cleanText(b.alt_text);

  if (!brand_name) return { ok: false, error: 'brand_name is required.' };
  if (brand_name.length > 60) {
    return { ok: false, error: 'brand_name must be 60 characters or fewer.' };
  }
  if (!isHttpsUrl(image_url)) {
    return { ok: false, error: 'image_url must be a valid https:// URL.' };
  }
  if (!isHttpsUrl(dest_url)) {
    return { ok: false, error: 'dest_url must be a valid https:// URL.' };
  }
  if (!alt_text) return { ok: false, error: 'alt_text is required.' };
  if (alt_text.length > 120) {
    return { ok: false, error: 'alt_text must be 120 characters or fewer.' };
  }
  return { ok: true, value: { brand_name, image_url, dest_url, alt_text } };
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

/** Test seam — wipes in-memory sponsor state. Never called in production. */
export function _resetSponsorState(): void {
  sponsors.clear();
  byOrderId.clear();
}

/**
 * Create a sponsor record as `pending_approval`. Idempotent on the Lemon
 * Squeezy order id — the same order id twice returns the existing record
 * without creating a second one.
 */
export function createPendingSponsor(
  input: AdvertiserInput,
  orderId: string,
  buyerEmail: string,
  termDays: number,
  nowMs: number = Date.now(),
): { created: boolean; record: SponsorRecord } {
  const existingId = byOrderId.get(orderId);
  if (existingId) {
    const existing = sponsors.get(existingId);
    if (existing) return { created: false, record: existing };
  }
  const id = crypto.randomBytes(16).toString('hex');
  const record: SponsorRecord = {
    id,
    brand_name: input.brand_name,
    image_url: input.image_url,
    dest_url: input.dest_url,
    alt_text: input.alt_text,
    buyer_email: buyerEmail.toLowerCase(),
    term_days: termDays,
    status: 'pending_approval',
    order_id: orderId,
    created_at: new Date(nowMs).toISOString(),
    starts_at: null,
    ends_at: null,
  };
  sponsors.set(id, record);
  byOrderId.set(orderId, id);
  return { created: true, record };
}

/**
 * Human approval: sets status approved, starts the paid window now
 * (or at the given epoch ms), ends_at = starts_at + term_days.
 * A rejected sponsor can be re-approved — that restarts the window.
 */
export function approveSponsor(
  id: string,
  startsAtMs: number | null = null,
  nowMs: number = Date.now(),
): SponsorRecord | null {
  const rec = sponsors.get(id);
  if (!rec) return null;
  const start = startsAtMs ?? nowMs;
  rec.status = 'approved';
  rec.starts_at = new Date(start).toISOString();
  rec.ends_at = new Date(start + rec.term_days * DAY_MS).toISOString();
  return rec;
}

/** Human rejection. A rejected record is never servable. */
export function rejectSponsor(id: string): SponsorRecord | null {
  const rec = sponsors.get(id);
  if (!rec) return null;
  rec.status = 'rejected';
  return rec;
}

/**
 * What the homepage shows: approved records whose paid window covers
 * `nowMs`, oldest-first (by creation time) so the frontend can take
 * index 0 and 1 for the two slots.
 */
export function listActiveSponsors(
  nowMs: number = Date.now(),
): PublicSponsor[] {
  return [...sponsors.values()]
    .filter((r) => {
      if (r.status !== 'approved') return false;
      if (!r.starts_at || !r.ends_at) return false;
      const start = Date.parse(r.starts_at);
      const end = Date.parse(r.ends_at);
      return nowMs >= start && nowMs < end;
    })
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((r) => ({
      id: r.id,
      brand_name: r.brand_name,
      image_url: r.image_url,
      dest_url: r.dest_url,
      alt_text: r.alt_text,
    }));
}

/** Admin view: everything, newest first; optionally filtered by status. */
export function listSponsors(status?: SponsorStatus): SponsorRecord[] {
  return [...sponsors.values()]
    .filter((r) => !status || r.status === status)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function getSponsor(id: string): SponsorRecord | null {
  return sponsors.get(id) ?? null;
}

/* ------------------------------------------------------------------ */
/* Webhook event application (pure, unit-tested)                        */
/* ------------------------------------------------------------------ */

export type SponsorWebhookOutcome =
  | { handled: true; action: 'pending_approval' | 'duplicate' | 'refunded' }
  | { handled: false; reason: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Apply a verified Lemon Squeezy event to the sponsor store.
 * - order_created  → create a `pending_approval` record (idempotent on the
 *   LS order id; the record goes live ONLY after human approval)
 * - order_refunded → mark the record `rejected` — it can never be served
 * - anything else  → ignored, honestly reported as such
 *
 * Banner products never touch the rescan/audit credit ledger — this module
 * doesn't import it, and the route dispatches banner products here before
 * `applyBillingEvent` runs.
 */
export function applySponsorEvent(payload: any): SponsorWebhookOutcome {
  const eventName = payload?.meta?.event_name;
  const data = payload?.data;
  if (typeof eventName !== 'string' || !data) {
    return { handled: false, reason: 'malformed_event' };
  }

  if (eventName === 'order_created') {
    const custom = payload?.meta?.custom_data ?? {};
    const product = custom.product;
    if (!isSponsorProductKey(product)) {
      return { handled: false, reason: 'unknown_product' };
    }
    const orderId = String(data.id);
    const email = (
      custom.email ??
      data?.attributes?.user_email ??
      ''
    )
      .toString()
      .trim();
    const advertiser = validateAdvertiser(custom);
    if (!email || !EMAIL_RE.test(email) || !advertiser.ok) {
      return { handled: false, reason: 'invalid_advertiser_input' };
    }
    const { created } = createPendingSponsor(
      advertiser.value,
      orderId,
      email,
      SPONSOR_PRODUCTS[product].termDays,
    );
    return { handled: true, action: created ? 'pending_approval' : 'duplicate' };
  }

  if (eventName === 'order_refunded') {
    const orderId = String(data.id);
    const id = byOrderId.get(orderId);
    if (id) {
      const rec = sponsors.get(id);
      if (rec) rec.status = 'rejected';
    }
    // Unknown order: idempotent no-op, still a 200 to stop LS retries.
    return { handled: true, action: 'refunded' };
  }

  return { handled: false, reason: `ignored:${eventName}` };
}
