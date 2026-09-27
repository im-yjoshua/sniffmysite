import { getSupabase } from './supabase';
import {
  extractBuyerEmail,
  extractWebsiteUrl,
  type ParsedPolarEvent,
} from './polar';

/**
 * Featured Roast fulfillment (Phase A1).
 *
 * The $19 one-time product: buyer pays on Polar's hosted checkout, Polar
 * fires order.paid at our webhook, and we: validate the website-url custom
 * field → run a priority scan (same v2 engine, no budget gate — it's paid)
 * → publish the roast → pin it on the standings for 7 days.
 *
 * Rules (locked):
 *   - Idempotent on the Polar order id — retries and double-deliveries
 *     never create a second row or a second scan.
 *   - Payment never changes the score: the engine scores what it sees.
 *   - A refund revokes the pin only; the roast stays as history.
 *   - Checkout query params (?checkout_id=…) are display-only and are
 *     NEVER treated as proof of payment — fulfillment is webhook-driven.
 */

export interface FeaturedRoastRow {
  id: string;
  order_id: string;
  url: string;
  slug: string | null;
  score: number | null;
  tier: string | null;
  roast: unknown;
  buyer_email: string | null;
  paid_at: string;
  expires_at: string;
  status: 'active' | 'expired' | 'refunded';
}

export interface NewFeaturedRoast {
  order_id: string;
  url: string;
  slug: string | null;
  score: number;
  tier: string;
  roast: unknown;
  buyer_email: string | null;
  expires_at: string;
}

/** Thrown by insert() when the order id is already fulfilled. */
export class FeaturedDuplicateError extends Error {
  constructor(orderId: string) {
    super(`featured roast already exists for order ${orderId}`);
    this.name = 'FeaturedDuplicateError';
  }
}

export interface FeaturedStore {
  findByOrderId(orderId: string): Promise<FeaturedRoastRow | null>;
  /** Insert; throws FeaturedDuplicateError on order_id conflict. */
  insert(row: NewFeaturedRoast): Promise<FeaturedRoastRow>;
  /** Set status='refunded' where currently active. True when a row changed. */
  revoke(orderId: string): Promise<boolean>;
  /** The currently pinned roast, if any. */
  getActive(now?: Date): Promise<FeaturedRoastRow | null>;
}

/** Production store: Supabase `billing.featured_roasts` via service role. */
export function supabaseFeaturedStore(): FeaturedStore {
  const table = () => getSupabase().schema('billing').from('featured_roasts');
  return {
    async findByOrderId(orderId) {
      const { data, error } = await table()
        .select('*')
        .eq('order_id', orderId)
        .maybeSingle();
      if (error) throw error;
      return (data as FeaturedRoastRow | null) ?? null;
    },
    async insert(row) {
      const { data, error } = await table().insert(row).select('*').single();
      if (error) {
        // 23505 = unique violation on order_id → a retry racing us.
        if ((error as { code?: string }).code === '23505') {
          throw new FeaturedDuplicateError(row.order_id);
        }
        throw error;
      }
      return data as FeaturedRoastRow;
    },
    async revoke(orderId) {
      const { data, error } = await table()
        .update({ status: 'refunded' })
        .eq('order_id', orderId)
        .eq('status', 'active')
        .select('id');
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },
    async getActive(now = new Date()) {
      const { data, error } = await table()
        .select('*')
        .eq('status', 'active')
        .gt('expires_at', now.toISOString())
        .order('paid_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as FeaturedRoastRow | null) ?? null;
    },
  };
}

/** In-memory store — tests only. */
export function memoryFeaturedStore(): FeaturedStore {
  const rows = new Map<string, FeaturedRoastRow>();
  let seq = 0;
  return {
    async findByOrderId(orderId) {
      return rows.get(orderId) ?? null;
    },
    async insert(row) {
      if (rows.has(row.order_id)) throw new FeaturedDuplicateError(row.order_id);
      const full: FeaturedRoastRow = {
        id: `fr_${++seq}`,
        paid_at: new Date().toISOString(),
        status: 'active',
        ...row,
      };
      rows.set(row.order_id, full);
      return full;
    },
    async revoke(orderId) {
      const row = rows.get(orderId);
      if (!row || row.status !== 'active') return false;
      row.status = 'refunded';
      return true;
    },
    async getActive(now = new Date()) {
      const iso = now.toISOString();
      const actives = [...rows.values()]
        .filter((r) => r.status === 'active' && r.expires_at > iso)
        .sort((a, b) => (a.paid_at < b.paid_at ? 1 : -1));
      return actives[0] ?? null;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Fulfillment                                                         */
/* ------------------------------------------------------------------ */

export interface PriorityScanResult {
  finalUrl: string;
  sniff_score: number;
  tier: string;
  verdict: string;
  scanned_at: string;
}

/** Runs the paid priority scan. Injected so tests don't hit the network. */
export type PriorityScanFn = (url: string) => Promise<PriorityScanResult>;

export type FulfillOutcome =
  | { handled: true; action: 'fulfilled' | 'duplicate'; orderId: string; slug: string | null }
  | { handled: false; reason: 'invalid_url' | 'missing_url'; retryable: false }
  | { handled: false; reason: 'scan_failed' | 'store_unavailable'; retryable: true };

export type RefundOutcome =
  | { handled: true; action: 'refunded' | 'already_gone'; orderId: string }
  | { handled: false; reason: 'unknown_order' | 'store_unavailable'; retryable: boolean };

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function slugOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

/**
 * Fulfill an order.paid event. Idempotent on the Polar order id: if the
 * row already exists we return `duplicate` WITHOUT re-scanning.
 *
 * Retryable failures (scan fetch blew up, store unreachable) are marked
 * so the route can answer 500 and let Polar redeliver. Permanent problems
 * (bad URL) are answered 200 — retrying garbage helps nobody.
 */
export async function applyPolarOrderPaid(
  event: Extract<ParsedPolarEvent, { ok: true }>,
  deps: { store: FeaturedStore; scan: PriorityScanFn },
  now: Date = new Date(),
): Promise<FulfillOutcome> {
  const { orderId, order } = event;

  let store: FeaturedStore;
  try {
    store = deps.store;
    const existing = await store.findByOrderId(orderId);
    if (existing) {
      return { handled: true, action: 'duplicate', orderId, slug: existing.slug };
    }
  } catch {
    return { handled: false, reason: 'store_unavailable', retryable: true };
  }

  const urlRes = extractWebsiteUrl(order);
  if (!urlRes.ok) {
    return { handled: false, reason: urlRes.reason, retryable: false };
  }

  let scan: PriorityScanResult;
  try {
    scan = await deps.scan(urlRes.url);
  } catch {
    return { handled: false, reason: 'scan_failed', retryable: true };
  }

  const slug = slugOf(scan.finalUrl);
  const roast = {
    verdict: scan.verdict,
    tier: scan.tier,
    score: scan.sniff_score,
    scanned_at: scan.scanned_at,
  };
  try {
    const row = await store.insert({
      order_id: orderId,
      url: scan.finalUrl,
      slug,
      score: scan.sniff_score,
      tier: scan.tier,
      roast,
      buyer_email: extractBuyerEmail(order),
      expires_at: new Date(now.getTime() + SEVEN_DAYS_MS).toISOString(),
    });
    return { handled: true, action: 'fulfilled', orderId, slug: row.slug };
  } catch (err) {
    // Lost a race with a concurrent delivery of the same order — the
    // other delivery won, so this one is a duplicate, not a failure.
    if (err instanceof FeaturedDuplicateError) {
      return { handled: true, action: 'duplicate', orderId, slug };
    }
    return { handled: false, reason: 'store_unavailable', retryable: true };
  }
}

/**
 * Fulfill an order.refunded event: revoke the pin. The roast row stays as
 * history (status='refunded'), so the card simply stops appearing.
 */
export async function applyPolarOrderRefunded(
  orderId: string,
  deps: { store: FeaturedStore },
): Promise<RefundOutcome> {
  const { store } = deps;
  try {
    const revoked = await store.revoke(orderId);
    return {
      handled: true,
      action: revoked ? 'refunded' : 'already_gone',
      orderId,
    };
  } catch {
    return { handled: false, reason: 'store_unavailable', retryable: true };
  }
}
