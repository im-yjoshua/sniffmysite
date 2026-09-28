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
 *   - Fulfillment is last-paid-wins: a stale checkout (created before a
 *     dethroning) still takes the throne at its quoted price — the buyer
 *     paid what we asked, and the "+$3" rule is a quoting rule, not a
 *     fulfillment ambush.
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
  price_cents: number;
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
   */
  claim(input: NewThroneBid, now?: Date): Promise<'installed' | 'duplicate'>;
  /**
   * Vacate the throne when the holding order is refunded. Returns true
   * when the refunded order actually held the throne.
   */
  vacateOnRefund(orderId: string): Promise<boolean>;
}

/** In-process mutex — serializes concurrent webhook deliveries so two
 *  order.paid events can't interleave a read-modify-write on the throne. */
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
        const existing = await bids()
          .select('order_id')
          .eq('order_id', input.order_id)
          .maybeSingle();
        if (existing.error) throw existing.error;
        if (existing.data) return 'duplicate';

        const expiresAt = new Date(now.getTime() + THRONE_HOLD_MS).toISOString();
        const { error: bidError } = await bids().insert({
          order_id: input.order_id,
          url: input.url,
          domain: input.domain,
          price_cents: input.price_cents,
          score: input.score,
          tier: input.tier,
          roast: input.roast,
          buyer_email: input.buyer_email,
          paid_at: now.toISOString(),
          expires_at: expiresAt,
          status: 'holding',
        });
        if (bidError) {
          if ((bidError as { code?: string }).code === '23505') return 'duplicate';
          throw bidError;
        }

        // Dethrone whoever holds it (if anyone), then install the new holder.
        const current = await readState(now);
        if (current.holder) {
          await bids()
            .update({ status: 'dethroned' })
            .eq('order_id', current.holder.order_id)
            .eq('status', 'holding');
        }
        const { error: stateError } = await state()
          .update({
            order_id: input.order_id,
            url: input.url,
            domain: input.domain,
            price_cents: input.price_cents,
            score: input.score,
            tier: input.tier,
            roast: input.roast,
            held_since: now.toISOString(),
            expires_at: expiresAt,
            updated_at: now.toISOString(),
          })
          .eq('id', 1);
        if (stateError) throw stateError;
        return 'installed';
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
        await bids()
          .update({ status: 'refunded' })
          .eq('order_id', orderId);

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
    vacateOnRefund: (orderId: string) =>
      mutex(async () => {
        const row = bidRows.get(orderId);
        if (!row) return false;
        row.status = 'refunded';
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

export type ThroneFulfillOutcome =
  | { handled: true; action: 'fulfilled' | 'duplicate'; orderId: string; slug: string | null }
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
 * scan (identical v2 engine — payment never changes the score) → install
 * the new holder, dethroning whoever holds it. Idempotent on the Polar
 * order id.
 */
export async function applyThroneOrderPaid(
  event: Extract<ParsedPolarEvent, { ok: true }>,
  deps: { store: ThroneStore; scan: PriorityScanFn },
  now: Date = new Date(),
): Promise<ThroneFulfillOutcome> {
  const { orderId, order } = event;

  let store: ThroneStore;
  try {
    store = deps.store;
    const existing = await store.findBid(orderId);
    if (existing) {
      return { handled: true, action: 'duplicate', orderId, slug: null };
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
        score: scan.sniff_score,
        tier: scan.tier,
        roast,
        buyer_email: extractBuyerEmail(order),
      },
      now,
    );
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
