import { getSupabase } from './supabase';

/**
 * The Throne — the paid spotlight above the standings, sold as an auction
 * (Phase B7).
 *
 * Mechanics (locked 2026-09-28):
 *   - Opening bid $19 (1900¢). Each new bid must top the current holder
 *     by at least $3 (300¢) — enforced when the Polar checkout session is
 *     created, which is the only place a price is quoted.
 *   - A paid bid takes the throne IMMEDIATELY, dethroning the holder.
 *     Otherwise the holder keeps it until expires_at (3 days from payment).
 *   - Stale quotes are rejected, not honored: the +$3 rule is enforced at
 *     checkout creation AND re-checked inside the atomic claim against
 *     the live minimum. A quote that fell below it while the buyer was
 *     paying is recorded as 'stale', never installed, and refunded in
 *     full automatically (reconciled with Polar first, so redeliveries
 *     can't double-refund). Money is never kept for nothing.
 *   - A refund of the holding order vacates the throne; the price resets
 *     to the $19 floor.
 *   - Money buys the spotlight only. Scores and rankings are never
 *     touched — the engine scores what it sees.
 *
 * State: `billing.throne_bids` (one row per paid bid, order_id is the
 * idempotency key) + `billing.throne_state` (singleton row, id = 1, the
 * current holder). Expiry is lazy: getStatus() treats an expired holder
 * as vacant and marks the bid row expired — no cron needed.
 */

export const THRONE_FLOOR_CENTS = 1900;
export const THRONE_INCREMENT_CENTS = 300;
export const THRONE_HOLD_MS = 3 * 24 * 60 * 60 * 1000;

export interface ThroneHolder {
  order_id: string;
  url: string;
  domain: string;
  price_cents: number;
  score: number | null;
  tier: string | null;
  roast: unknown;
  held_since: string;
  expires_at: string;
}

export interface ThroneStatus {
  occupied: boolean;
  holder: ThroneHolder | null;
  /** Minimum cents the next bid must be (floor when the throne is empty). */
  min_bid_cents: number;
  floor_cents: number;
  increment_cents: number;
}

export interface NewThroneBid {
  order_id: string;
  url: string;
  domain: string;
  /** What the buyer actually paid (cents). */
  price_cents: number;
  /** What we quoted at checkout creation (cents). The staleness check
   *  runs against the quote: the +$3 rule applied when they were quoted,
   *  not when Polar settled. */
  quoted_cents: number;
  score: number;
  tier: string;
  roast: unknown;
  buyer_email: string | null;
}

/** Thrown by claim() when the order id is already fulfilled. */
export class ThroneDuplicateError extends Error {
  constructor(orderId: string) {
    super(`throne bid already exists for order ${orderId}`);
    this.name = 'ThroneDuplicateError';
  }
}

export interface ThroneStore {
  getStatus(now?: Date): Promise<ThroneStatus>;
  findBid(orderId: string): Promise<{ order_id: string; status: string } | null>;
  /**
   * Install a new holder, dethroning the current one. Idempotent on
   * order_id — returns 'duplicate' instead of double-fulfilling.
   * Returns 'stale' when the quoted price fell below the live minimum
   * inside the transaction: the bid is recorded as stale, never
   * installed, and the caller refunds it.
   */
  claim(input: NewThroneBid, now?: Date): Promise<'installed' | 'duplicate' | 'stale'>;
  /**
   * Mark a stale bid refunded after the Polar refund reconciled.
   * Only transitions 'stale' → 'stale_refunded'.
   */
  confirmStaleRefund(orderId: string): Promise<void>;
  /**
   * Vacate the throne when the holding order is refunded. Returns true
   * when the refunded order actually held the throne.
   */
  vacateOnRefund(orderId: string): Promise<boolean>;
}

/** In-process mutex — a cheap local serializer so one instance doesn't
 *  hammer the claim RPC concurrently. The real guarantee is the row lock
 *  inside billing.claim_throne (007): it serializes across instances. */
function makeMutex() {
  let tail: Promise<void> = Promise.resolve();
  return async function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const head = tail;
    let release!: () => void;
    tail = new Promise<void>((r) => (release = r));
    await head;
    try {
      return await fn();
    } finally {
      release();
    }
  };
}

/** Production store: Supabase billing.throne_* via service role. */
export function supabaseThroneStore(): ThroneStore {
  const bids = () => getSupabase().schema('billing').from('throne_bids');
  const state = () => getSupabase().schema('billing').from('throne_state');
  const mutex = makeMutex();

  /** Read the singleton; lazily expire a holder whose time ran out. */
  async function readState(now: Date): Promise<ThroneStatus> {
    const { data, error } = await state()
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (error) throw error;
    const row = data as {
      order_id: string | null;
      url: string | null;
      domain: string | null;
      price_cents: number;
      score: number | null;
      tier: string | null;
      roast: unknown;
      held_since: string | null;
      expires_at: string | null;
    } | null;

    if (
      row?.order_id &&
      row.expires_at &&
      Date.parse(row.expires_at) > now.getTime()
    ) {
      const holder: ThroneHolder = {
        order_id: row.order_id,
        url: row.url ?? '',
        domain: row.domain ?? '',
        price_cents: row.price_cents,
        score: row.score,
        tier: row.tier,
        roast: row.roast,
        held_since: row.held_since ?? now.toISOString(),
        expires_at: row.expires_at,
      };
      return {
        occupied: true,
        holder,
        min_bid_cents: row.price_cents + THRONE_INCREMENT_CENTS,
        floor_cents: THRONE_FLOOR_CENTS,
        increment_cents: THRONE_INCREMENT_CENTS,
      };
    }

    // Vacant or expired. Mark a lapsed bid expired so history stays honest.
    if (row?.order_id) {
      await bids()
        .update({ status: 'expired' })
        .eq('order_id', row.order_id)
        .eq('status', 'holding');
      await state().update({
        order_id: null,
        url: null,
        domain: null,
        price_cents: THRONE_FLOOR_CENTS,
        score: null,
        tier: null,
        roast: null,
        held_since: null,
        expires_at: null,
        updated_at: now.toISOString(),
      }).eq('id', 1);
    }
    return {
      occupied: false,
      holder: null,
      min_bid_cents: THRONE_FLOOR_CENTS,
      floor_cents: THRONE_FLOOR_CENTS,
      increment_cents: THRONE_INCREMENT_CENTS,
    };
  }

  return {
    getStatus: (now = new Date()) => readState(now),

    async findBid(orderId: string) {
      const { data, error } = await bids()
        .select('order_id,status')
        .eq('order_id', orderId)
        .maybeSingle();
      if (error) throw error;
      return (data as { order_id: string; status: string } | null) ?? null;
    },

    claim: (input, now = new Date()) =>
      mutex(async () => {
        // One transaction behind SELECT ... FOR UPDATE on the singleton
        // row (see supabase/007_throne_claim_rpc.sql): the mutex only
        // serializes this Node process, the row lock serializes everything.
        // Because insert + dethrone + install are atomic, a crash can no
        // longer leave a paid buyer permanently uninstalled.
        const expiresAt = new Date(now.getTime() + THRONE_HOLD_MS);
        const { data, error } = await getSupabase()
          .schema('billing')
          .rpc('claim_throne', {
            p_order_id: input.order_id,
            p_url: input.url,
            p_domain: input.domain,
            p_price_cents: input.price_cents,
            p_quoted_cents: input.quoted_cents,
            p_score: input.score,
            p_tier: input.tier,
            p_roast: input.roast,
            p_buyer_email: input.buyer_email,
            p_now: now.toISOString(),
            p_expires_at: expiresAt.toISOString(),
          });
        if (error) throw error;
        if (data !== 'installed' && data !== 'duplicate' && data !== 'stale') {
          throw new Error(`unexpected claim_throne result: ${String(data)}`);
        }
        return data;
      }),

    confirmStaleRefund: (orderId: string) =>
      mutex(async () => {
        const { error } = await bids()
          .update({ status: 'stale_refunded' })
          .eq('order_id', orderId)
          .eq('status', 'stale');
        if (error) throw error;
      }),

    vacateOnRefund: (orderId: string) =>
      mutex(async () => {
        const now = new Date();
        const { data: bid, error: bidError } = await bids()
          .select('order_id,status')
          .eq('order_id', orderId)
          .maybeSingle();
        if (bidError) throw bidError;
        if (!bid) return false;
        // A stale bid refunded by the stale-bid flow keeps its audit
        // trail ('stale_refunded'); it never held the throne anyway.
        if ((bid as { status: string }).status !== 'stale_refunded') {
          await bids()
            .update({ status: 'refunded' })
            .eq('order_id', orderId);
        }

        const current = await readState(now);
        if (current.holder?.order_id === orderId) {
          await state()
            .update({
              order_id: null,
              url: null,
              domain: null,
              price_cents: THRONE_FLOOR_CENTS,
              score: null,
              tier: null,
              roast: null,
              held_since: null,
              expires_at: null,
              updated_at: now.toISOString(),
            })
            .eq('id', 1);
          return true;
        }
        return false;
      }),
  };
}

/** In-memory store — tests only. Mirrors the Supabase behavior exactly. */
export function memoryThroneStore(): ThroneStore {
  const bidRows = new Map<string, { status: string }>();
  let holder: ThroneHolder | null = null;
  const mutex = makeMutex();

  function status(now: Date): ThroneStatus {
    if (holder && Date.parse(holder.expires_at) > now.getTime()) {
      return {
        occupied: true,
        holder,
        min_bid_cents: holder.price_cents + THRONE_INCREMENT_CENTS,
        floor_cents: THRONE_FLOOR_CENTS,
        increment_cents: THRONE_INCREMENT_CENTS,
      };
    }
    if (holder) {
      const row = bidRows.get(holder.order_id);
      if (row && row.status === 'holding') row.status = 'expired';
      holder = null;
    }
    return {
      occupied: false,
      holder: null,
      min_bid_cents: THRONE_FLOOR_CENTS,
      floor_cents: THRONE_FLOOR_CENTS,
      increment_cents: THRONE_INCREMENT_CENTS,
    };
  }

  return {
    async getStatus(now = new Date()) {
      return status(now);
    },
    async findBid(orderId: string) {
      const row = bidRows.get(orderId);
      return row ? { order_id: orderId, status: row.status } : null;
    },
    claim: (input, now = new Date()) =>
      mutex(async () => {
        if (bidRows.has(input.order_id)) return 'duplicate';
        const expiresAt = new Date(now.getTime() + THRONE_HOLD_MS).toISOString();
        // Mirror of the SQL staleness check: the live minimum at this
        // moment — the holder's price + $3 while they hold it, else the
        // $19 floor. A stale quote is recorded, never installed.
        const holderLive =
          holder !== null && Date.parse(holder.expires_at) > now.getTime();
        const liveMin = holderLive
          ? (holder as ThroneHolder).price_cents + THRONE_INCREMENT_CENTS
          : THRONE_FLOOR_CENTS;
        if (input.quoted_cents < liveMin) {
          bidRows.set(input.order_id, { status: 'stale' });
          return 'stale';
        }
        bidRows.set(input.order_id, { status: 'holding' });
        if (holder) {
          const prev = bidRows.get(holder.order_id);
          if (prev && prev.status === 'holding') prev.status = 'dethroned';
        }
        holder = {
          order_id: input.order_id,
          url: input.url,
          domain: input.domain,
          price_cents: input.price_cents,
          score: input.score,
          tier: input.tier,
          roast: input.roast,
          held_since: now.toISOString(),
          expires_at: expiresAt,
        };
        return 'installed';
      }),
    async confirmStaleRefund(orderId: string) {
      const row = bidRows.get(orderId);
      if (row && row.status === 'stale') row.status = 'stale_refunded';
    },
    vacateOnRefund: (orderId: string) =>
      mutex(async () => {
        const row = bidRows.get(orderId);
        if (!row) return false;
        if (row.status !== 'stale_refunded') row.status = 'refunded';
        if (holder?.order_id === orderId) {
          holder = null;
          return true;
        }
        return false;
      }),
  };
}

/** Presentational helper: cents → "$22". */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

/* ------------------------------------------------------------------ */
/* Webhook fulfillment                                                 */
/* ------------------------------------------------------------------ */

import {
  extractBuyerEmail,
  extractWebsiteUrl,
  type ParsedPolarEvent,
} from './polar';
import type { PriorityScanFn } from './featured';
import type { PolarRefundClient } from './polarRefund';

export type ThroneFulfillOutcome =
  | { handled: true; action: 'fulfilled' | 'duplicate'; orderId: string; slug: string | null }
  | { handled: true; action: 'stale_refunded'; orderId: string; refunded_cents: number }
  | { handled: false; reason: string; retryable: boolean };

export type ThroneRefundOutcome =
  | { handled: true; action: 'vacated' | 'not_holder'; orderId: string }
  | { handled: false; reason: string; retryable: boolean };

function slugOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

/**
 * What we quoted the buyer at checkout creation (cents) — the number
 * the +$3 rule was applied to. Read from the metadata stamp first; falls
 * back to the settled total, then the floor. Never NaN, never negative.
 */
export function extractQuotedCents(order: Record<string, unknown>): number {
  const candidates = [
    (order.metadata as Record<string, unknown> | undefined)?.throne_price_cents,
    order.total_amount,
    order.amount,
  ];
  for (const c of candidates) {
    const n = typeof c === 'string' ? Number(c) : c;
    if (typeof n === 'number' && Number.isFinite(n) && n > 0) {
      return Math.round(n);
    }
  }
  return THRONE_FLOOR_CENTS;
}

/**
 * What the buyer actually paid, in cents. Prefers the order's own total;
 * falls back to the quoted price we stamped in metadata, then the floor.
 * Never NaN, never negative — a garbage amount degrades to the floor
 * rather than failing fulfillment for a paid order.
 */
export function extractOrderCents(order: Record<string, unknown>): number {
  const candidates = [
    order.total_amount,
    order.amount,
    (order.metadata as Record<string, unknown> | undefined)?.throne_price_cents,
  ];
  for (const c of candidates) {
    const n = typeof c === 'string' ? Number(c) : c;
    if (typeof n === 'number' && Number.isFinite(n) && n > 0) {
      return Math.round(n);
    }
  }
  return THRONE_FLOOR_CENTS;
}

/**
 * order.paid for a throne bid: validate the site URL → run the priority
 * scan (identical v2 engine — payment never changes the score) → claim
 * the throne atomically. A claim whose quote went stale (the throne
 * moved past it while the buyer was paying) is never installed: the bid
 * is recorded as stale and refunded in full via Polar, reconciling first
 * so a redelivered webhook can't double-refund. Idempotent on the Polar
 * order id throughout.
 */
export async function applyThroneOrderPaid(
  event: Extract<ParsedPolarEvent, { ok: true }>,
  deps: { store: ThroneStore; scan: PriorityScanFn; refund: PolarRefundClient },
  now: Date = new Date(),
): Promise<ThroneFulfillOutcome> {
  const { orderId, order } = event;

  let store: ThroneStore;
  try {
    store = deps.store;
    const existing = await store.findBid(orderId);
    if (existing && existing.status !== 'stale') {
      return { handled: true, action: 'duplicate', orderId, slug: null };
    }
    // A redelivered webhook for a bid already judged stale: reconcile the
    // refund instead of re-deciding.
    if (existing?.status === 'stale') {
      return refundStaleBid(store, deps.refund, orderId, extractOrderCents(order));
    }
  } catch {
    return { handled: false, reason: 'store_unavailable', retryable: true };
  }

  const urlRes = extractWebsiteUrl(order);
  if (!urlRes.ok) {
    return { handled: false, reason: urlRes.reason, retryable: false };
  }

  let scan: Awaited<ReturnType<PriorityScanFn>>;
  try {
    scan = await deps.scan(urlRes.url);
  } catch {
    return { handled: false, reason: 'scan_failed', retryable: true };
  }

  const priceCents = extractOrderCents(order);
  const quotedCents = extractQuotedCents(order);
  const slug = slugOf(scan.finalUrl);
  const roast = {
    verdict: scan.verdict,
    tier: scan.tier,
    score: scan.sniff_score,
    scanned_at: scan.scanned_at,
  };
  try {
    const outcome = await store.claim(
      {
        order_id: orderId,
        url: scan.finalUrl,
        domain: slug ?? scan.finalUrl,
        price_cents: priceCents,
        quoted_cents: quotedCents,
        score: scan.sniff_score,
        tier: scan.tier,
        roast,
        buyer_email: extractBuyerEmail(order),
      },
      now,
    );
    if (outcome === 'stale') {
      return refundStaleBid(store, deps.refund, orderId, priceCents);
    }
    return {
      handled: true,
      action: outcome === 'duplicate' ? 'duplicate' : 'fulfilled',
      orderId,
      slug,
    };
  } catch {
    return { handled: false, reason: 'store_unavailable', retryable: true };
  }
}

/**
 * Refund a stale throne bid in full. Reconciles with Polar first: when a
 * refund is already pending/succeeded there, we just mark our row — so a
 * redelivered webhook (or a crash between refund and mark) can never
 * double-refund. Failures are retryable: Polar redelivers the webhook and
 * the whole path runs again idempotently.
 */
async function refundStaleBid(
  store: ThroneStore,
  refund: PolarRefundClient,
  orderId: string,
  priceCents: number,
): Promise<ThroneFulfillOutcome> {
  try {
    await refund.refundOrder(orderId, priceCents);
    await store.confirmStaleRefund(orderId);
    return { handled: true, action: 'stale_refunded', orderId, refunded_cents: priceCents };
  } catch {
    return { handled: false, reason: 'refund_failed', retryable: true };
  }
}

/**
 * order.refunded for a throne bid: the bid row is marked refunded; when
 * the refunded order holds the throne, the throne is vacated and the
 * price resets to the $19 floor. The roast stays as history either way.
 */
export async function applyThroneOrderRefunded(
  orderId: string,
  deps: { store: ThroneStore },
): Promise<ThroneRefundOutcome> {
  try {
    const vacated = await deps.store.vacateOnRefund(orderId);
    return {
      handled: true,
      action: vacated ? 'vacated' : 'not_holder',
      orderId,
    };
  } catch {
    return { handled: false, reason: 'store_unavailable', retryable: true };
  }
}
