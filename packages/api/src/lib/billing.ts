import crypto from 'crypto';

/**
 * VaporRank billing — Task 9 (§2.6, §2.11). Lemon Squeezy, **TEST MODE ONLY**.
 *
 * Products (from the master plan §2.6 — the plan's real offering, not
 * invented):
 *   - rescan $5  "Priority Re-scan"      — jump the line, fresh score now
 *   - audit  $29 "Certified Real Audit" — human checklist + badge + wall slot
 *
 * Flow: hosted checkout (we never touch card data) → Lemon Squeezy signs a
 * webhook → we HMAC-verify it → idempotent entitlement grant keyed by buyer
 * email. `order_refunded` claws the credit back.
 *
 * TEST MODE GATE: checkout creation hard-refuses unless
 * `LEMONSQUEEZY_TEST_MODE=true`. Live mode stays blocked until Joshua's
 * Lemon Squeezy seller application is approved — see PROGRESS.md (Task 9).
 * Never log the API key or webhook secret anywhere.
 *
 * State: Supabase `billing.credit_ledger` is the source of truth
 * (migration 010), via the atomic `billing.grant_credits` /
 * `billing.consume_credit` / `billing.refund_credits` RPCs — balances and
 * webhook idempotency survive Render restarts. When Supabase isn't
 * configured (unit tests, local dev without env vars) the functions fall
 * back to the in-memory Map below, which keeps the old sync semantics as
 * the test seam. When Supabase IS configured, failures propagate (the
 * webhook answers 500 so Polar redelivers; the scan answers 500 so the
 * buyer retries with their credit intact) — money never silently
 * degrades to memory.
 */

export type BillingProductKey = 'rescan' | 'audit';

export interface ProductDef {
  key: BillingProductKey;
  name: string;
  blurb: string;
  priceCents: number;
  priceDisplay: string;
  /** Env var holding this product's Lemon Squeezy variant ID. */
  variantEnv:
    | 'LEMONSQUEEZY_RESCAN_VARIANT_ID'
    | 'LEMONSQUEEZY_AUDIT_VARIANT_ID';
  /** Credits granted per paid order. */
  creditsPerOrder: number;
}

export const PRODUCTS: Record<BillingProductKey, ProductDef> = {
  rescan: {
    key: 'rescan',
    name: 'Priority Re-scan',
    blurb:
      'Jump the line: a fresh sniff of your landing page, right now. Every re-scan is a public redemption arc.',
    priceCents: 500,
    priceDisplay: '$5',
    variantEnv: 'LEMONSQUEEZY_RESCAN_VARIANT_ID',
    creditsPerOrder: 1,
  },
  audit: {
    key: 'audit',
    name: 'Certified Real Audit',
    blurb:
      'A human-reviewed checklist, the badge on your dossier, and a slot on the Hall of Fame wall.',
    priceCents: 2900,
    priceDisplay: '$29',
    variantEnv: 'LEMONSQUEEZY_AUDIT_VARIANT_ID',
    creditsPerOrder: 1,
  },
};

/** Hard gate: only test mode may create checkouts. */
export function isBillingTestMode(): boolean {
  return process.env.LEMONSQUEEZY_TEST_MODE === 'true';
}

export function isProductKey(v: unknown): v is BillingProductKey {
  return v === 'rescan' || v === 'audit';
}

/* ------------------------------------------------------------------ */
/* Webhook signature (Lemon Squeezy signs with X-Signature)              */
/* ------------------------------------------------------------------ */

/**
 * Verify Lemon Squeezy's `X-Signature` header: hex HMAC-SHA256 of the RAW
 * request body, keyed with the webhook signing secret. The comparison is
 * timing-safe. Requires the raw body bytes — see index.ts `rawBody` capture.
 */
export function verifyWebhookSignature(
  rawBody: Buffer,
  signature: string | undefined | null,
  secret: string | undefined,
): boolean {
  if (!rawBody || rawBody.length === 0) return false;
  if (!signature || !secret) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  const a = Buffer.from(signature.trim(), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ------------------------------------------------------------------ */
/* Hosted checkout creation                                            */
/* ------------------------------------------------------------------ */

export class LemonApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'LemonApiError';
    this.status = status;
  }
}

export interface CheckoutRequest {
  variantId: string;
  storeId: string;
  apiKey: string;
  email: string;
  custom: Record<string, string>;
  testMode: boolean;
}

export interface CheckoutResult {
  checkoutId: string;
  url: string;
  expiresAt: string | null;
}

/** Fetch-shaped injection so tests can stub Lemon Squeezy's API. */
export type HttpFetch = (
  url: string,
  init: RequestInit,
) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;

/**
 * POST /v1/checkouts → hosted payment URL. Never includes the API key in
 * errors. `testMode: true` keeps the checkout in Lemon Squeezy's sandbox.
 */
export async function createLemonCheckout(
  req: CheckoutRequest,
  httpFetch: HttpFetch = fetch as unknown as HttpFetch,
): Promise<CheckoutResult> {
  const res = await httpFetch('https://api.lemonsqueezy.com/v1/checkouts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${req.apiKey}`,
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
    },
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: { email: req.email, custom: req.custom },
          test_mode: req.testMode,
        },
        relationships: {
          store: { data: { type: 'stores', id: req.storeId } },
          variant: { data: { type: 'variants', id: req.variantId } },
        },
      },
    }),
  });
  if (!res.ok) {
    throw new LemonApiError(
      res.status,
      `Lemon Squeezy checkout failed (HTTP ${res.status})`,
    );
  }
  const body = await res.json();
  const url = body?.data?.attributes?.url;
  if (typeof url !== 'string' || !url) {
    throw new LemonApiError(502, 'Lemon Squeezy returned no checkout URL');
  }
  return {
    checkoutId: String(body.data.id),
    url,
    expiresAt: body.data.attributes.expires_at ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Entitlement ledger — Supabase `billing.credit_ledger` (migration 010)   */
/* ------------------------------------------------------------------ */

import { getSupabase } from './supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface EntitlementRecord {
  email: string;
  product: BillingProductKey;
  credits: number;
  orderIds: string[];
  updatedAt: string;
}

/**
 * In-memory fallback used ONLY when Supabase isn't configured (unit
 * tests, local dev without env vars). Never the production path.
 */
const ledger = new Map<string, EntitlementRecord>();

function ledgerKey(email: string, product: BillingProductKey): string {
  return `${email.toLowerCase()}|${product}`;
}

/** Null when Supabase isn't configured → use the in-memory fallback. */
function billingDb(): SupabaseClient | null {
  try {
    return getSupabase();
  } catch (e) {
    if (e instanceof Error && e.message === 'supabase_not_configured') return null;
    throw e;
  }
}

function billingSchema(db: SupabaseClient) {
  return db.schema('billing');
}

/* ---------------- in-memory fallback (test seam) ---------------- */

function grantCreditsMem(
  email: string,
  product: BillingProductKey,
  orderId: string,
): { granted: boolean; credits: number } {
  const key = ledgerKey(email, product);
  const rec: EntitlementRecord = ledger.get(key) ?? {
    email: email.toLowerCase(),
    product,
    credits: 0,
    orderIds: [],
    updatedAt: new Date().toISOString(),
  };
  if (rec.orderIds.includes(orderId)) {
    return { granted: false, credits: rec.credits };
  }
  rec.orderIds.push(orderId);
  rec.credits += PRODUCTS[product].creditsPerOrder;
  rec.updatedAt = new Date().toISOString();
  ledger.set(key, rec);
  return { granted: true, credits: rec.credits };
}

function consumeCreditMem(
  email: string,
  product: BillingProductKey,
): { ok: boolean; remaining: number } {
  const rec = ledger.get(ledgerKey(email, product));
  if (!rec || rec.credits <= 0) {
    return { ok: false, remaining: rec?.credits ?? 0 };
  }
  rec.credits -= 1;
  rec.updatedAt = new Date().toISOString();
  return { ok: true, remaining: rec.credits };
}

function creditsForMem(email: string): {
  email: string;
  products: Record<BillingProductKey, number>;
} {
  const norm = email.toLowerCase();
  return {
    email: norm,
    products: {
      rescan: ledger.get(`${norm}|rescan`)?.credits ?? 0,
      audit: ledger.get(`${norm}|audit`)?.credits ?? 0,
    },
  };
}

function refundCreditsMem(orderId: string): boolean {
  for (const rec of ledger.values()) {
    const idx = rec.orderIds.indexOf(orderId);
    if (idx !== -1) {
      rec.orderIds.splice(idx, 1);
      rec.credits = Math.max(
        0,
        rec.credits - PRODUCTS[rec.product].creditsPerOrder,
      );
      rec.updatedAt = new Date().toISOString();
      return true;
    }
  }
  return false;
}

/* ---------------- Supabase-backed operations ---------------- */

/**
 * Idempotent grant: the same Lemon Squeezy order id never double-credits.
 * Idempotency key = LS order id (§1.5). Atomic via the
 * `billing.grant_credits` RPC — safe under webhook redelivery and
 * concurrent deliveries alike.
 */
export async function grantCredits(
  email: string,
  product: BillingProductKey,
  orderId: string,
): Promise<{ granted: boolean; credits: number }> {
  const db = billingDb();
  if (!db) return grantCreditsMem(email, product, orderId);
  const { data, error } = await billingSchema(db).rpc('grant_credits', {
    p_email: email.toLowerCase(),
    p_product: product,
    p_credits: PRODUCTS[product].creditsPerOrder,
    p_order_id: orderId,
  });
  if (error) throw error;
  const row = (data as Array<{ granted: boolean; credits: number }> | null)?.[0];
  if (!row) throw new Error('grant_credits returned no row');
  return { granted: row.granted, credits: row.credits };
}

/**
 * Spend one credit. Returns { ok: false } (402 upstream) when the balance
 * is 0. Atomic via `billing.consume_credit` — two racing spends can't
 * both take the last credit.
 */
export async function consumeCredit(
  email: string,
  product: BillingProductKey,
): Promise<{ ok: boolean; remaining: number }> {
  const db = billingDb();
  if (!db) return consumeCreditMem(email, product);
  const { data, error } = await billingSchema(db).rpc('consume_credit', {
    p_email: email.toLowerCase(),
    p_product: product,
  });
  if (error) throw error;
  const row = (data as Array<{ ok: boolean; remaining: number }> | null)?.[0];
  if (!row) throw new Error('consume_credit returned no row');
  return { ok: row.ok, remaining: row.remaining };
}

export async function creditsFor(email: string): Promise<{
  email: string;
  products: Record<BillingProductKey, number>;
}> {
  const db = billingDb();
  if (!db) return creditsForMem(email);
  const norm = email.toLowerCase();
  const { data, error } = await billingSchema(db)
    .from('credit_ledger')
    .select('product, credits')
    .eq('email', norm)
    .in('product', ['rescan', 'audit']);
  if (error) throw error;
  const products: Record<BillingProductKey, number> = { rescan: 0, audit: 0 };
  for (const row of (data as Array<{ product: string; credits: number }>) ?? []) {
    if (row.product === 'rescan' || row.product === 'audit') {
      products[row.product] = row.credits;
    }
  }
  return { email: norm, products };
}

/**
 * Claw back the grant for a refunded order. Unknown orders are a no-op
 * (idempotent — the webhook still answers 200 so Polar stops retrying).
 */
export async function refundCredits(orderId: string): Promise<boolean> {
  const db = billingDb();
  if (!db) return refundCreditsMem(orderId);
  const schema = billingSchema(db);
  // Find which product this order granted, so the clawback removes the
  // right number of credits (PRODUCTS.creditsPerOrder is app config).
  const { data: holder, error: holderError } = await schema
    .from('credit_ledger')
    .select('product')
    .contains('order_ids', [orderId])
    .limit(1)
    .maybeSingle();
  if (holderError) throw holderError;
  if (!holder) return false;
  const product = (holder as { product: string }).product as BillingProductKey;
  if (!isProductKey(product)) return false;
  const { data, error } = await schema.rpc('refund_credits', {
    p_order_id: orderId,
    p_credits: PRODUCTS[product].creditsPerOrder,
  });
  if (error) throw error;
  return data === true;
}

/** Test seam — wipes in-memory billing state. Never called in production. */
export function _resetBillingState(): void {
  ledger.clear();
}

/* ------------------------------------------------------------------ */
/* Webhook event application (pure, unit-tested)                        */
/* ------------------------------------------------------------------ */

export type WebhookOutcome =
  | { handled: true; action: 'granted' | 'duplicate' | 'refunded' }
  | { handled: false; reason: string };

/**
 * Apply a verified Lemon Squeezy event to the ledger.
 * - order_created  → grant credits (idempotent on the LS order id)
 * - order_refunded → claw the grant back (floored at 0)
 * - anything else  → ignored, honestly reported as such
 *
 * Buyer identity: `meta.custom_data` (echoed from our checkout request)
 * first, `data.attributes.user_email` as fallback. The product comes from
 * custom_data — never from the order's variant name, which is display copy.
 */
export async function applyBillingEvent(payload: any): Promise<WebhookOutcome> {
  const eventName = payload?.meta?.event_name;
  const data = payload?.data;
  if (typeof eventName !== 'string' || !data) {
    return { handled: false, reason: 'malformed_event' };
  }

  if (eventName === 'order_created') {
    const custom = payload?.meta?.custom_data ?? {};
    const product = custom.product;
    if (!isProductKey(product)) {
      return { handled: false, reason: 'unknown_product' };
    }
    const email = (
      custom.email ??
      data?.attributes?.user_email ??
      ''
    )
      .toString()
      .trim();
    if (!email) return { handled: false, reason: 'missing_email' };
    const orderId = String(data.id);
    const { granted } = await grantCredits(email, product, orderId);
    return { handled: true, action: granted ? 'granted' : 'duplicate' };
  }

  if (eventName === 'order_refunded') {
    const orderId = String(data.id);
    await refundCredits(orderId);
    // Order unknown to us — idempotent no-op, still a 200 to stop retries.
    return { handled: true, action: 'refunded' };
  }

  return { handled: false, reason: `ignored:${eventName}` };
}
